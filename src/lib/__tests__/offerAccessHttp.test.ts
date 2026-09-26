import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { OfferError } from "../../../supabase/functions/_shared/offers";
const mocks = vi.hoisted(() => ({
  admin: vi.fn(),
  throttle: vi.fn(),
  ipThrottle: vi.fn(),
  requireAdmin: vi.fn(),
  mailer: vi.fn(),
  prepare: vi.fn(),
  deliver: vi.fn(),
  attempt: vi.fn(),
  requeue: vi.fn(),
  overview: vi.fn(),
  cronAuth: vi.fn(),
  resolve: vi.fn(),
  state: vi.fn(),
  background: vi.fn(),
  signed: vi.fn(),
  rpc: vi.fn(),
  stripe: vi.fn(),
  retrieveCheckout: vi.fn(),
  createCheckout: vi.fn(),
}));
vi.mock("../../../supabase/functions/_shared/offersRuntime.ts", () => ({
  offerAdminClient: mocks.admin,
  offerIpThrottle: mocks.ipThrottle,
  offerThrottle: mocks.throttle,
  requireOfferAdmin: mocks.requireAdmin,
  offerCors: {},
  offerOrigin: async () => "https://example.com",
  offerStripe: mocks.stripe,
  offerDatabaseError: (error: unknown) => error,
  offerJson: (status: number, body: unknown) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  offerFailure: (error: { status?: number; message?: string; code?: string }) =>
    new Response(
      JSON.stringify({
        error: error.message ?? "Unavailable",
        code: error.code ?? "unavailable",
      }),
      { status: error.status ?? 503 },
    ),
}));
vi.mock("../../../supabase/functions/_shared/cronAuth.ts", () => ({
  authorizeCronOrAdmin: mocks.cronAuth,
}));
vi.mock(
  "../../../supabase/functions/_shared/offerAccessMailRuntime.ts",
  () => ({
    attemptOfferAccess: mocks.attempt,
    backgroundOfferDelivery: mocks.background,
    deliverOfferAccess: mocks.deliver,
    offerDeliveryOverview: mocks.overview,
    requeueOfferDelivery: mocks.requeue,
    offerDeliveryState: mocks.state,
    prepareOfferDelivery: mocks.prepare,
    resolveOfferMailer: mocks.mailer,
    resolveOrderTokenHash: mocks.resolve,
  }),
);
let handler: (request: Request) => Promise<Response>;
const token = "a".repeat(64),
  original = "b".repeat(64);
let currentOrder: Record<string, unknown> | null = null;
let currentParent: Record<string, unknown> | null = null;
let currentItems: Record<string, unknown>[] = [];
let currentOffer: Record<string, unknown> = { thank_you_message: "" };
let currentBump: Record<string, unknown> | null = null;
let dueDeliveries: { id: string }[] = [];
const limits: number[] = [];
const from = vi.fn((table: string) => {
  const result = {
    data:
      table === "offer_order_items"
        ? currentItems
        : table === "offer_orders"
          ? currentOrder
          : table === "offer_access_deliveries"
            ? dueDeliveries
            : currentOffer,
    error: null,
    count: 0,
  };
  const chain = {
    select: () => chain,
    eq: (column: string, value: unknown) => {
      if (
        table === "offers" &&
        column === "id" &&
        value === currentOffer.bump_offer_id
      )
        result.data = currentBump;
      if (
        table === "offer_orders" &&
        column === "id" &&
        value === currentOrder?.parent_order_id
      )
        result.data = currentParent;
      return chain;
    },
    in: () => chain,
    lte: () => chain,
    order: () => chain,
    limit: (value: number) => {
      limits.push(value);
      return chain;
    },
    maybeSingle: async () => result,
    then: (resolve: (value: unknown) => unknown) =>
      Promise.resolve(result).then(resolve),
  };
  return chain;
});
const request = (body: unknown, headers: Record<string, string> = {}) =>
  handler(
    new Request("https://functions.example.com/offers-api", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    }),
  );
const deliveryIds = (count: number) =>
  Array.from({ length: count }, (_, index) => ({
    id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
  }));
