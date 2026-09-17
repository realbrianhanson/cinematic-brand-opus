import { describe, expect, it } from "vitest";
import { interpretSubscribeResult } from "@/lib/newsletterClient";

describe("subscribe UI states are truthful", () => {
  it("never reports success when email delivery is unavailable", () => {
    const r = interpretSubscribeResult(503, {
      ok: false,
      state: "unavailable",
    });
    expect(r.state).toBe("unavailable");
    expect(r.message).toMatch(/not configured/i);
  });

  it("surfaces rate limiting distinctly from success", () => {
    const r = interpretSubscribeResult(429, {
      ok: false,
      state: "rate_limited",
    });
    expect(r.state).toBe("rate_limited");
  });

  it("distinguishes a fresh confirmation from a repeat request", () => {
    expect(
      interpretSubscribeResult(200, { state: "confirmation_sent" }).state,
    ).toBe("confirmation_sent");
    expect(
      interpretSubscribeResult(200, { state: "confirmation_already_requested" })
        .state,
    ).toBe("already_requested");
  });

  it("reports already-subscribed without claiming a new email was sent", () => {
    const r = interpretSubscribeResult(200, { state: "already_subscribed" });
    expect(r.state).toBe("already_subscribed");
    expect(r.message).not.toMatch(/inbox/i);
  });

  it("treats a provider failure as an error, not a success", () => {
    expect(interpretSubscribeResult(502, { state: "send_failed" }).state).toBe(
      "error",
    );
  });

  it("falls back to a generic error on unknown or missing payloads", () => {
    expect(interpretSubscribeResult(0, null).state).toBe("error");
    expect(interpretSubscribeResult(200, {}).state).toBe("error");
  });

  it("flags an invalid address", () => {
    expect(
      interpretSubscribeResult(400, { state: "invalid_email" }).state,
    ).toBe("invalid_email");
  });
});
