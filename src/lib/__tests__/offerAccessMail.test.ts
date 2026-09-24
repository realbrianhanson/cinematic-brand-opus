import { describe, expect, it, vi } from "vitest";
import {
  accessMailPayload,
  decryptAccessMail,
  encryptAccessMail,
  offerDeliveryRetryDelaySeconds,
  randomAccessToken,
  sendAccessMail,
} from "../../../supabase/functions/_shared/offerAccessMail";
import { resolveNewsletterConfig } from "../../../supabase/functions/_shared/newsletterConfig";
const resolved = resolveNewsletterConfig(
  {
    site_url: "https://example.com",
    site_name: "Member Site",
    newsletter_from_address: "Member <sender@example.com>",
    newsletter_reply_to: "support@example.com",
  },
  "test-key",
);
if (!resolved.ok) throw new Error("Fixture configuration invalid");
const config = resolved.config;
const token = "a".repeat(64);
describe("transactional offer access email", () => {
  it("uses private fragment links, escapes content, and does not imply a newsletter subscription", () => {
    const result = accessMailPayload(config, "reader@example.com", [
      { title: '<script>alert("x")</script>', token },
    ]);
    expect(result.html).not.toContain("<script>");
    expect(result.html).toContain("&lt;script&gt;");
    expect(result.text).toContain(
      `https://example.com/offer-access#token=${token}`,
    );
    expect(result.html).toContain("valid for 30 days");
    expect(result.to).toEqual(["reader@example.com"]);
    expect(result.text).toContain("not a newsletter subscription");
  });
  it("encrypts bearer links at rest and authenticates the delivery identity and server key", async () => {
    const payload = accessMailPayload(config, "reader@example.com", [
      { title: "Guide", token },
    ]);
    const cipher = await encryptAccessMail(
      payload,
      "long-server-secret",
      "delivery-a",
    );
    expect(cipher).not.toContain(token);
    expect(cipher).not.toContain("reader@example.com");
    expect(
      await decryptAccessMail(cipher, "long-server-secret", "delivery-a"),
    ).toEqual(payload);
    await expect(
      decryptAccessMail(cipher, "different-secret", "delivery-a"),
    ).rejects.toThrow();
    await expect(
      decryptAccessMail(cipher, "long-server-secret", "delivery-b"),
    ).rejects.toThrow();
    await expect(
      decryptAccessMail(
        `${cipher.slice(0, -8)}AAAAAAAA`,
        "long-server-secret",
        "delivery-a",
      ),
    ).rejects.toThrow();
  });
  it("freezes identical provider bodies and idempotency keys across retries", async () => {
    const payload = accessMailPayload(config, "reader@example.com", [
      { title: "Guide", token },
    ]);
    const fetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: "provider-receipt" }), {
        status: 200,
      }),
    );
    expect(await sendAccessMail(payload, "key", "delivery-a", fetcher)).toEqual(
      {
        outcome: "sent",
        providerId: "provider-receipt",
        httpStatus: 200,
        error: null,
        detail: null,
      },
    );
    fetcher.mockResolvedValue(
      new Response(JSON.stringify({ id: "provider-receipt" }), { status: 200 }),
    );
    expect(
      (await sendAccessMail(payload, "key", "delivery-a", fetcher)).providerId,
    ).toBe("provider-receipt");
    const first = fetcher.mock.calls[0][1];
    const second = fetcher.mock.calls[1][1];
    expect(first.body).toBe(second.body);
    expect(first.headers["Idempotency-Key"]).toBe("offer-access-delivery-a");
    expect(second.headers["Idempotency-Key"]).toBe(
      first.headers["Idempotency-Key"],
    );
  });
  it("does not call an ambiguous, rejected, or malformed provider response sent", async () => {
    const payload = accessMailPayload(config, "reader@example.com", [
      { title: "Guide", token },
    ]);
    for (const response of [
      new Response("bad", { status: 500 }),
      new Response("{}", { status: 200 }),
      new Response("not json", { status: 200 }),
    ]) {
      const result = await sendAccessMail(
        payload,
        "key",
        "delivery-a",
        vi.fn().mockResolvedValue(response),
      );
      expect(result.providerId).toBeNull();
      expect(result.outcome).toBe("uncertain");
    }
    const timeout = await sendAccessMail(
      payload,
      "key",
      "delivery-a",
      vi.fn().mockRejectedValue(new Error("timeout")),
    );
    expect(timeout).toMatchObject({
      outcome: "uncertain",
      providerId: null,
      httpStatus: null,
      error: "provider_uncertain",
    });
    expect(timeout.detail).toMatch(/could not reach Resend/i);
  });
  it("records a definitive provider rejection with its status and a redacted, bounded reason", async () => {
    const payload = accessMailPayload(config, "reader@example.com", [
      { title: "Guide", token },
    ]);
    const body = JSON.stringify({
      statusCode: 403,
      name: "validation_error",
      message: `The example.com domain is not verified. Contact reader@example.com.\n${"x".repeat(900)}`,
    });
    const result = await sendAccessMail(
      payload,
      "key",
      "delivery-a",
      vi.fn().mockResolvedValue(new Response(body, { status: 403 })),
    );
    expect(result.outcome).toBe("not_sent");
    expect(result.providerId).toBeNull();
    expect(result.httpStatus).toBe(403);
    expect(result.error).toBe("provider_rejected");
    expect(result.detail).toMatch(/^Resend refused to send \(HTTP 403\)/);
    expect(result.detail).toContain("domain is not verified");
    expect(result.detail).not.toContain("reader@example.com");
    expect(result.detail).not.toMatch(/[\r\n]/);
    expect(result.detail!.length).toBeLessThanOrEqual(500);
  });
  it("treats rate limits as not sent but idempotency conflicts and server errors as uncertain", async () => {
    const payload = accessMailPayload(config, "reader@example.com", [
      { title: "Guide", token },
    ]);
    const send = (status: number) =>
      sendAccessMail(
        payload,
        "key",
        "delivery-a",
        vi
          .fn()
          .mockResolvedValue(
            new Response(JSON.stringify({ message: "nope" }), { status }),
          ),
      );
    expect(await send(429)).toMatchObject({
      outcome: "not_sent",
      httpStatus: 429,
      error: "provider_rate_limited",
    });
    expect(await send(401)).toMatchObject({
      outcome: "not_sent",
      error: "provider_rejected",
    });
    expect((await send(401)).detail).toContain("RESEND_API_KEY");
    expect(await send(422)).toMatchObject({ outcome: "not_sent" });
    expect(await send(409)).toMatchObject({
      outcome: "uncertain",
      error: "provider_uncertain",
    });
    expect(await send(502)).toMatchObject({
      outcome: "uncertain",
      httpStatus: 502,
    });
  });
  it("backs off exponentially from five minutes to a six-hour ceiling", () => {
    expect(
      [1, 2, 3, 4, 5, 6, 7, 8, 9].map(offerDeliveryRetryDelaySeconds),
    ).toEqual([300, 600, 1200, 2400, 4800, 9600, 19200, 21600, 21600]);
    expect(offerDeliveryRetryDelaySeconds(0)).toBe(300);
    expect(offerDeliveryRetryDelaySeconds(Number.NaN)).toBe(300);
    expect(offerDeliveryRetryDelaySeconds(500)).toBe(21600);
  });
  it("generates independent 256-bit access capabilities", () => {
    const first = randomAccessToken();
    const second = randomAccessToken();
    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(second).not.toBe(first);
  });
});