beforeAll(async () => {
  vi.stubGlobal("Deno", {
    env: { get: () => undefined },
    serve: (callback: typeof handler) => {
      handler = callback;
    },
  });
  // Runtime import keeps Deno-only globals and remote modules out of frontend tsc.
  const entrypoint = "../../../supabase/functions/offers-api/index.ts";
  await import(entrypoint);
});
beforeEach(() => {
  vi.clearAllMocks();
  currentOrder = null;
  currentParent = null;
  currentItems = [];
  currentOffer = { thank_you_message: "" };
  currentBump = null;
  mocks.stripe.mockReturnValue({
    checkout: {
      sessions: {
        retrieve: mocks.retrieveCheckout,
        create: mocks.createCheckout,
      },
    },
  });
  dueDeliveries = [];
  limits.length = 0;
  vi.stubGlobal("Deno", { env: { get: () => undefined } });
  mocks.admin.mockReturnValue({
    from,
    rpc: mocks.rpc,
    storage: { from: () => ({ createSignedUrl: mocks.signed }) },
  });
  mocks.mailer.mockResolvedValue({ ok: true, config: {} });
  mocks.prepare.mockResolvedValue(null);
  mocks.deliver.mockResolvedValue(true);
  mocks.resolve.mockResolvedValue(original);
  mocks.state.mockResolvedValue("sent");
  mocks.throttle.mockResolvedValue(undefined);
  mocks.ipThrottle.mockResolvedValue(undefined);
  mocks.requireAdmin.mockResolvedValue(undefined);
  mocks.rpc.mockResolvedValue({ data: null, error: null });
  mocks.cronAuth.mockResolvedValue({ ok: true, mode: "admin", userId: "u" });
  mocks.attempt.mockResolvedValue("sent");
  mocks.requeue.mockResolvedValue(true);
  mocks.overview.mockResolvedValue({
    delivery_failed: 0,
    delivery_next_retry_at: null,
    delivery_last_issue: null,
  });
});
afterEach(() => vi.unstubAllGlobals());
describe("offer access HTTP security boundaries", () => {
  it("requires email configuration for paid readiness consistently across health, preview, get, and status", async () => {
    const settings: Record<string, string> = {
      STRIPE_SECRET_KEY: "sk_test_example",
      STRIPE_WEBHOOK_SECRET: "whsec_example",
      SUPABASE_URL: "https://backend.example.com",
    };
    vi.stubGlobal("Deno", { env: { get: (key: string) => settings[key] } });
    mocks.mailer.mockResolvedValue({ ok: false, missing: ["RESEND_API_KEY"] });
    currentOrder = {
      id: "order-id",
      status: "fulfilled",
      token_hash: original,
      amount_minor: 0,
    };
    for (const body of [
      { action: "health" },
      { action: "preview", offer_id: "00000000-0000-4000-8000-000000000001" },
      { action: "get", slug: "guide" },
      { action: "status", token },
    ]) {
      const response = await request(body);
      expect(response.status).toBe(200);
      const result = await response.json();
      expect(result.payments_ready).toBe(false);
      if (body.action === "health") {
        expect(result.secret_configured).toBe(true);
        expect(result.webhook_configured).toBe(true);
        expect(result.delivery_ready).toBe(false);
      }
    }
  });
  it("returns identical acknowledgement for unknown, known, and email-throttled recovery", async () => {
    const unknown = await request({
      action: "recover",
      email: "reader@example.com",
    });
    mocks.prepare.mockResolvedValue("delivery-id");
    const known = await request({
      action: "recover",
      email: "reader@example.com",
    });
    mocks.throttle.mockRejectedValueOnce(
      new OfferError(429, "rate_limited", "Wait"),
    );
    const throttled = await request({
      action: "recover",
      email: "reader@example.com",
    });
    expect([unknown.status, known.status, throttled.status]).toEqual([
      200, 200, 200,
    ]);
    expect(await unknown.json()).toEqual({ accepted: true });
    expect(await known.json()).toEqual({ accepted: true });
    expect(await throttled.json()).toEqual({ accepted: true });
    expect(mocks.prepare).toHaveBeenCalledTimes(2);
    expect(mocks.background).toHaveBeenCalledTimes(1);
  });
  it("fails closed for missing mail configuration without revealing orders or creating access", async () => {
    mocks.mailer.mockResolvedValue({ ok: false, missing: ["RESEND_API_KEY"] });
    const response = await request({
      action: "recover",
      email: "reader@example.com",
    });
    expect(response.status).toBe(503);
    expect((await response.json()).code).toBe("delivery_unavailable");
    expect(mocks.prepare).not.toHaveBeenCalled();
    expect(mocks.deliver).not.toHaveBeenCalled();
  });
  it("requires admin or cron authorization before listing or retrying deliveries", async () => {
    mocks.cronAuth.mockResolvedValue(
      new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 }),
    );
    dueDeliveries = deliveryIds(2);
    const response = await request({ action: "retry_deliveries" });
    expect(response.status).toBe(401);
    expect((await response.json()).code).toBe("unauthorized");
    expect(from).not.toHaveBeenCalled();
    expect(mocks.attempt).not.toHaveBeenCalled();
    mocks.cronAuth.mockResolvedValue(
      new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 }),
    );
    expect((await request({ action: "retry_deliveries" })).status).toBe(403);
    expect(mocks.attempt).not.toHaveBeenCalled();
  });
  it("lets the cron secret retry a bounded batch and reports sent, pending, and stopped counts", async () => {
    mocks.cronAuth.mockResolvedValue({ ok: true, mode: "cron" });
    dueDeliveries = deliveryIds(4);
    mocks.attempt
      .mockResolvedValueOnce("sent")
      .mockResolvedValueOnce("pending")
      .mockResolvedValueOnce("failed")
      .mockRejectedValueOnce(new Error("Delivery receipt could not be saved"));
    const response = await request(
      { action: "retry_deliveries" },
      { "x-cron-secret": "cron-secret" },
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      sent: 1,
      remaining: 3,
      stopped: 1,
      errors: 1,
    });
    expect(limits).toEqual([10]);
    expect(mocks.requireAdmin).not.toHaveBeenCalled();
    expect(mocks.attempt).toHaveBeenCalledTimes(4);
  });
  it("keeps the admin batch at three deliveries", async () => {
    dueDeliveries = deliveryIds(3);
    const response = await request({ action: "retry_deliveries" });
    expect(await response.json()).toMatchObject({ sent: 3, remaining: 0 });
    expect(limits).toEqual([3]);
  });
  it("skips unattended retries without claiming anything when email is not configured", async () => {
    mocks.cronAuth.mockResolvedValue({ ok: true, mode: "cron" });
    mocks.mailer.mockResolvedValue({ ok: false, missing: ["RESEND_API_KEY"] });
    dueDeliveries = deliveryIds(2);
    const cron = await request({ action: "retry_deliveries" });
    expect(cron.status).toBe(200);
    expect(await cron.json()).toMatchObject({
      sent: 0,
      skipped: "delivery_unavailable",
    });
    mocks.cronAuth.mockResolvedValue({ ok: true, mode: "admin" });
    const manual = await request({ action: "retry_deliveries" });
    expect(manual.status).toBe(503);
    expect((await manual.json()).code).toBe("delivery_unavailable");
    expect(mocks.attempt).not.toHaveBeenCalled();
  });
  it("allows only an administrator to requeue a stopped delivery", async () => {
    const id = "00000000-0000-4000-8000-00000000000a";
    mocks.cronAuth.mockResolvedValue({ ok: true, mode: "cron" });
    const cron = await request({ action: "retry_deliveries", requeue_id: id });
    expect(cron.status).toBe(403);
    expect(mocks.requeue).not.toHaveBeenCalled();
    mocks.cronAuth.mockResolvedValue({ ok: true, mode: "admin" });
    expect(
      (await request({ action: "retry_deliveries", requeue_id: "nope" }))
        .status,
    ).toBe(400);
    mocks.requeue.mockResolvedValueOnce(false);
    const refused = await request({
      action: "retry_deliveries",
      requeue_id: id,
    });
    expect(refused.status).toBe(409);
    expect((await refused.json()).code).toBe("requeue_unavailable");
    dueDeliveries = [{ id }];
    const accepted = await request({
      action: "retry_deliveries",
      requeue_id: id,
    });
    expect(accepted.status).toBe(200);
    expect(await accepted.json()).toMatchObject({ requeued: true, sent: 1 });
    expect(mocks.requeue).toHaveBeenLastCalledWith(expect.anything(), id);
  });
  it("adds failed counts and the latest plain-English delivery issue to admin health", async () => {
    vi.stubGlobal("Deno", {
      env: {
        get: (key: string) =>
          key === "SUPABASE_URL" ? "https://backend.example.com" : undefined,
      },
    });
    const issue = {
      status: "pending",
      attempts: 2,
      provider_status: 403,
      detail: "Resend refused to send (HTTP 403).",
      at: "2026-09-23T10:00:00.000Z",
      next_attempt_at: "2026-09-23T10:10:00.000Z",
    };
    mocks.overview.mockResolvedValue({
      delivery_failed: 1,
      delivery_next_retry_at: issue.next_attempt_at,
      delivery_last_issue: issue,
    });
    const response = await request({ action: "health" });
    expect(await response.json()).toMatchObject({
      delivery_failed: 1,
      delivery_next_retry_at: issue.next_attempt_at,
      delivery_last_issue: issue,
    });
  });
  it("denies a refunded order even with a valid emailed capability", async () => {
    currentOrder = { id: "order-id", status: "refunded", token_hash: original };
    const response = await request({ action: "download", token });
    expect(response.status).toBe(403);
    expect((await response.json()).code).toBe("download_unavailable");
    expect(mocks.signed).not.toHaveBeenCalled();
  });
  it("counts a download only after storage successfully issues its signed URL", async () => {
    currentOrder = {
      id: "order-id",
      status: "fulfilled",
      token_hash: original,
      asset_name_snapshot: "guide.pdf",
      asset_path_snapshot: "private/guide.pdf",
    };
    mocks.signed.mockResolvedValueOnce({
      data: null,
      error: new Error("Storage unavailable"),
    });
    expect((await request({ action: "download", token })).status).toBe(503);
    expect(mocks.rpc).not.toHaveBeenCalled();
    mocks.signed.mockResolvedValue({
      data: { signedUrl: "https://storage.example.com/signed" },
      error: null,
    });
    const response = await request({ action: "download", token });
    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith("conversion_record_download", {
      _order_id: "order-id",
    });
    expect(await response.json()).toEqual({
      url: "https://storage.example.com/signed",
      filename: "guide.pdf",
    });
  });
  it("returns the authorized download when optional accounting is unavailable", async () => {
    currentOrder = {
      id: "order-id",
      status: "fulfilled",
      token_hash: original,
      asset_name_snapshot: "guide.pdf",
      asset_path_snapshot: "private/guide.pdf",
    };
    mocks.signed.mockResolvedValue({
      data: { signedUrl: "https://storage.example.com/signed" },
      error: null,
    });
    mocks.rpc.mockRejectedValue(new Error("Measurement unavailable"));
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect((await request({ action: "download", token })).status).toBe(200);
    warning.mockRestore();
  });
  it("never treats an email address as download authorization", async () => {
    const response = await request({
      action: "download",
      email: "reader@example.com",
    });
    expect(response.status).toBe(400);
    expect(mocks.resolve).not.toHaveBeenCalled();
    expect(mocks.signed).not.toHaveBeenCalled();
  });
  it("rejects an oversized recovery body before querying customer data", async () => {
    const response = await request({
      action: "recover",
      email: "reader@example.com",
      padding: "x".repeat(5000),
    });
    expect(response.status).toBe(400);
    expect(mocks.prepare).not.toHaveBeenCalled();
  });
});

