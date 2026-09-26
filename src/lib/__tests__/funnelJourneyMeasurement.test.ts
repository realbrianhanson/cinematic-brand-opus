import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseFunnelMeasurement } from "../../../supabase/functions/_shared/funnelJourneyMeasurement";
import { createFunnelMeasurementCollector } from "../../../supabase/functions/_shared/funnelJourneyMeasurementCollector";
const id = "00000000-0000-4000-8000-000000000001";
const event = {
  id,
  slug: "example",
  revision: 2,
  step_id: "question",
  type: "step_view",
};
const body = () => ({
  action: "record",
  consent: true,
  session_id: id,
  session_token: "a".repeat(64),
  events: [event],
});
const deps = {
  origin: vi.fn(async () => "https://example.com"),
  rateLimit: vi.fn(async () => true),
  record: vi.fn(async (_input: { tokenHash: string }) => true),
};
const handler = createFunnelMeasurementCollector(deps);
const request = (
  input: unknown = body(),
  headers: Record<string, string> = {},
) =>
  new Request("https://backend.example.com/funnel-journey-measurement", {
    method: "POST",
    headers: {
      origin: "https://example.com",
      "content-type": "application/json",
      "user-agent": "Mozilla/5.0",
      ...headers,
    },
    body: JSON.stringify(input),
  });
beforeEach(() => {
  vi.clearAllMocks();
  deps.rateLimit.mockResolvedValue(true);
  deps.record.mockResolvedValue(true);
});
describe("connected journey collector", () => {
  it("accepts only bounded identifiers and drops unsafe attribution labels", () => {
    expect(parseFunnelMeasurement(body())?.events).toEqual([event]);
    for (const extra of [
      { answer: "private text" },
      { url: "https://provider.example/token" },
      { token: "secret" },
      { offer_id: id },
    ])
      expect(
        parseFunnelMeasurement({ ...body(), events: [{ ...event, ...extra }] }),
      ).toBeNull();
    for (const extra of [
      { functional_token: "a".repeat(64) },
      { consent: false },
      { events: [] },
      { events: Array(11).fill(event) },
    ])
      expect(parseFunnelMeasurement({ ...body(), ...extra })).toBeNull();
    expect(
      parseFunnelMeasurement({
        ...body(),
        events: [{ ...event, type: "step_continue", option_id: "training" }],
      })?.events[0].option_id,
    ).toBe("training");
    expect(
      parseFunnelMeasurement({
        ...body(),
        events: [{ ...event, option_id: "training" }],
      }),
    ).toBeNull();
    expect(
      parseFunnelMeasurement({
        ...body(),
        attribution: {
          source: "private@example.com",
          medium: "email",
          campaign: "https://private",
        },
      })?.attribution,
    ).toEqual({ source: "direct", medium: "email", campaign: "none" });
  });
  it("hashes capabilities/IPs and stores no raw functional or contact data", async () => {
    const response = await handler(
      request(body(), { "cf-connecting-ip": "192.0.2.2" }),
    );
    expect(await response.json()).toEqual({ accepted: true });
    const input = deps.record.mock.calls[0][0] as { tokenHash: string };
    expect(input.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(input.tokenHash).not.toBe("a".repeat(64));
    expect(JSON.stringify(deps.rateLimit.mock.calls)).not.toContain(
      "192.0.2.2",
    );
  });
  it("excludes canonical-origin mismatches, privacy signals, auth, admin and preview traffic", async () => {
    const excludedHeaders: Array<Record<string, string>> = [
      { origin: "https://preview.example.com" },
      { dnt: "1" },
      { "sec-gpc": "1" },
      { authorization: "Bearer secret-user" },
      { referer: "https://example.com/admin/funnels" },
      { referer: "https://example.com/funnels/example?preview=1" },
      { referer: "https://example.com/funnels/example?measurement=off" },
      { "x-codex-qa": "1" },
    ];
    for (const headers of excludedHeaders) {
      expect(await (await handler(request(body(), headers))).json()).toEqual({
        accepted: false,
      });
    }
    expect(deps.record).not.toHaveBeenCalled();
  });
  it("refuses oversized requests and quota failures without exposing persistence errors", async () => {
    expect(
      (await handler(request({ ...body(), oversized: "a".repeat(9000) })))
        .status,
    ).toBe(400);
    deps.rateLimit.mockResolvedValue(false);
    expect((await handler(request())).status).toBe(429);
    expect(deps.record).not.toHaveBeenCalled();
    deps.rateLimit.mockResolvedValue(true);
    deps.record.mockRejectedValue(new Error("private database details"));
    expect(await (await handler(request())).json()).toEqual({
      error: "Measurement unavailable",
    });
  });
});
