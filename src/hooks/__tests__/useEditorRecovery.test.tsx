// @vitest-environment jsdom
import { act, renderHook, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ from: vi.fn(), blocker: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: mocks.from },
}));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "admin-one" } }),
}));
vi.mock("@tanstack/react-router", () => ({
  useBlocker: (v: unknown) => mocks.blocker(v),
}));
import { useEditorRecovery } from "../useEditorRecovery";
let reads: { data: unknown; error: unknown };
let writes: { data: unknown; error: unknown };
const calls: { table: string; op: string; filters: unknown[] }[] = [];
beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  calls.length = 0;
  reads = { data: null, error: null };
  writes = { data: { updated_at: "2026-09-19T10:00:00Z" }, error: null };
  mocks.from.mockImplementation((table: string) => {
    let op = "read";
    const filters: unknown[] = [];
    const chain: { [key: string]: unknown } = {
      select: () => chain,
      eq: (...args: unknown[]) => {
        filters.push(args);
        return chain;
      },
      abortSignal: () => chain,
      insert: () => {
        op = "insert";
        return chain;
      },
      update: () => {
        op = "update";
        return chain;
      },
      delete: () => {
        op = "delete";
        return chain;
      },
      maybeSingle: async () => {
        calls.push({ table, op, filters });
        return op === "read" ? reads : writes;
      },
      then: (resolve: (v: unknown) => void) => {
        calls.push({ table, op, filters });
        resolve({ data: null, error: null });
      },
    };
    return chain;
  });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
async function flush() {
  await act(async () => {
    await Promise.resolve();
  });
}
describe("working-copy safety", () => {
  it("does not write on load; autosave never updates the published post table", async () => {
    const h = renderHook(
      ({ body }) => useEditorRecovery("post-one", { body }, true),
      { initialProps: { body: "original" } },
    );
    await flush();
    expect(calls.map((c) => c.op)).toEqual(["read"]);
    h.rerender({ body: "changed" });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1300);
    });
    expect(calls.map((c) => c.table)).toEqual([
      "post_editor_drafts",
      "post_editor_drafts",
    ]);
    expect(calls[1].op).toBe("insert");
    expect(h.result.current.message).toMatch(/not published/);
    expect(h.result.current.dirty).toBe(true);
  });
  it("offers recovery without automatically replacing the article", async () => {
    reads = {
      data: {
        snapshot: { body: "recovered" },
        updated_at: "2026-09-19T09:00:00Z",
      },
      error: null,
    };
    const h = renderHook(() =>
      useEditorRecovery("post-one", { body: "original" }, true),
    );
    await flush();
    expect(h.result.current.recovery).toEqual({ body: "recovered" });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    expect(calls).toHaveLength(1);
  });
  it("keeps newer edits if an explicit save finishes after more typing", async () => {
    const h = renderHook(
      ({ body }) => useEditorRecovery("post-one", { body }, true),
      { initialProps: { body: "original" } },
    );
    await flush();
    h.rerender({ body: "newer" });
    let cleared;
    await act(async () => {
      cleared = await h.result.current.clear(
        JSON.stringify({ body: "original" }),
      );
    });
    expect(cleared).toBe(false);
    expect(h.result.current.dirty).toBe(true);
    expect(calls.some((c) => c.op === "delete")).toBe(false);
  });
  it("fences deletion to the version read so another device is not erased", async () => {
    const version = "2026-09-19T09:00:00Z";
    reads = {
      data: { snapshot: { body: "original" }, updated_at: version },
      error: null,
    };
    const h = renderHook(() =>
      useEditorRecovery("post-one", { body: "original" }, true),
    );
    await flush();
    await act(async () => {
      await h.result.current.clear();
    });
    expect(calls.find((c) => c.op === "delete")?.filters).toContainEqual([
      "updated_at",
      version,
    ]);
  });
  it("retains a device copy and truthful status when remote save fails", async () => {
    writes = { data: null, error: { message: "offline" } };
    const h = renderHook(
      ({ body }) => useEditorRecovery("post-one", { body }, true),
      { initialProps: { body: "original" } },
    );
    await flush();
    h.rerender({ body: "offline edit" });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1300);
    });
    expect(h.result.current.message).toMatch(/device only/);
    expect(
      JSON.parse(
        localStorage.getItem("editor-working-copy:admin-one:post-one")!,
      ).snapshot.body,
    ).toBe("offline edit");
  });
});
