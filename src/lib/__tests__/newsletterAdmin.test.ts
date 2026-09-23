import { beforeEach, describe, expect, it, vi } from "vitest";

const { rpc, invoke } = vi.hoisted(() => ({
  rpc: vi.fn(),
  invoke: vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc, functions: { invoke } },
}));

import {
  functionPayload,
  loadAudience,
  resendPendingConfirmations,
  retryFailedDelivery,
} from "@/lib/newsletterAdmin";

class FakeHttpError extends Error {
  constructor(public context: Response) {
    super("Edge Function returned a non-2xx status code");
  }
}

beforeEach(() => {
  rpc.mockReset();
  invoke.mockReset();
});

describe("functionPayload", () => {
  it("reads the JSON body of a non-2xx function response", async () => {
    const error = new FakeHttpError(
      new Response(JSON.stringify({ ok: false, error: "No key" }), {
        status: 503,
      }),
    );
    expect(await functionPayload(null, error)).toEqual({
      status: 503,
      payload: { ok: false, error: "No key" },
    });
  });
  it("passes through a successful payload", async () => {
    expect(await functionPayload({ ok: true }, null)).toEqual({
      status: 200,
      payload: { ok: true },
    });
  });
  it("turns a network failure into a plain message", async () => {
    expect(await functionPayload(null, new Error("Failed to fetch"))).toEqual({
      status: 0,
      payload: { error: "Failed to fetch" },
    });
  });
});

describe("retryFailedDelivery", () => {
  it("resets failed recipients, then runs delivery for that send", async () => {
    rpc.mockResolvedValue({
      data: { ok: true, state: "sending", reset: 1 },
      error: null,
    });
    invoke.mockResolvedValue({
      data: { ok: true, state: "sent", sent: 1, recipients: 1 },
      error: null,
    });
    const result = await retryFailedDelivery("send-1");
    expect(rpc).toHaveBeenCalledWith("newsletter_retry_failed_delivery", {
      _send_id: "send-1",
    });
    expect(invoke).toHaveBeenCalledWith("send-weekly-newsletter", {
      body: { send_id: "send-1" },
    });
    expect(result).toMatchObject({ state: "sent", sent: 1, recipients: 1 });
  });
  it("refuses with a plain reason and never invokes delivery", async () => {
    rpc.mockResolvedValue({
      data: {
        ok: false,
        state: "needs_review",
        reason: "uncertain_attempts",
        uncertain: 2,
      },
      error: null,
    });
    await expect(retryFailedDelivery("send-1")).rejects.toThrow(
      /unknown for 2 recipients/,
    );
    expect(invoke).not.toHaveBeenCalled();
  });
  it("reports the provider error when the retry is rejected again", async () => {
    rpc.mockResolvedValue({
      data: { ok: true, state: "sending", reset: 1 },
      error: null,
    });
    invoke.mockResolvedValue({
      data: null,
      error: new FakeHttpError(
        new Response(
          JSON.stringify({
            ok: false,
            state: "failed",
            sent: 0,
            recipients: 1,
            last_error: "Provider returned HTTP 403",
            last_error_status: 403,
          }),
          { status: 502 },
        ),
      ),
    });
    const result = await retryFailedDelivery("send-1");
    expect(result).toMatchObject({
      state: "failed",
      lastErrorStatus: 403,
      lastError: "Provider returned HTTP 403",
    });
  });
  it("surfaces database errors as messages", async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { message: "Admin access required" },
    });
    await expect(retryFailedDelivery("send-1")).rejects.toThrow(
      "Admin access required",
    );
  });
});

describe("loadAudience", () => {
  it("validates the RPC payload and sends clamped arguments", async () => {
    rpc.mockResolvedValue({
      data: {
        counts: {
          total: 6,
          confirmed: 1,
          pending: 5,
          unsubscribed: 0,
          bounced: 0,
          complained: 0,
          pending_not_emailed: 5,
        },
        matching: 1,
        rows: [
          {
            id: "a",
            email: "x@example.com",
            status: "pending",
            source: "final_cta",
            created_at: "2026-07-24T00:00:00Z",
            confirmed_at: null,
            unsubscribed_at: null,
            last_confirmation_sent_at: null,
            confirmation_send_count: 0,
          },
        ],
      },
      error: null,
    });
    const audience = await loadAudience({
      search: "  x@ ",
      status: "pending",
      page: 2,
    });
    expect(rpc).toHaveBeenCalledWith("admin_newsletter_audience", {
      _search: "x@",
      _status: "pending",
      _limit: 25,
      _offset: 50,
    });
    expect(audience.counts.pending).toBe(5);
    expect(audience.rows[0].email).toBe("x@example.com");
  });
  it("rejects an unexpected payload", async () => {
    rpc.mockResolvedValue({ data: { rows: "nope" }, error: null });
    await expect(
      loadAudience({ search: "", status: "all", page: 0 }),
    ).rejects.toThrow();
  });
});

describe("resendPendingConfirmations", () => {
  it("returns counts from a successful run", async () => {
    invoke.mockResolvedValue({
      data: { ok: true, pending: 5, sent: 5, failed: 0, skipped: 0 },
      error: null,
    });
    expect(await resendPendingConfirmations()).toEqual({
      ok: true,
      pending: 5,
      sent: 5,
      failed: 0,
      skipped: 0,
      remaining: 0,
      error: null,
      providerStatus: null,
    });
    expect(invoke).toHaveBeenCalledWith("newsletter-subscribe", {
      body: { resend_pending: true },
    });
  });
  it("keeps the provider message when Resend rejects", async () => {
    invoke.mockResolvedValue({
      data: null,
      error: new FakeHttpError(
        new Response(
          JSON.stringify({
            ok: false,
            pending: 5,
            sent: 0,
            failed: 5,
            skipped: 0,
            error:
              "Provider returned HTTP 403: The m.brianhanson.com domain is not verified.",
            provider_status: 403,
          }),
          { status: 502 },
        ),
      ),
    });
    const result = await resendPendingConfirmations();
    expect(result.ok).toBe(false);
    expect(result.failed).toBe(5);
    expect(result.providerStatus).toBe(403);
    expect(result.error).toContain("not verified");
  });
  it("explains a missing email configuration", async () => {
    invoke.mockResolvedValue({
      data: null,
      error: new FakeHttpError(
        new Response(
          JSON.stringify({
            ok: false,
            state: "unavailable",
            missing: ["RESEND_API_KEY"],
          }),
          { status: 503 },
        ),
      ),
    });
    const result = await resendPendingConfirmations();
    expect(result.ok).toBe(false);
    expect(result.error).toBe("Email isn't configured: RESEND_API_KEY");
  });
});
