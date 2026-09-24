import { describe, expect, it, vi } from "vitest";
import {
  speakingNotificationPayload,
  speakingNotificationRecipient,
  sendSpeakingNotification,
} from "../../../supabase/functions/_shared/speakingNotifications";
import { resolveNewsletterConfig } from "../../../supabase/functions/_shared/newsletterConfig";

const resolved = resolveNewsletterConfig(
  {
    site_url: "https://example.com",
    site_name: "Example",
    newsletter_from_address: "Example <hello@example.com>",
    newsletter_reply_to: "owner@example.com",
  },
  "test-key",
);
if (!resolved.ok) throw new Error("Invalid test fixture");
const config = resolved.config;
const inquiry = {
  name: "<script>bad()</script>",
  email: "organizer@example.com",
  event_name: "<a href='https://evil.example'>Click me</a>",
  event_date: "Autumn",
  event_format: "virtual" as const,
  audience: "Owners",
  message: "Untrusted event details",
};
describe("speaking transactional email", () => {
  it("keeps untrusted submitted content out of organizer acknowledgements", () => {
    const payload = speakingNotificationPayload(
      config,
      "owner@example.com",
      "acknowledgement",
      inquiry,
    );
    expect(payload.to).toEqual([inquiry.email]);
    expect(payload.reply_to).toBe("owner@example.com");
    expect(payload.html).not.toContain("evil.example");
    expect(payload.text).not.toContain(inquiry.message);
    expect(payload.text).toContain(
      "availability and booking details have not been agreed",
    );
    expect(payload.text).toContain("does not subscribe you");
  });
  it("escapes owner mail and links to the private inbox", () => {
    const payload = speakingNotificationPayload(
      config,
      "owner@example.com",
      "owner",
      inquiry,
    );
    expect(payload.to).toEqual(["owner@example.com"]);
    expect(payload.reply_to).toBe(inquiry.email);
    expect(payload.html).toContain("&lt;script&gt;");
    expect(payload.html).not.toContain("<script>");
    expect(payload.html).toContain(
      'href="https://example.com/admin/inquiries"',
    );
    expect(
      speakingNotificationPayload(
        config,
        "owner@example.com",
        "reminder",
        inquiry,
      ).text,
    ).toContain("48 hours");
  });
  it("uses a configured recipient with an existing brand fallback", () => {
    expect(speakingNotificationRecipient("", "owner@example.com")).toBe(
      "owner@example.com",
    );
    expect(
      speakingNotificationRecipient("Other@Example.com", "owner@example.com"),
    ).toBe("other@example.com");
    expect(
      speakingNotificationRecipient(
        "bad\r\nbcc:bad@example.com",
        "owner@example.com",
      ),
    ).toBeNull();
    expect(() =>
      speakingNotificationPayload(
        { ...config, siteUrl: "http://example.com" },
        "owner@example.com",
        "owner",
        inquiry,
      ),
    ).toThrow();
  });
  it("reuses a stable provider idempotency key and requires a receipt", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(JSON.stringify({ id: "receipt" }), { status: 200 }),
      );
    const payload = speakingNotificationPayload(
      config,
      "owner@example.com",
      "owner",
      inquiry,
    );
    const result = await sendSpeakingNotification(
      payload,
      "test-key",
      "delivery-1",
      fetcher,
    );
    expect(result.outcome).toBe("sent");
    expect(fetcher.mock.calls[0][1]?.headers).toMatchObject({
      "Idempotency-Key": "speaking-delivery-1",
    });
    fetcher.mockResolvedValue(new Response("{}", { status: 200 }));
    expect(
      (
        await sendSpeakingNotification(
          payload,
          "test-key",
          "delivery-1",
          fetcher,
        )
      ).outcome,
    ).toBe("uncertain");
    fetcher.mockRejectedValue(new Error("timeout"));
    expect(
      (
        await sendSpeakingNotification(
          payload,
          "test-key",
          "delivery-1",
          fetcher,
        )
      ).outcome,
    ).toBe("uncertain");
  });
});
