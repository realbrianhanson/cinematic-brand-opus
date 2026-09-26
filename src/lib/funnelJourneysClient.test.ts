import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const api = vi.hoisted(() => ({ invoke: vi.fn(), rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: api.invoke }, rpc: api.rpc },
}));
import { emptyFunnelGraph } from "./funnelJourneys";
import {
  saveFunnelJourney,
  startFunnelJourney,
  type FunnelSave,
} from "./funnelJourneysClient";
beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
});
afterEach(() => vi.useRealTimers());
describe("journey client deadlines", () => {
  it("bounds a stalled public request", async () => {
    api.invoke.mockReturnValue(new Promise(() => {}));
    const result = startFunnelJourney("sample", "a".repeat(64));
    const rejection = expect(result).rejects.toThrow("Request timed out");
    await vi.advanceTimersByTimeAsync(15001);
    await rejection;
  });
  it("preserves exact save identity after an uncertain timeout", async () => {
    const input: FunnelSave = {
      id: "00000000-0000-4000-8000-000000000001",
      slug: "sample",
      title: "Example",
      graph: emptyFunnelGraph(),
      expectedVersion: 2,
      publish: true,
      active: true,
      requestId: "00000000-0000-4000-8000-000000000002",
    };
    api.rpc
      .mockReturnValueOnce(new Promise(() => {}))
      .mockResolvedValueOnce({ data: { version: 3 }, error: null });
    const first = saveFunnelJourney(input);
    const rejection = expect(first).rejects.toThrow("Request timed out");
    await vi.advanceTimersByTimeAsync(15001);
    await rejection;
    expect(await saveFunnelJourney(input)).toEqual({ version: 3 });
    expect(api.rpc.mock.calls[1]).toEqual(api.rpc.mock.calls[0]);
    expect(api.rpc.mock.calls[0][1]).toMatchObject({
      _expected_version: 2,
      _request_id: input.requestId,
      _publish: true,
    });
  });
  it("bounds error-body parsing and retains a safe error message", async () => {
    const response = new Response();
    vi.spyOn(response, "json").mockReturnValue(new Promise(() => {}));
    api.invoke.mockResolvedValue({ data: null, error: { context: response } });
    const result = startFunnelJourney("sample", "a".repeat(64));
    const rejection = expect(result).rejects.toThrow(
      "This journey could not be loaded",
    );
    await vi.advanceTimersByTimeAsync(2001);
    await rejection;
  });
});
