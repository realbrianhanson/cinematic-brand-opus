import { describe, expect, it, vi } from "vitest";
import {
  deliverNewsletter,
  TOKEN_PLACEHOLDER,
  type DeliveryBatch,
  type DeliveryPort,
} from "../../../supabase/functions/_shared/newsletterDelivery";

function batch(n: number, offset = 0): DeliveryBatch {
  return {
    attempt_id: `attempt-${offset}`,
    template: {
      from: "sender@example.com",
      reply_to: "reply@example.com",
      subject: "Digest",
      html: `<a href="/unsubscribe?token=${TOKEN_PLACEHOLDER}">Unsubscribe</a>`,
    },
    recipients: Array.from({ length: n }, (_, i) => ({
      id: `${offset + i}`,
      email: `member-${offset + i}@example.com`,
      confirm_token: `token-${offset + i}`,
    })),
  };
}
function harness(batches: DeliveryBatch[]) {
  const nextBatch = vi.fn(async () => batches.shift() ?? null);
  const record = vi.fn(async () => {});
  const send = vi.fn(
    async (payload: unknown) =>
      new Response(
        JSON.stringify({
          data: (payload as unknown[]).map((_, i) => ({ id: `receipt-${i}` })),
        }),
      ),
  );
  const port: DeliveryPort = { nextBatch, record, send };
  return { port, nextBatch, record, send };
}
describe("durable newsletter delivery", () => {
  it("delivers every claimed batch, including audiences beyond the REST 1000-row limit", async () => {
    const h = harness(
      Array.from({ length: 11 }, (_, i) => batch(100, i * 100)),
    );
    expect(await deliverNewsletter("send", h.port)).toEqual({
      sent: 1100,
      state: "sent",
    });
    expect(h.record).toHaveBeenCalledTimes(11);
    expect(h.nextBatch).toHaveBeenCalledTimes(12);
    expect(h.send.mock.calls[0][0]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          to: ["member-0@example.com"],
          html: '<a href="/unsubscribe?token=token-0">Unsubscribe</a>',
        }),
      ]),
    );
  });
  it("stops after a rejected batch and preserves the successful count", async () => {
    const h = harness([batch(2), batch(2, 2), batch(2, 4)]);
    h.send
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: [{ id: "a" }, { id: "b" }] })),
      )
      .mockResolvedValueOnce(new Response("rate limit", { status: 429 }));
    expect(await deliverNewsletter("send", h.port)).toEqual({
      sent: 2,
      state: "needs_review",
    });
    expect(h.send).toHaveBeenCalledTimes(2);
    expect(h.record.mock.calls[1]).toEqual([
      expect.anything(),
      "failed",
      [],
      "Provider returned HTTP 429",
    ]);
  });
  it.each(["timeout", "server", "malformed", "partial"])(
    "never retries an ambiguous %s response",
    async (failure) => {
      const h = harness([batch(2), batch(2, 2)]);
      if (failure === "timeout")
        h.send.mockRejectedValueOnce(new Error("timeout"));
      if (failure === "server")
        h.send.mockResolvedValueOnce(new Response("", { status: 503 }));
      if (failure === "malformed")
        h.send.mockResolvedValueOnce(new Response("not-json"));
      if (failure === "partial")
        h.send.mockResolvedValueOnce(
          new Response(JSON.stringify({ data: [{ id: "a" }] })),
        );
      expect(await deliverNewsletter("send", h.port)).toEqual({
        sent: 0,
        state: "needs_review",
      });
      expect(h.send).toHaveBeenCalledTimes(1);
      expect(h.record).toHaveBeenCalledWith(
        expect.anything(),
        "uncertain",
        [],
        expect.any(String),
      );
    },
  );
  it("does not advance when storing provider receipts fails", async () => {
    const h = harness([batch(2), batch(2, 2)]);
    h.record.mockRejectedValueOnce(new Error("database offline"));
    await expect(deliverNewsletter("send", h.port)).rejects.toThrow(
      "database offline",
    );
    expect(h.send).toHaveBeenCalledTimes(1);
    expect(h.nextBatch).toHaveBeenCalledTimes(1);
  });
  it("does not send when a durable claim cannot be read", async () => {
    const h = harness([batch(1)]);
    h.nextBatch.mockRejectedValueOnce(new Error("lease lost"));
    await expect(deliverNewsletter("send", h.port)).rejects.toThrow(
      "lease lost",
    );
    expect(h.send).not.toHaveBeenCalled();
  });
});
