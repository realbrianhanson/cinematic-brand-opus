import { describe, expect, it, vi } from "vitest";
import {
  deliverNewsletter,
  TOKEN_PLACEHOLDER,
  type DeliveryBatch,
} from "../../../supabase/functions/_shared/newsletterDelivery";

const batch: DeliveryBatch = {
  attempt_id: "a1",
  template: {
    from: "sender@example.com",
    reply_to: "reply@example.com",
    subject: "Digest",
    html: `<a href="/u?token=${TOKEN_PLACEHOLDER}">Unsubscribe</a>`,
  },
  recipients: [
    { id: "1", email: "one@example.com", confirm_token: "tok en/1" },
    { id: "2", email: "two@example.com", confirm_token: "token-2" },
  ],
};

function port(unsubscribeUrl?: string) {
  const batches = [structuredClone(batch)];
  const send = vi.fn(
    async (payload: unknown) =>
      new Response(
        JSON.stringify({
          data: (payload as unknown[]).map((_, i) => ({ id: `r${i}` })),
        }),
      ),
  );
  return {
    send,
    port: {
      nextBatch: vi.fn(async () => batches.shift() ?? null),
      record: vi.fn(async () => {}),
      send,
      unsubscribeUrl,
    },
  };
}

describe("List-Unsubscribe headers", () => {
  it("adds per-recipient one-click unsubscribe headers", async () => {
    const h = port("https://brianhanson.com/api/public/newsletter/unsubscribe");
    await deliverNewsletter("s", h.port);
    const payload = h.send.mock.calls[0][0] as Array<{
      to: string[];
      headers: Record<string, string>;
    }>;
    expect(payload[0].headers).toEqual({
      "List-Unsubscribe":
        "<https://brianhanson.com/api/public/newsletter/unsubscribe?token=tok%20en%2F1>",
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    });
    expect(payload[1].headers["List-Unsubscribe"]).toContain("token=token-2");
  });

  it("omits the headers when no unsubscribe URL is known", async () => {
    const h = port();
    await deliverNewsletter("s", h.port);
    const payload = h.send.mock.calls[0][0] as Array<Record<string, unknown>>;
    expect(payload[0]).not.toHaveProperty("headers");
  });
});
