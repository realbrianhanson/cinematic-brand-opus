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
}));
vi.mock("../../../supabase/functions/_shared/offersRuntime.ts", () => ({
  offerAdminClient: mocks.admin,
  offerIpThrottle: mocks.ipThrottle,
  offerThrottle: mocks.throttle,
  requireOfferAdmin: mocks.requireAdmin,
  offerCors: {},
  offerOrigin: async () => "https://example.com",
  offerStripe: vi.fn(),
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
let dueDeliveries: { id: string }[] = [];
const limits: number[] = [];
const from = vi.fn((table: string) => {
  const result = {
    data:
      table === "offer_orders"
        ? currentOrder
        : table === "offer_access_deliveries"
          ? dueDeliveries
          : { thank_you_message: "" },
    error: null,
    count: 0,
  };
  const chain = {
    select: () => chain,
    eq: () => chain,
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
