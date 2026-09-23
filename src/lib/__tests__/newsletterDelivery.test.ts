import { describe, expect, it, vi } from "vitest";
import {
  deliverNewsletter,
  providerErrorDetail,
  sendOutcomeResponse,
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
      state: "completed",
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
      state: "stopped",
      failure: {
        outcome: "failed",
        providerStatus: 429,
        detail: "Provider returned HTTP 429: rate limit",
      },
    });
    expect(h.send).toHaveBeenCalledTimes(2);
    expect(h.record.mock.calls[1]).toEqual([
      expect.anything(),
      "failed",
      [],
      "Provider returned HTTP 429: rate limit",
      429,
    ]);
  });
  it("records the provider status and message when Resend rejects the sender", async () => {
    const h = harness([batch(1)]);
    h.send.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          statusCode: 403,
          name: "validation_error",
          message:
            "The m.brianhanson.com domain is not verified. Please, add and verify your domain on https://resend.com/domains",
        }),
        { status: 403 },
      ),
    );
    const result = await deliverNewsletter("send", h.port);
    expect(result.sent).toBe(0);
    expect(result.state).toBe("stopped");
    expect(h.record).toHaveBeenCalledWith(
      expect.anything(),
      "failed",
      [],
      "Provider returned HTTP 403: The m.brianhanson.com domain is not verified. Please, add and verify your domain on https://resend.com/domains",
      403,
    );
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
      const result = await deliverNewsletter("send", h.port);
      expect(result).toMatchObject({ sent: 0, state: "stopped" });
      expect(result.failure?.outcome).toBe("uncertain");
      expect(h.send).toHaveBeenCalledTimes(1);
      expect(h.record).toHaveBeenCalledWith(
        expect.anything(),
        "uncertain",
        [],
        expect.any(String),
        failure === "server" ? 503 : null,
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

describe("providerErrorDetail", () => {
  it("keeps a JSON message and the status", () => {
    expect(
      providerErrorDetail(
        401,
        JSON.stringify({ message: "API key is invalid" }),
      ),
    ).toBe("Provider returned HTTP 401: API key is invalid");
  });
  it("reads nested error messages", () => {
    expect(
      providerErrorDetail(
        422,
        JSON.stringify({ error: { message: "Bad from" } }),
      ),
    ).toBe("Provider returned HTTP 422: Bad from");
  });
  it("collapses whitespace and truncates long bodies to 300 characters", () => {
    const detail = providerErrorDetail(400, `  a\n\n b ${"x".repeat(500)}`);
    expect(detail.startsWith("Provider returned HTTP 400: a b x")).toBe(true);
    expect(detail.length).toBe("Provider returned HTTP 400: ".length + 300);
  });
  it("omits an empty body", () => {
    expect(providerErrorDetail(403, "   ")).toBe("Provider returned HTTP 403");
  });
});

describe("sendOutcomeResponse", () => {
  it("is ok only when the stored status is sent", () => {
    expect(
      sendOutcomeResponse({
        status: "sent",
        sent_count: 1,
        recipient_count: 1,
        last_error: null,
        last_error_status: null,
      }),
    ).toEqual({
      httpStatus: 200,
      body: {
        ok: true,
        state: "sent",
        sent: 1,
        recipients: 1,
        last_error: null,
        last_error_status: null,
      },
    });
  });
  it.each([
    ["failed", 502],
    ["needs_review", 502],
    ["cancelled", 200],
    ["sending", 202],
  ])("maps %s to HTTP %i and never claims success", (status, httpStatus) => {
    const result = sendOutcomeResponse({
      status,
      sent_count: 0,
      recipient_count: 1,
      last_error: "Provider returned HTTP 403",
      last_error_status: 403,
    });
    expect(result.httpStatus).toBe(httpStatus);
    expect(result.body.ok).toBe(false);
    expect(result.body.last_error_status).toBe(403);
  });
});
