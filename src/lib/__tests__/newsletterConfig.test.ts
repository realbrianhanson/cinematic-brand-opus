import { describe, expect, it } from "vitest";
import {
  buildBatchIdempotencyKey,
  buildConfirmationEmail,
  escapeHtml,
  isValidEmail,
  isValidSender,
  normalizeSiteUrl,
  orderRecipients,
  resolveNewsletterConfig,
  subscribeResponseFor,
} from "@/lib/newsletterConfig";

const goodSettings = {
  site_url: "https://example.com/",
  site_name: "Example & Co",
  author_name: "Jane <Doe>",
  newsletter_from_address: "Example <news@mail.example.com>",
  newsletter_reply_to: "hello@example.com",
  newsletter_postal_address: "1 Main St",
};

describe("configuration validation (fail closed)", () => {
  it("accepts a fully configured site and derives every URL from site_url", () => {
    const res = resolveNewsletterConfig(goodSettings, "re_live_key");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.config.siteUrl).toBe("https://example.com");
    expect(res.config.confirmUrl).toBe(
      "https://example.com/api/public/newsletter/confirm",
    );
    expect(res.config.unsubscribeUrl).toBe(
      "https://example.com/api/public/newsletter/unsubscribe",
    );
    expect(res.config.postBase).toBe("https://example.com/blog");
    expect(res.config.siteName).toBe("Example & Co");
  });

  it("reports every missing setting instead of falling back to a hardcoded sender", () => {
    const res = resolveNewsletterConfig({}, undefined);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.missing).toEqual([
      "site_settings.site_url",
      "site_settings.newsletter_from_address",
      "site_settings.newsletter_reply_to",
      "RESEND_API_KEY",
    ]);
  });

  it.each([
    ["missing api key", goodSettings, ""],
    ["blank api key", goodSettings, "   "],
  ])("fails closed: %s", (_label, settings, key) => {
    expect(resolveNewsletterConfig(settings, key).ok).toBe(false);
  });

  it("rejects an unusable site_url", () => {
    for (const url of [
      "",
      "not-a-url",
      "ftp://example.com",
      "https://localhost",
    ]) {
      expect(normalizeSiteUrl(url)).toBeNull();
    }
    expect(normalizeSiteUrl("https://example.com/base/")).toBe(
      "https://example.com/base",
    );
  });

  it("validates senders and emails", () => {
    expect(isValidSender("a@b.co")).toBe(true);
    expect(isValidSender("Name <a@b.co>")).toBe(true);
    expect(isValidSender("Name a@b.co")).toBe(false);
    expect(isValidSender("")).toBe(false);
    expect(isValidEmail("a@b.co")).toBe(true);
    expect(isValidEmail("a@b")).toBe(false);
    expect(isValidEmail(`${"a".repeat(250)}@b.co`)).toBe(false);
  });
});

describe("HTML escaping", () => {
  it("escapes every dangerous character", () => {
    expect(escapeHtml(`<img src=x onerror="1" & '`)).toBe(
      "&lt;img src=x onerror=&quot;1&quot; &amp; &#39;",
    );
  });

  it("never interpolates raw settings into the confirmation email", () => {
    const res = resolveNewsletterConfig(
      { ...goodSettings, site_name: "<script>alert(1)</script>" },
      "k",
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const { html, subject } = buildConfirmationEmail(res.config, "tok en&1");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("token=tok%20en%261");
    expect(subject).toContain("<script>alert(1)</script>"); // plain-text subject, not HTML
  });
});

describe("public subscribe responses (no enumeration signal)", () => {
  it("returns an identical shape for suppressed and cooldown", () => {
    expect(subscribeResponseFor("suppressed")).toEqual(
      subscribeResponseFor("cooldown"),
    );
    expect(subscribeResponseFor("suppressed").body.state).toBe("accepted");
  });

  it("uses one accepted response for every valid subscriber state", () => {
    for (const state of [
      "confirmation_due",
      "already_subscribed",
      "suppressed",
      "cooldown",
    ] as const) {
      expect(subscribeResponseFor(state)).toEqual({
        status: 200,
        body: { ok: true, state: "accepted" },
      });
    }
    expect(subscribeResponseFor("error").status).toBe(500);
  });
});

describe("send idempotency", () => {
  it("derives stable keys per week and chunk", () => {
    expect(buildBatchIdempotencyKey("nl-2026-W10", 0)).toBe(
      "nl-2026-W10-batch-0",
    );
    expect(buildBatchIdempotencyKey("nl-2026-W10", 0)).toBe(
      buildBatchIdempotencyKey("nl-2026-W10", 0),
    );
    expect(buildBatchIdempotencyKey("nl-2026-W10", 1)).not.toBe(
      buildBatchIdempotencyKey("nl-2026-W10", 0),
    );
  });

  it("orders recipients deterministically so retries chunk identically", () => {
    const a = orderRecipients([{ id: "c" }, { id: "a" }, { id: "b" }]);
    const b = orderRecipients([{ id: "b" }, { id: "c" }, { id: "a" }]);
    expect(a.map((r) => r.id)).toEqual(["a", "b", "c"]);
    expect(a).toEqual(b);
  });
});