describe("controlled checkout recovery HTTP adapter", () => {
  function prepareRetry() {
    const settings: Record<string, string> = {
      STRIPE_SECRET_KEY: "sk_test_fixture",
      STRIPE_WEBHOOK_SECRET: "whsec_fixture",
    };
    vi.stubGlobal("Deno", { env: { get: (key: string) => settings[key] } });
    currentOrder = {
      id: "11111111-1111-4111-8111-111111111111",
      offer_id: "22222222-2222-4222-8222-222222222222",
      parent_order_id: "33333333-3333-4333-8333-333333333333",
      email: "reader@example.com",
      status: "expired",
      amount_minor: 2700,
      currency: "usd",
      title_snapshot: "Toolkit",
      stripe_session_id: "cs_original",
      checkout_attempt: 1,
      checkout_expires_at: new Date(Date.now() - 1000).toISOString(),
    };
    currentParent = {
      status: "fulfilled",
      declined_at: null,
      next_offer_deadline: new Date(Date.now() + 3 * 3600_000).toISOString(),
    };
    mocks.retrieveCheckout.mockResolvedValue({
      id: "cs_original",
      mode: "payment",
      status: "expired",
      payment_status: "unpaid",
      payment_intent: null,
      livemode: false,
      metadata: { integration: "site-offers", offer_order_id: currentOrder.id },
    });
    mocks.createCheckout.mockResolvedValue({
      id: "cs_retry",
      url: "https://checkout.stripe.com/retry",
      payment_intent: null,
    });
    mocks.rpc.mockImplementation(async (name: string) => ({
      data:
        name === "offer_prepare_checkout_retry"
          ? {
              ...currentOrder,
              status: "pending",
              stripe_session_id: null,
              checkout_attempt: 2,
              checkout_expires_at: new Date(
                Date.now() + 3600_000,
              ).toISOString(),
            }
          : null,
      error: null,
    }));
  }
  it("requires an existing private link, fresh expanded Stripe read, and a successful transaction before creating a session", async () => {
    prepareRetry();
    currentItems = [
      {
        order_id: currentOrder!.id,
        role: "primary",
        amount_minor: 2200,
        currency: "usd",
        title_snapshot: "Original toolkit",
      },
      {
        order_id: currentOrder!.id,
        role: "bump",
        amount_minor: 500,
        currency: "usd",
        title_snapshot: "Original extra",
      },
    ];
    const response = await request({ action: "retry_checkout", token });
    expect(response.status).toBe(200);
    expect(
      mocks.createCheckout.mock.calls[0][0].line_items.map(
        (item: { price_data: { unit_amount: number } }) =>
          item.price_data.unit_amount,
      ),
    ).toEqual([2200, 500]);
    expect(await response.json()).toMatchObject({
      status: "pending",
      checkout_url: "https://checkout.stripe.com/retry",
    });
    expect(mocks.retrieveCheckout).toHaveBeenCalledWith("cs_original", {
      expand: ["payment_intent"],
    });
    expect(mocks.rpc).toHaveBeenCalledWith(
      "offer_prepare_checkout_retry",
      expect.objectContaining({
        _order_id: currentOrder!.id,
        _session_id: "cs_original",
        _checkout_attempt: 1,
        _payment_intent_id: null,
        _origin: "https://example.com",
      }),
    );
    expect(mocks.createCheckout).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ offer_checkout_attempt: "2" }),
      }),
      { idempotencyKey: `site-offer-${currentOrder!.id}-attempt-2` },
    );
    expect(mocks.rpc).toHaveBeenCalledWith(
      "offer_record_checkout",
      expect.objectContaining({
        _checkout_attempt: 2,
        _session_id: "cs_retry",
      }),
    );
    expect(mocks.prepare).not.toHaveBeenCalled();
    expect(mocks.deliver).not.toHaveBeenCalled();
  });
  it("does not create a payment after provider uncertainty or a refused database reservation", async () => {
    prepareRetry();
    mocks.retrieveCheckout.mockRejectedValueOnce(new Error("provider timeout"));
    expect((await request({ action: "retry_checkout", token })).status).toBe(
      503,
    );
    expect(mocks.createCheckout).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
    mocks.rpc.mockResolvedValue({
      error: new OfferError(409, "changed", "Checkout changed"),
    });
    expect((await request({ action: "retry_checkout", token })).status).toBe(
      409,
    );
    expect(mocks.createCheckout).not.toHaveBeenCalled();
  });
  it("keeps recovery unavailable without a matching order or working mail delivery", async () => {
    prepareRetry();
    currentOrder = null;
    expect((await request({ action: "retry_checkout", token })).status).toBe(
      404,
    );
    expect(mocks.retrieveCheckout).not.toHaveBeenCalled();
    prepareRetry();
    mocks.mailer.mockResolvedValue({ ok: false });
    expect((await request({ action: "retry_checkout", token })).status).toBe(
      503,
    );
    expect(mocks.retrieveCheckout).not.toHaveBeenCalled();
    expect(mocks.createCheckout).not.toHaveBeenCalled();
  });
  it("reports retry eligibility without contacting Stripe or mutating on a status read", async () => {
    prepareRetry();
    const response = await request({ action: "status", token });
    expect((await response.json()).checkout_recovery.available).toBe(true);
    expect(mocks.retrieveCheckout).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});

