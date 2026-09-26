import { QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const { rpc, abortSignal } = vi.hoisted(() => ({
  rpc: vi.fn(),
  abortSignal: vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc } }));
import { funnelJourneyMeasurementQuery } from "../funnelJourneyMeasurementReport";

const report = {
  generated_at: "2026-09-27T12:00:00Z",
  measurement_started_at: "2026-09-27T00:00:00Z",
  range: {
    start: "2026-09-20T12:00:00Z",
    end: "2026-09-27T12:00:00Z",
    timezone: "UTC",
  },
  revision_count: 0,
  revisions: [],
};
let client: QueryClient;
beforeEach(() => {
  vi.clearAllMocks();
  client = new QueryClient({ defaultOptions: { queries: { gcTime: 0 } } });
  rpc.mockReturnValue({ abortSignal });
  abortSignal.mockResolvedValue({ data: report, error: null });
});
afterEach(() => {
  client.clear();
  vi.restoreAllMocks();
});

describe("journey measurement report requests", () => {
  it("loads the selected cohort and applies a bounded request deadline", async () => {
    const deadline = vi.spyOn(AbortSignal, "timeout");
    await expect(
      client.fetchQuery(funnelJourneyMeasurementQuery(7)),
    ).resolves.toEqual(report);
    expect(rpc).toHaveBeenCalledWith("admin_funnel_journey_measurement", {
      _days: 7,
    });
    expect(deadline).toHaveBeenCalledWith(20000);
  });

  it("propagates query cancellation to the underlying report request", async () => {
    abortSignal.mockImplementation(() => new Promise(() => {}));
    const pending = client.fetchQuery(funnelJourneyMeasurementQuery(30));
    const rejected = expect(pending).rejects.toThrow();
    const signal = abortSignal.mock.calls[0][0] as AbortSignal;
    expect(signal.aborted).toBe(false);
    await client.cancelQueries({
      queryKey: ["funnel-journey-measurement", 30],
    });
    expect(signal.aborted).toBe(true);
    await rejected;
  });

  it("shows an error on deadline expiry without retrying or treating it as zero activity", async () => {
    const deadline = new AbortController();
    vi.spyOn(AbortSignal, "timeout").mockReturnValue(deadline.signal);
    abortSignal.mockImplementation(
      (signal: AbortSignal) =>
        new Promise((resolve) => {
          signal.addEventListener(
            "abort",
            () =>
              resolve({
                data: null,
                error: { message: "private timeout detail" },
              }),
            { once: true },
          );
        }),
    );
    const pending = client.fetchQuery(funnelJourneyMeasurementQuery(90));
    const rejected = expect(pending).rejects.toThrow(
      "Journey measurement could not be loaded.",
    );
    deadline.abort();
    await rejected;
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("rejects malformed count data", async () => {
    abortSignal.mockResolvedValue({
      data: { ...report, revision_count: -1 },
      error: null,
    });
    await expect(
      client.fetchQuery(funnelJourneyMeasurementQuery(7)),
    ).rejects.toThrow();
    expect(rpc).toHaveBeenCalledTimes(1);
  });
});
