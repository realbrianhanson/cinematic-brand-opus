import { afterEach, describe, expect, it, vi } from "vitest";
import { dispatchGenerationRequest } from "../../../supabase/functions/_shared/generationDispatch";

const original = {
  id: "job-1",
  status: "running",
  updated_at: "2026-09-25T12:00:00Z",
  completed_count: 2,
};
function fixture() {
  let current = { ...original };
  const recorded: string[] = [];
  const readSnapshot = vi.fn(async () => ({ ...current }));
  const markStalled = vi.fn(
    async (expected: typeof original, message: string) => {
      if (
        current.status === expected.status &&
        current.updated_at === expected.updated_at &&
        current.completed_count === expected.completed_count
      ) {
        current = { ...current, status: "stalled" };
        recorded.push(message);
      }
    },
  );
  return {
    readSnapshot,
    markStalled,
    recorded,
    change: (patch: Partial<typeof original>) => {
      current = { ...current, ...patch };
    },
    current: () => current,
  };
}
const request = {
  url: "https://example.test/functions/v1/generate-content",
  headers: { "x-job-step": "true" },
  payload: { job_id: "job-1", current_index: 2 },
  expectedStatus: "running" as const,
  expectedCompleted: 2,
  label: "item 3",
};
afterEach(() => vi.useRealTimers());
describe("generation dispatch", () => {
  it.each([401, 429, 503])(
    "records HTTP %i immediately without retrying work",
    async (status) => {
      const store = fixture();
      const fetcher = vi.fn(
        async () => new Response("provider body must not leak", { status }),
      );
      await dispatchGenerationRequest({ ...request, ...store, fetcher });
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(store.recorded).toHaveLength(1);
      expect(store.recorded[0]).toContain(`HTTP ${status}`);
      expect(store.recorded[0]).not.toContain("provider body");
    },
  );
  it("does not stall an acknowledged request", async () => {
    const store = fixture();
    await dispatchGenerationRequest({
      ...request,
      ...store,
      fetcher: async () => new Response(null, { status: 202 }),
    });
    expect(store.markStalled).not.toHaveBeenCalled();
  });
  it("bounds a hung transport even when it ignores AbortSignal and reports uncertainty", async () => {
    vi.useFakeTimers();
    const store = fixture();
    let signal: AbortSignal | undefined;
    const pending = dispatchGenerationRequest({
      ...request,
      ...store,
      timeoutMs: 50,
      fetcher: async (_url, init) => {
        signal = init?.signal as AbortSignal;
        return new Promise<Response>(() => {});
      },
    });
    await vi.advanceTimersByTimeAsync(51);
    await pending;
    expect(signal?.aborted).toBe(true);
    expect(store.recorded[0]).toMatch(/not confirmed.*check.*before resuming/i);
  });
  it.each([
    { status: "cancelled" },
    { status: "completed" },
    { updated_at: "2026-09-25T12:01:00Z", completed_count: 3 },
    { updated_at: "2026-09-25T12:02:00Z" },
  ])("preserves changed job state on a late failure: %j", async (patch) => {
    const store = fixture();
    await dispatchGenerationRequest({
      ...request,
      ...store,
      fetcher: async () => {
        store.change(patch);
        return new Response(null, { status: 503 });
      },
    });
    expect(store.recorded).toEqual([]);
    expect(store.current()).toMatchObject(patch);
  });
  it("does not dispatch a stale step after progress or cancellation", async () => {
    const store = fixture();
    store.change({ completed_count: 3 });
    const fetcher = vi.fn();
    await dispatchGenerationRequest({ ...request, ...store, fetcher });
    expect(fetcher).not.toHaveBeenCalled();
    expect(store.markStalled).not.toHaveBeenCalled();
  });
  it("bounds a stuck status lookup without dispatching or guessing a failure version", async () => {
    vi.useFakeTimers();
    const store = fixture();
    const fetcher = vi.fn();
    const pending = dispatchGenerationRequest({
      ...request,
      ...store,
      readSnapshot: async () => new Promise(() => {}),
      timeoutMs: 50,
      fetcher,
    });
    const rejected = expect(pending).rejects.toThrow(/not confirmed/i);
    await vi.advanceTimersByTimeAsync(51);
    await rejected;
    expect(fetcher).not.toHaveBeenCalled();
    expect(store.markStalled).not.toHaveBeenCalled();
  });
});