describe("immutable checkout basket HTTP access", () => {
  it("signs only an owned basket item and never exposes storage paths in status", async () => {
    currentOrder = {
      id: "order",
      offer_id: "primary",
      status: "fulfilled",
      title_snapshot: "Primary",
      asset_path_snapshot: "private/primary.pdf",
      asset_name_snapshot: "primary.pdf",
      amount_minor: 2400,
      currency: "usd",
      next_offer_id: null,
    };
    currentItems = [
      {
        id: "00000000-0000-4000-8000-000000000099",
        order_id: "order",
        offer_id: "bump",
        role: "bump",
        title_snapshot: "Extra",
        asset_path_snapshot: "private/extra.pdf",
        asset_name_snapshot: "extra.pdf",
        amount_minor: 500,
        currency: "usd",
      },
    ];
    mocks.signed.mockResolvedValue({
      data: { signedUrl: "https://files.example.com/signed" },
      error: null,
    });
    const status = await request({ action: "status", token });
    const body = await status.json();
    expect(body.items[0]).toMatchObject({
      title: "Extra",
      asset_name: "extra.pdf",
      role: "bump",
    });
    expect(JSON.stringify(body)).not.toContain("private/");
    const download = await request({
      action: "download",
      token,
      item_id: currentItems[0].id,
    });
    expect(download.status).toBe(200);
    expect(mocks.signed).toHaveBeenCalledWith("private/extra.pdf", 300, {
      download: "extra.pdf",
    });
    mocks.signed.mockClear();
    expect(
      (
        await request({
          action: "download",
          token,
          item_id: "00000000-0000-4000-8000-000000000098",
        })
      ).status,
    ).toBe(403);
    currentOrder.status = "refunded";
    expect(
      (
        await request({
          action: "download",
          token,
          item_id: currentItems[0].id,
        })
      ).status,
    ).toBe(403);
    expect(mocks.signed).not.toHaveBeenCalled();
  });
  it("binds a decline to the offer the visitor actually saw", async () => {
    currentOrder = { id: "order", status: "fulfilled" };
    const offerId = "00000000-0000-4000-8000-000000000099";
    expect(
      (await request({ action: "decline", token, offer_id: offerId })).status,
    ).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith("offer_decline_next", {
      _token_hash: original,
      _offer_id: offerId,
    });
  });
});

