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
  resolve: vi.fn(),
  state: vi.fn(),
  background: vi.fn(),
  signed: vi.fn(),
}));
vi.mock("../../../supabase/functions/_shared/offersRuntime.ts", () => ({
  offerAdminClient: mocks.admin,
  offerIpThrottle: mocks.ipThrottle,
  offerThrottle: mocks.throttle,
  requireOfferAdmin: mocks.requireAdmin,
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
vi.mock(
  "../../../supabase/functions/_shared/offerAccessMailRuntime.ts",
  () => ({
    backgroundOfferDelivery: mocks.background,
    deliverOfferAccess: mocks.deliver,
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
const from = vi.fn((table: string) => {
  const result = {
    data: table === "offer_orders" ? currentOrder : { thank_you_message: "" },
    error: null,
    count: 0,
  };
  const chain = {
    select: () => chain,
    eq: () => chain,
    in: () => chain,
    limit: () => chain,
    maybeSingle: async () => result,
    then: (resolve: (value: unknown) => unknown) =>
      Promise.resolve(result).then(resolve),
  };
  return chain;
});
const request = (body: unknown) =>
  handler(
    new Request("https://functions.example.com/offers-api", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
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
  vi.stubGlobal("Deno", { env: { get: () => undefined } });
  mocks.admin.mockReturnValue({
    from,
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
  it("requires admin authorization before listing or retrying deliveries", async () => {
    mocks.requireAdmin.mockRejectedValue(
      new OfferError(401, "unauthorized", "Sign in"),
    );
    const response = await request({ action: "retry_deliveries" });
    expect(response.status).toBe(401);
    expect(from).not.toHaveBeenCalled();
    expect(mocks.deliver).not.toHaveBeenCalled();
  });
  it("denies a refunded order even with a valid emailed capability", async () => {
    currentOrder = { id: "order-id", status: "refunded", token_hash: original };
    const response = await request({ action: "download", token });
    expect(response.status).toBe(403);
    expect((await response.json()).code).toBe("download_unavailable");
    expect(mocks.signed).not.toHaveBeenCalled();
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
