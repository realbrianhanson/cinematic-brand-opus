import { describe, expect, it } from "vitest";
import {
  overrideCheck,
  parsePublishRequest,
  publishDecision,
} from "../../../supabase/functions/manual-publish-v2/request";
import {
  AI_CREDITS_EXHAUSTED,
  isCreditsExhausted,
} from "../../../supabase/functions/daily-content-run/credits";

const POST = "3f0c1f5e-8a4b-4c1d-9e2f-0a1b2c3d4e5f";
const NOW = Date.parse("2026-09-23T12:00:00.000Z");

describe("manual-publish request", () => {
  it("defaults to publishing one post", () => {
    expect(parsePublishRequest({ post_id: POST }, NOW)).toEqual({
      ok: true,
      postId: POST,
      mode: "publish",
      scheduledAt: null,
      overrideReason: "",
    });
  });

  it("rejects bulk or multi-id requests outright", () => {
    for (const body of [
      { post_ids: [POST] },
      { post_id: [POST, POST] },
      { post_id: POST, post_ids: [POST] },
      { post_id: `${POST},${POST}` },
    ]) {
      const r = parsePublishRequest(body, NOW);
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.status).toBe(400);
        expect(r.error).toMatch(/one article/i);
      }
    }
  });

  it("requires a real post id", () => {
    expect(parsePublishRequest({}, NOW).ok).toBe(false);
    expect(parsePublishRequest(null, NOW).ok).toBe(false);
    expect(parsePublishRequest({ post_id: "abc" }, NOW).ok).toBe(false);
  });

  it("schedules only for a valid future time", () => {
    const later = "2026-09-24T09:30:00.000Z";
    expect(
      parsePublishRequest(
        { post_id: POST, mode: "schedule", scheduled_at: later },
        NOW,
      ),
    ).toMatchObject({ ok: true, mode: "schedule", scheduledAt: later });
    for (const scheduled_at of [
      undefined,
      "not a date",
      "2026-09-23T11:59:00.000Z",
      "2028-01-01T00:00:00.000Z",
    ]) {
      expect(
        parsePublishRequest(
          { post_id: POST, mode: "schedule", scheduled_at },
          NOW,
        ).ok,
      ).toBe(false);
    }
  });

  it("accepts a read-only check mode and rejects unknown modes", () => {
    expect(
      parsePublishRequest({ post_id: POST, mode: "check" }, NOW),
    ).toMatchObject({ ok: true, mode: "check" });
    expect(
      parsePublishRequest({ post_id: POST, mode: "publish-all" }, NOW).ok,
    ).toBe(false);
  });

  it("trims the override reason and rejects non-text reasons", () => {
    expect(
      parsePublishRequest(
        { post_id: POST, override_reason: "  checked the claims by hand  " },
        NOW,
      ),
    ).toMatchObject({ overrideReason: "checked the claims by hand" });
    expect(
      parsePublishRequest({ post_id: POST, override_reason: 42 }, NOW).ok,
    ).toBe(false);
  });
});

describe("override rule", () => {
  it("needs no override when the gate passes", () => {
    expect(overrideCheck(0, "")).toEqual({
      proceed: true,
      override: false,
      reasonError: null,
    });
  });
  it("requires a reason of at least 10 characters to override", () => {
    expect(overrideCheck(2, "")).toEqual({
      proceed: false,
      override: false,
      reasonError: null,
    });
    expect(overrideCheck(2, "too short")).toMatchObject({
      proceed: false,
      reasonError: "Override reason must be at least 10 characters",
    });
    expect(overrideCheck(2, "verified every claim")).toEqual({
      proceed: true,
      override: true,
      reasonError: null,
    });
  });
  it("labels each outcome", () => {
    expect(publishDecision("publish", false)).toBe("published");
    expect(publishDecision("publish", true)).toBe("published_with_override");
    expect(publishDecision("schedule", false)).toBe("scheduled");
    expect(publishDecision("schedule", true)).toBe("scheduled_with_override");
  });
});

describe("AI credit exhaustion", () => {
  it("detects a gateway 402 and the wrapped 'Not enough credits' errors", () => {
    expect(AI_CREDITS_EXHAUSTED).toBe("ai_credits_exhausted");
    expect(isCreditsExhausted({ status: 402, data: {} })).toBe(true);
    expect(
      isCreditsExhausted({
        status: 500,
        data: {
          error: "LLM failed",
          details: '{"type":"payment_required","message":"Not enough credits"}',
        },
      }),
    ).toBe(true);
    expect(
      isCreditsExhausted({
        status: 500,
        data: { error: "draft failed", details: "status 402 Payment Required" },
      }),
    ).toBe(true);
  });
  it("does not stop the run for ordinary failures or nested successes", () => {
    expect(
      isCreditsExhausted({ status: 500, data: { error: "timeout" } }),
    ).toBe(false);
    expect(
      isCreditsExhausted({
        status: 200,
        data: { errors: ["source x: Not enough credits"] },
      }),
    ).toBe(false);
    expect(isCreditsExhausted({ status: 0, data: null })).toBe(false);
  });
});