it("refuses a paid extra on a free offer before reserving when payment configuration is missing", async () => {
  mocks.resolve.mockResolvedValue(null);
  const id = "11111111-1111-4111-8111-111111111111";
  const bump = "22222222-2222-4222-8222-222222222222";
  currentOffer = {
    id,
    kind: "free",
    checkout_mode: "native",
    bump_offer_id: bump,
  };
  const response = await request({
    action: "claim",
    token,
    offer_id: id,
    bump_offer_id: bump,
    email: "buyer@example.com",
  });
  expect(response.status).toBe(503);
  expect(mocks.rpc).not.toHaveBeenCalled();
  expect(mocks.createCheckout).not.toHaveBeenCalled();
});

it("allows an authenticated draft preview to show only the eligible extra description", async () => {
  currentOffer = {
    id: "11111111-1111-4111-8111-111111111111",
    status: "draft",
    checkout_mode: "native",
    currency: "usd",
    bump_offer_id: "22222222-2222-4222-8222-222222222222",
  };
  currentBump = {
    id: currentOffer.bump_offer_id,
    slug: "extra",
    title: "Extra",
    summary: "Useful files",
    cover_url: null,
    kind: "paid",
    amount_minor: 500,
    currency: "usd",
    asset_path: "private/secret.pdf",
  };
  const response = await request({
    action: "preview",
    offer_id: currentOffer.id,
  });
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body.offer.bump_offer).toMatchObject({
    id: currentBump.id,
    title: "Extra",
    amount_minor: 500,
  });
  expect(body.offer.bump_offer_id).toBeUndefined();
  expect(JSON.stringify(body)).not.toContain("private/");
  expect(mocks.requireAdmin).toHaveBeenCalledOnce();
});
