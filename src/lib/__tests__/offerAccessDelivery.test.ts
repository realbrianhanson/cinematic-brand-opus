import { afterEach, describe, expect, it, vi } from "vitest";
// Load the Deno boundary at test runtime. Frontend tsc must not typecheck remote
// Deno imports/globals; the actual edge entrypoints are checked separately by Deno.
const runtimeModulePath =
  "../../../supabase/functions/_shared/offerAccessMailRuntime.ts";
const { deliverOfferAccess } = (await import(runtimeModulePath)) as {
  deliverOfferAccess: (admin: unknown, id: string) => Promise<boolean>;
};
const orderId = "00000000-0000-4000-8000-000000000001";
function fixture() {
  const row = {
    id: "00000000-0000-4000-8000-000000000002",
    email: "reader@example.com",
    order_ids: [orderId],
    lease_id: "lease-a",
    payload_cipher: null as string | null,
    status: "pending",
  };
  const settings = {
    site_url: "https://example.com",
    site_name: "Original Brand",
    newsletter_from_address: "sender@example.com",
    newsletter_reply_to: "support@example.com",
  };
  const state = {
    freezeFailure: false,
    suppressed: false,
    grants: [] as unknown[],
    providerId: null as string | null,
  };
  const query = (data: unknown) => {
    const result = { data, error: null };
    const chain = {
      select: () => chain,
      eq: () => chain,
      in: () => chain,
      limit: () => chain,
      maybeSingle: async () => result,
      then: (resolve: (result: unknown) => unknown) =>
        Promise.resolve(result).then(resolve),
    };
    return chain;
  };
  const client = {
    from: (table: string) =>
      query(
        table === "site_settings"
          ? settings
          : table === "newsletter_subscribers"
            ? state.suppressed
              ? { id: "suppressed" }
              : null
            : table === "offer_orders"
              ? [{ id: orderId, title_snapshot: "Guide" }]
              : { status: row.status },
      ),
    rpc: vi.fn(async (name: string, args: Record<string, unknown>) => {
      if (name === "offer_claim_access_delivery")
        return { data: row.status === "sent" ? null : { ...row }, error: null };
      if (name === "offer_freeze_access_delivery") {
        if (state.freezeFailure) return { data: false, error: null };
        row.payload_cipher = args._payload_cipher as string;
        state.grants = args._grants as unknown[];
        return { data: true, error: null };
      }
      if (name === "offer_finish_access_delivery") {
        row.status = args._provider_id
          ? "sent"
          : args._error === "recipient_suppressed"
            ? "needs_review"
            : "pending";
        state.providerId = args._provider_id as string | null;
        return { data: true, error: null };
      }
      throw new Error(`Unexpected RPC ${name}`);
    }),
  };
  vi.stubGlobal("Deno", {
    env: {
      get: (name: string) =>
        name === "RESEND_API_KEY"
          ? "resend-test-key"
          : name === "SUPABASE_SERVICE_ROLE_KEY"
            ? "service-test-key"
            : undefined,
    },
  });
  return {
    client: client as unknown as Parameters<typeof deliverOfferAccess>[0],
    row,
    state,
    settings,
  };
}
afterEach(() => vi.unstubAllGlobals());
describe("durable access delivery orchestration", () => {
  it("retries the same encrypted payload after provider uncertainty and never resends a saved receipt", async () => {
    const { client, row, state, settings } = fixture();
    const provider = vi
      .fn()
      .mockResolvedValueOnce(new Response("unavailable", { status: 503 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: "receipt-1" }), { status: 200 }),
      );
    vi.stubGlobal("fetch", provider);
    expect(await deliverOfferAccess(client, row.id)).toBe(false);
    const firstBody = provider.mock.calls[0][1].body;
    expect(row.payload_cipher).not.toContain("#token=");
    expect(state.grants).toHaveLength(1);
    settings.site_name = "Changed Brand";
    expect(await deliverOfferAccess(client, row.id)).toBe(true);
    expect(provider.mock.calls[1][1].body).toBe(firstBody);
    expect(state.providerId).toBe("receipt-1");
    expect(await deliverOfferAccess(client, row.id)).toBe(true);
    expect(provider).toHaveBeenCalledTimes(2);
  });
  it("never contacts the provider before the frozen payload and hashed grants are saved", async () => {
    const { client, row, state } = fixture();
    state.freezeFailure = true;
    const provider = vi.fn();
    vi.stubGlobal("fetch", provider);
    expect(await deliverOfferAccess(client, row.id)).toBe(false);
    expect(provider).not.toHaveBeenCalled();
    expect(state.providerId).toBeNull();
  });
  it("does not send to a known bounced or complained recipient", async () => {
    const { client, row, state } = fixture();
    state.suppressed = true;
    const provider = vi.fn();
    vi.stubGlobal("fetch", provider);
    expect(await deliverOfferAccess(client, row.id)).toBe(false);
    expect(provider).not.toHaveBeenCalled();
    expect(row.status).toBe("needs_review");
  });
});
