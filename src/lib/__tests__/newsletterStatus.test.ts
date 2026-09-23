import { describe, expect, it } from "vitest";
import {
  canResumeDelivery,
  canRetryFailed,
  explainDeliveryError,
  senderDomain,
  sendStatusView,
} from "@/lib/newsletterStatus";

describe("sendStatusView", () => {
  it("shows delivered counts for a complete send", () => {
    expect(
      sendStatusView({ status: "sent", sent_count: 1, recipient_count: 1 }),
    ).toEqual({ tone: "success", label: "Sent · 1 of 1 delivered" });
  });
  it("never shows a short send as a clean success", () => {
    expect(
      sendStatusView({ status: "sent", sent_count: 0, recipient_count: 1 }),
    ).toEqual({ tone: "danger", label: "Sent · 0 of 1 delivered" });
    expect(
      sendStatusView({ status: "sent", sent_count: 2, recipient_count: 3 })
        .tone,
    ).toBe("warning");
  });
  it("labels failures and stopped deliveries with counts", () => {
    expect(
      sendStatusView({ status: "failed", sent_count: 0, recipient_count: 1 }),
    ).toEqual({ tone: "danger", label: "Not delivered · 0 of 1" });
    expect(
      sendStatusView({
        status: "needs_review",
        sent_count: 100,
        recipient_count: 150,
      }),
    ).toEqual({
      tone: "danger",
      label: "Delivery stopped · 100 of 150 delivered",
    });
  });
  it("handles preview, sending, cancelled and unknown states", () => {
    expect(sendStatusView({ status: "preview" }).label).toBe(
      "Preview · sends Tuesday",
    );
    expect(
      sendStatusView({ status: "sending", sent_count: 5, recipient_count: 9 })
        .label,
    ).toBe("Sending · 5 of 9 delivered so far");
    expect(sendStatusView({ status: "cancelled" }).tone).toBe("muted");
    expect(sendStatusView({ status: "weird" }).label).toBe("Status unknown");
  });
});

describe("senderDomain", () => {
  it("reads the domain from a display-name sender", () => {
    expect(senderDomain("Brian Hanson <brian@m.brianhanson.com>")).toBe(
      "m.brianhanson.com",
    );
    expect(senderDomain("hi@Example.com")).toBe("example.com");
    expect(senderDomain(null)).toBeNull();
    expect(senderDomain("not an address")).toBeNull();
  });
});

describe("explainDeliveryError", () => {
  it("names an unverified domain from the Resend message", () => {
    const e = explainDeliveryError({
      status: 403,
      detail:
        "Provider returned HTTP 403: The m.brianhanson.com domain is not verified. Please, add and verify your domain on https://resend.com/domains",
      fromAddress: null,
    });
    expect(e?.title).toBe("Resend rejected: domain not verified (403)");
    expect(e?.action).toContain("Verify m.brianhanson.com in Resend");
    expect(e?.retryable).toBe(true);
  });
  it("falls back to the configured sender domain for a bare 403", () => {
    const e = explainDeliveryError({
      status: 403,
      detail: "Provider returned HTTP 403",
      fromAddress: "Brian <brian@m.brianhanson.com>",
    });
    expect(e?.title).toBe("Resend rejected the sender (403)");
    expect(e?.action).toContain("Verify m.brianhanson.com in Resend");
    expect(e?.action).toContain("RESEND_API_KEY");
  });
  it("explains API key, validation and rate-limit rejections", () => {
    expect(explainDeliveryError({ status: 401, detail: "x" })?.title).toBe(
      "Resend rejected the API key (401)",
    );
    expect(
      explainDeliveryError({
        status: 422,
        detail: "Provider returned HTTP 422: Invalid `from` field",
      })?.explanation,
    ).toContain("Invalid `from` field");
    expect(explainDeliveryError({ status: 429, detail: "" })?.action).toMatch(
      /wait/i,
    );
  });
  it("locks retry when the provider result is unknown", () => {
    const server = explainDeliveryError({ status: 503, detail: "" });
    expect(server?.retryable).toBe(false);
    expect(server?.action).toMatch(/Resend/);
    const interrupted = explainDeliveryError({
      status: null,
      detail:
        "Provider request interrupted; check provider before taking further action.",
    });
    expect(interrupted?.retryable).toBe(false);
  });
  it("explains empty audiences and corrected history", () => {
    expect(
      explainDeliveryError({
        status: null,
        detail:
          "No confirmed subscribers when delivery started; nobody was emailed.",
      })?.title,
    ).toBe("Nobody was emailed");
    const legacy = explainDeliveryError({
      status: null,
      detail:
        "Recorded as sent, but only 0 of 1 recipients were delivered. Status corrected by migration 20260923140000.",
    });
    expect(legacy?.title).toBe("Recorded as sent, but not delivered");
    expect(legacy?.retryable).toBe(false);
  });
  it("returns null without any error information", () => {
    expect(explainDeliveryError({ status: null, detail: null })).toBeNull();
  });
});

describe("retry gates", () => {
  const base = {
    status: "failed",
    hasSnapshot: true,
    failed: 1,
    uncertain: 0,
    attempting: 0,
  };
  it("allows retry only for definite rejections with receipts", () => {
    expect(canRetryFailed(base)).toBe(true);
    expect(canRetryFailed({ ...base, status: "needs_review" })).toBe(true);
    expect(canRetryFailed({ ...base, status: "sent" })).toBe(false);
    expect(canRetryFailed({ ...base, hasSnapshot: false })).toBe(false);
    expect(canRetryFailed({ ...base, failed: 0 })).toBe(false);
    expect(canRetryFailed({ ...base, uncertain: 1 })).toBe(false);
    expect(canRetryFailed({ ...base, attempting: 1 })).toBe(false);
  });
  it("resumes a queued send only when no lease is active", () => {
    const now = Date.parse("2026-09-23T10:00:00Z");
    expect(
      canResumeDelivery({ status: "sending", delivery_lease_until: null }, now),
    ).toBe(true);
    expect(
      canResumeDelivery(
        { status: "sending", delivery_lease_until: "2026-09-23T10:03:00Z" },
        now,
      ),
    ).toBe(false);
    expect(
      canResumeDelivery(
        { status: "sending", delivery_lease_until: "2026-09-23T09:00:00Z" },
        now,
      ),
    ).toBe(true);
    expect(
      canResumeDelivery({ status: "sent", delivery_lease_until: null }, now),
    ).toBe(false);
  });
});
