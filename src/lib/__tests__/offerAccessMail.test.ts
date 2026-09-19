import { describe, expect, it, vi } from "vitest";
import {
  accessMailPayload,
  decryptAccessMail,
  encryptAccessMail,
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
    expect(await sendAccessMail(payload, "key", "delivery-a", fetcher)).toBe(
      "provider-receipt",
    );
    fetcher.mockResolvedValue(
      new Response(JSON.stringify({ id: "provider-receipt" }), { status: 200 }),
    );
    expect(await sendAccessMail(payload, "key", "delivery-a", fetcher)).toBe(
      "provider-receipt",
    );
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
      expect(
        await sendAccessMail(
          payload,
          "key",
          "delivery-a",
          vi.fn().mockResolvedValue(response),
        ),
      ).toBeNull();
    }
    expect(
      await sendAccessMail(
        payload,
        "key",
        "delivery-a",
        vi.fn().mockRejectedValue(new Error("timeout")),
      ),
    ).toBeNull();
  });
  it("generates independent 256-bit access capabilities", () => {
    const first = randomAccessToken();
    const second = randomAccessToken();
    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(second).not.toBe(first);
  });
});
