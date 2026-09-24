import { afterEach, describe, expect, it, vi } from "vitest";
const runtimeModulePath =
  "../../../supabase/functions/_shared/speakingNotificationsRuntime.ts";
const { processSpeakingNotifications } = (await import(runtimeModulePath)) as {
  processSpeakingNotifications(admin: unknown): Promise<unknown>;
};

function fixture(suppressed: boolean | null, error: unknown = null) {
  const payload = {
    from: "sender@example.com",
    to: ["original@example.com"],
    reply_to: "owner@example.com",
    subject: "Saved acknowledgement",
    text: "Saved text",
    html: "Saved HTML",
  };
  const query = (data: unknown) => {
    const response = { data, error: null };
    const chain = {
      select: () => chain,
      order: () => chain,
      in: () => chain,
      lte: () => chain,
      limit: () => chain,
      maybeSingle: async () => response,
      then: (resolve: (result: unknown) => unknown) =>
        Promise.resolve(response).then(resolve),
    };
    return chain;
  };
  const rpc = vi.fn(async (name: string) => {
    if (name === "claim_speaking_notification")
      return {
        data: {
          id: "delivery",
          lease_id: "lease",
          kind: "acknowledgement",
          payload,
          inquiry: { email: "new@example.com" },
        },
        error: null,
      };
    if (name === "transactional_email_is_suppressed")
      return { data: suppressed, error };
    return { data: true, error: null };
  });
  const admin = {
    rpc,
    from: (table: string) =>
      query(
        table === "site_settings_private"
          ? {
              speaking_notifications_enabled: true,
              speaking_notification_email: "owner@example.com",
            }
          : table === "site_settings"
            ? {
                site_url: "https://example.com",
                site_name: "Example",
                newsletter_from_address: "sender@example.com",
                newsletter_reply_to: "owner@example.com",
              }
            : [{ id: "delivery" }],
      ),
  };
  const provider = vi
    .fn()
    .mockResolvedValue(
      new Response(JSON.stringify({ id: "receipt" }), { status: 200 }),
    );
  vi.stubGlobal("Deno", { env: { get: () => "test-key" } });
  vi.stubGlobal("fetch", provider);
  return { admin, rpc, provider, payload };
}
afterEach(() => vi.unstubAllGlobals());
describe("speaking suppression preflight", () => {
  it("checks the frozen recipient and stops a speaking-only suppression", async () => {
    const { admin, rpc, provider } = fixture(true);
    await processSpeakingNotifications(admin);
    expect(rpc).toHaveBeenCalledWith("transactional_email_is_suppressed", {
      _email: "original@example.com",
    });
    expect(provider).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith(
      "record_speaking_notification",
      expect.objectContaining({ _outcome: "blocked" }),
    );
  });
  it("fails closed when suppression storage is unavailable", async () => {
    const { admin, provider } = fixture(
      null,
      new Error("Database unavailable"),
    );
    await processSpeakingNotifications(admin);
    expect(provider).not.toHaveBeenCalled();
  });
  it("sends the exact frozen payload only after a successful suppression check", async () => {
    const { admin, provider, payload } = fixture(false);
    await processSpeakingNotifications(admin);
    expect(provider).toHaveBeenCalledExactlyOnceWith(
      "https://api.resend.com/emails",
      expect.objectContaining({ body: JSON.stringify(payload) }),
    );
  });
});
