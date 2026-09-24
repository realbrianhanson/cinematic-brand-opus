import { afterEach, describe, expect, it, vi } from "vitest";
// Load the Deno boundary at test runtime. Frontend tsc must not typecheck remote
// Deno imports/globals; the actual edge entrypoints are checked separately by Deno.
const runtimeModulePath =
  "../../../supabase/functions/_shared/offerAccessMailRuntime.ts";
const { attemptOfferAccess, deliverOfferAccess, offerDeliveryState } =
  (await import(runtimeModulePath)) as {
    attemptOfferAccess: (admin: unknown, id: string) => Promise<string>;
    deliverOfferAccess: (admin: unknown, id: string) => Promise<boolean>;
    offerDeliveryState: (admin: unknown, orderId: string) => Promise<string>;
  };
const orderId = "00000000-0000-4000-8000-000000000001";
type AttemptArgs = {
  _outcome: string;
  _provider_id: string | null;
  _error: string | null;
  _provider_status: number | null;
  _error_detail: string | null;
  _retry_after_seconds: number | null;
};
function fixture() {
  const row = {
    id: "00000000-0000-4000-8000-000000000002",
    email: "reader@example.com",
    order_ids: [orderId],
    lease_id: "lease-a",
    payload_cipher: null as string | null,
    status: "pending",
    attempts: 0,
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
    attempts: [] as AttemptArgs[],
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
      if (name === "offer_claim_access_delivery") {
        if (["sent", "failed", "needs_review"].includes(row.status))
          return { data: null, error: null };
        row.attempts += 1;
        return { data: { ...row }, error: null };
      }
      if (name === "offer_freeze_access_delivery") {
        if (state.freezeFailure) return { data: false, error: null };
        row.payload_cipher = args._payload_cipher as string;
        state.grants = args._grants as unknown[];
        return { data: true, error: null };
      }
      if (name === "offer_record_access_attempt") {
        const attempt = args as unknown as AttemptArgs;
        state.attempts.push(attempt);
        row.status =
          attempt._outcome === "sent"
            ? "sent"
            : attempt._outcome === "blocked"
              ? "needs_review"
              : "pending";
        state.providerId = attempt._provider_id;
        return { data: row.status, error: null };
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
    expect(state.attempts[0]).toMatchObject({
      _outcome: "uncertain",
      _provider_status: 503,
      _error: "provider_uncertain",
    });
    const firstBody = provider.mock.calls[0][1].body;
    expect(row.payload_cipher).not.toContain("#token=");
    expect(state.grants).toHaveLength(1);
    settings.site_name = "Changed Brand";
    expect(await deliverOfferAccess(client, row.id)).toBe(true);
    expect(provider.mock.calls[1][1].body).toBe(firstBody);
    expect(provider.mock.calls[1][1].headers["Idempotency-Key"]).toBe(
      provider.mock.calls[0][1].headers["Idempotency-Key"],
    );
    expect(state.providerId).toBe("receipt-1");
    expect(state.attempts[1]).toMatchObject({
      _outcome: "sent",
      _provider_id: "receipt-1",
      _error: null,
      _error_detail: null,
    });
    expect(await deliverOfferAccess(client, row.id)).toBe(true);
    expect(provider).toHaveBeenCalledTimes(2);
  });
  it("records a provider rejection with its HTTP status, plain-English reason, and exponential backoff", async () => {
    const { client, row, state } = fixture();
    const provider = vi.fn().mockImplementation(
      async () =>
        new Response(
          JSON.stringify({
            message: "The example.com domain is not verified",
          }),
          { status: 403 },
        ),
    );
    vi.stubGlobal("fetch", provider);
    expect(await attemptOfferAccess(client, row.id)).toBe("pending");
    expect(await attemptOfferAccess(client, row.id)).toBe("pending");
    expect(await attemptOfferAccess(client, row.id)).toBe("pending");
    expect(
      state.attempts.map((attempt) => attempt._retry_after_seconds),
    ).toEqual([300, 600, 1200]);
    expect(state.attempts[0]).toMatchObject({
      _outcome: "not_sent",
      _provider_id: null,
      _provider_status: 403,
      _error: "provider_rejected",
    });
    expect(state.attempts[0]._error_detail).toMatch(
      /Resend refused to send \(HTTP 403\).*domain is not verified/,
    );
  });
  it("never contacts the provider before the frozen payload and hashed grants are saved", async () => {
    const { client, row, state } = fixture();
    state.freezeFailure = true;
    const provider = vi.fn();
    vi.stubGlobal("fetch", provider);
    expect(await deliverOfferAccess(client, row.id)).toBe(false);
    expect(provider).not.toHaveBeenCalled();
    expect(state.providerId).toBeNull();
    expect(state.attempts[0]).toMatchObject({
      _outcome: "not_sent",
      _error: "delivery_prepare_failed",
      _provider_status: null,
    });
  });
  it("does not send to a known bounced or complained recipient", async () => {
    const { client, row, state } = fixture();
    state.suppressed = true;
    const provider = vi.fn();
    vi.stubGlobal("fetch", provider);
    expect(await deliverOfferAccess(client, row.id)).toBe(false);
    expect(provider).not.toHaveBeenCalled();
    expect(row.status).toBe("needs_review");
    expect(state.attempts[0]).toMatchObject({
      _outcome: "blocked",
      _error: "recipient_suppressed",
    });
    expect(state.attempts[0]._error_detail).toMatch(/bounced|spam/);
  });
  it("reports a stopped delivery without contacting the provider again", async () => {
    const { client, row } = fixture();
    row.status = "failed";
    const provider = vi.fn();
    vi.stubGlobal("fetch", provider);
    expect(await attemptOfferAccess(client, row.id)).toBe("failed");
    expect(await deliverOfferAccess(client, row.id)).toBe(false);
    expect(provider).not.toHaveBeenCalled();
  });
  it("shows customers a failed delivery as unconfirmed rather than retryable", async () => {
    const { client, row } = fixture();
    row.status = "failed";
    expect(await offerDeliveryState(client, orderId)).toBe("needs_review");
  });
});
