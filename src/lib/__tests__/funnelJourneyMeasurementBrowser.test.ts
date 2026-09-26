import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const { allowed, queue } = vi.hoisted(() => ({
  allowed: vi.fn(),
  queue: vi.fn(),
}));
vi.mock("../measurement", () => ({
  measurementAllowed: allowed,
  queueSupplementalMeasurement: queue,
}));
import { recordFunnelJourneyMeasurement } from "../funnelJourneyMeasurement";
const input = {
  slug: "example",
  revision: 1,
  step_id: "offer",
  type: "offer_handoff" as const,
};
const context = {
  session_id: "00000000-0000-4000-8000-000000000001",
  session_token: "a".repeat(64),
  attribution: { source: "direct", medium: "direct", campaign: "" },
};
beforeEach(() => {
  vi.clearAllMocks();
  allowed.mockReturnValue(true);
  vi.stubEnv("VITE_SUPABASE_URL", "https://backend.example.com");
  vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "test-public");
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
describe("optional journey browser events", () => {
  it("does nothing without consent and never uses functional session capabilities", () => {
    allowed.mockReturnValue(false);
    recordFunnelJourneyMeasurement([input]);
    expect(queue).not.toHaveBeenCalled();
  });
  it("retries at most once with the same event IDs and payload", async () => {
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValue(new Response(JSON.stringify({ accepted: true })));
    vi.stubGlobal("fetch", fetcher);
    recordFunnelJourneyMeasurement([input]);
    expect(await queue.mock.calls[0][0](context, () => true)).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[0][1].body).toBe(fetcher.mock.calls[1][1].body);
    expect(JSON.parse(fetcher.mock.calls[0][1].body).events[0]).toMatchObject(
      input,
    );
  });
  it("cancels the retry after withdrawal even if a new session opts in", async () => {
    const current = vi.fn().mockReturnValueOnce(true).mockReturnValue(false);
    const fetcher = vi.fn().mockRejectedValue(new Error("network"));
    vi.stubGlobal("fetch", fetcher);
    recordFunnelJourneyMeasurement([input]);
    expect(await queue.mock.calls[0][0](context, current)).toBe(false);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("never throws into a functional action when browser tracking fails", () => {
    queue.mockImplementation(() => {
      throw new Error("storage disabled");
    });
    expect(() => recordFunnelJourneyMeasurement([input])).not.toThrow();
  });
});
