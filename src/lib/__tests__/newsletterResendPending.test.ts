import { describe, expect, it, vi } from "vitest";
import {
  resendPendingConfirmations,
  type PendingRow,
  type ResendPort,
} from "../../../supabase/functions/newsletter-subscribe/resendPending";

const NOW = new Date("2026-09-23T12:00:00Z");
const row = (i: number, last: string | null = null): PendingRow => ({
  email: `p${i}@example.com`,
  confirm_token: `token-${i}`,
  last_confirmation_sent_at: last,
  confirmation_send_count: 0,
});

function harness(rows: PendingRow[], total = rows.length) {
  const port = {
    listPending: vi.fn(async () => rows),
    countPending: vi.fn(async () => total),
    claim: vi.fn(async () => true),
    release: vi.fn(async () => {}),
    confirmSent: vi.fn(async () => {}),
    send: vi.fn(async () => ({ ok: true as const })),
    now: () => NOW,
  } satisfies ResendPort;
  return port;
}

describe("resend pending confirmations", () => {
  it("claims, sends once per claim and counts each confirmation", async () => {
    const port = harness([row(1), row(2)]);
    const result = await resendPendingConfirmations(port);
    expect(result).toEqual({
      ok: true,
      pending: 2,
      sent: 2,
      failed: 0,
      skipped: 0,
      remaining: 0,
      error: null,
      provider_status: null,
    });
    expect(port.send).toHaveBeenCalledWith(
      row(1),
      `nl-confirm-token-1-${NOW.toISOString()}`,
    );
    expect(port.confirmSent).toHaveBeenCalledTimes(2);
    expect(port.release).not.toHaveBeenCalled();
  });

  it("skips rows inside the cooldown and rows another run already claimed", async () => {
    const recent = new Date(NOW.getTime() - 60_000).toISOString();
    const port = harness([row(1, recent), row(2), row(3)]);
    port.claim.mockResolvedValueOnce(false);
    const result = await resendPendingConfirmations(port);
    expect(result.sent).toBe(1);
    expect(result.skipped).toBe(2);
    expect(port.send).toHaveBeenCalledTimes(1);
  });

  it("stops on a sender or key rejection, releases the claim and keeps the reason", async () => {
    const port = harness([row(1), row(2), row(3)]);
    port.send.mockResolvedValueOnce({
      ok: false,
      status: 403,
      detail:
        "Provider returned HTTP 403: The m.brianhanson.com domain is not verified.",
    } as never);
    const result = await resendPendingConfirmations(port);
    expect(result).toMatchObject({
      ok: false,
      sent: 0,
      failed: 1,
      remaining: 2,
      provider_status: 403,
      error:
        "Provider returned HTTP 403: The m.brianhanson.com domain is not verified.",
    });
    expect(port.send).toHaveBeenCalledTimes(1);
    expect(port.release).toHaveBeenCalledWith(row(1), NOW.toISOString());
  });

  it("keeps going after a single-recipient rejection", async () => {
    const port = harness([row(1), row(2)]);
    port.send.mockResolvedValueOnce({
      ok: false,
      status: 422,
      detail: "Provider returned HTTP 422: Invalid `to` field",
    } as never);
    const result = await resendPendingConfirmations(port);
    expect(result).toMatchObject({ ok: false, sent: 1, failed: 1 });
  });

  it("reports how many pending sign-ups are beyond this batch", async () => {
    const port = harness([row(1)], 60);
    const result = await resendPendingConfirmations(port);
    expect(result.pending).toBe(60);
    expect(result.remaining).toBe(59);
  });

  it("counts a failed claim write as a failure without sending", async () => {
    const port = harness([row(1)]);
    port.claim.mockRejectedValueOnce(new Error("db offline"));
    const result = await resendPendingConfirmations(port);
    expect(result).toMatchObject({ ok: false, failed: 1, sent: 0 });
    expect(result.error).toBe("db offline");
    expect(port.send).not.toHaveBeenCalled();
  });
});
