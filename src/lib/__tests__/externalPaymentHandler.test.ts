import { describe, expect, it, vi } from "vitest";
import {
  createExternalPaymentHandler,
  type ExternalPaymentDependencies,
} from "../../../supabase/functions/_shared/externalPaymentHandler";

const environment: Record<string, string> = {
  EXTERNAL_STRIPE_MODE: "test",
  EXTERNAL_STRIPE_ACCOUNT_SCOPE: "self",
  EXTERNAL_STRIPE_ACCOUNT_ID: "acct_example",
  EXTERNAL_STRIPE_SECRET_KEY: "sk_test_example",
  EXTERNAL_STRIPE_WEBHOOK_SECRET: "whsec_example",
  EXTERNAL_STRIPE_PRICE_MAP:
    '[{"price_id":"price_course","product_id":"prod_course","destination":"pushten"}]',
  EXTERNAL_STRIPE_ENABLED: "true",
};
const event = {
  id: "evt_example",
  type: "checkout.session.completed",
  created: Math.floor(Date.now() / 1000) - 60,
  livemode: false,
  data: { object: { id: "cs_test_example" } },
};
function setup() {
  const store = {
    status: vi.fn(async () => ({ status: "missing" })),
    apply: vi.fn(async () => ({ status: "processed" })),
    acquireRefresh: vi.fn(async () => ({ status: "acquired", fence: "1" })),
    releaseRefresh: vi.fn(async () => {}),
  };
  const reader = {
    get: vi.fn(async (path: string) =>
      path === "/account"
        ? { id: "acct_example" }
        : path.startsWith("/events/")
          ? event
          : { id: "cs_test_example", livemode: false, mode: "subscription" },
    ),
    list: vi.fn(async (): Promise<Record<string, unknown>[]> => []),
  };
  const deps: ExternalPaymentDependencies = {
    env: (name) => environment[name],
    authorizeAdmin: vi.fn(async () => {}),
    verify: vi.fn(async () => event),
    store: vi.fn(() => store),
    reader: vi.fn(() => reader),
  };
  return { deps, store, reader };
}
const request = (signature = "signed", body = " original raw bytes ") =>
  new Request("https://example.test/callback", {
    method: "POST",
    headers: signature ? { "stripe-signature": signature } : {},
    body,
  });
describe("external payment callback boundary", () => {
  it("never calls the provider or ledger for absent/rejected signatures", async () => {
    const { deps, store, reader } = setup();
    expect((await createExternalPaymentHandler(deps)(request(""))).status).toBe(
      400,
    );
    vi.mocked(deps.verify).mockRejectedValue(
      new Error("sensitive provider exception"),
    );
    const rejected = await createExternalPaymentHandler(deps)(request());
    expect(rejected.status).toBe(400);
    expect(await rejected.text()).not.toContain("sensitive");
    expect(store.apply).not.toHaveBeenCalled();
    expect(reader.get).not.toHaveBeenCalled();
  });
  it("passes untouched body to verification and acknowledges only after durable commit", async () => {
    const { deps, store } = setup();
    const response = await createExternalPaymentHandler(deps)(request());
    expect(response.status).toBe(200);
    expect(deps.verify).toHaveBeenCalledWith(
      " original raw bytes ",
      "signed",
      expect.objectContaining({ webhookSecret: "whsec_example" }),
    );
    expect(store.apply).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "stripe",
        resolution: "unsupported",
        payload_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
      [],
    );
    store.apply.mockRejectedValue(new Error("database details"));
    expect((await createExternalPaymentHandler(deps)(request())).status).toBe(
      503,
    );
  });
  it("accepts exact retries without provider fetch but rejects identity conflicts", async () => {
    const { deps, store, reader } = setup();
    store.status.mockResolvedValue({ status: "processed" });
    expect(
      await (await createExternalPaymentHandler(deps)(request())).json(),
    ).toEqual({ received: true, duplicate: true });
    expect(reader.get).not.toHaveBeenCalled();
    expect(store.apply).not.toHaveBeenCalled();
    store.status.mockResolvedValue({ status: "conflict" });
    expect((await createExternalPaymentHandler(deps)(request())).status).toBe(
      409,
    );
  });
  it("ignores mutable delivery bookkeeping but rejects changed immutable data on retry", async () => {
    const { deps, store } = setup();
    let acceptedHash: unknown;
    store.status.mockImplementation(
      async (identity?: Record<string, unknown>) => ({
        status: acceptedHash
          ? identity?._payload_hash === acceptedHash
            ? "processed"
            : "conflict"
          : "missing",
      }),
    );
    store.apply.mockImplementation(
      async (receipt?: Record<string, unknown>) => {
        acceptedHash = receipt?.payload_hash;
        return { status: "processed" };
      },
    );
    vi.mocked(deps.verify).mockResolvedValue({ ...event, pending_webhooks: 2 });
    expect((await createExternalPaymentHandler(deps)(request())).status).toBe(
      200,
    );
    vi.mocked(deps.verify).mockResolvedValue({ ...event, pending_webhooks: 0 });
    expect(
      await (await createExternalPaymentHandler(deps)(request())).json(),
    ).toMatchObject({ duplicate: true });
    expect(store.apply).toHaveBeenCalledTimes(1);
    vi.mocked(deps.verify).mockResolvedValue({
      ...event,
      data: { object: { id: "cs_test_example", amount_total: 1 } },
    });
    expect((await createExternalPaymentHandler(deps)(request())).status).toBe(
      409,
    );
    vi.mocked(deps.verify).mockResolvedValue({
      ...event,
      type: "invoice.payment_succeeded",
    });
    expect((await createExternalPaymentHandler(deps)(request())).status).toBe(
      409,
    );
  });
  it("releases acquired leases when a canonical refresh fails and retries busy payments", async () => {
    const { deps, store, reader } = setup();
    reader.get.mockImplementation(async (path) =>
      path === "/account"
        ? { id: "acct_example" }
        : path.startsWith("/events/")
          ? event
          : path.startsWith("/checkout/")
            ? {
                id: "cs_test_example",
                livemode: false,
                mode: "payment",
                payment_status: "paid",
                status: "complete",
                amount_total: 100,
                currency: "usd",
                payment_intent: "pi_paid",
              }
            : Promise.reject(new Error("provider read failed")),
    );
    reader.list.mockResolvedValue([
      { price: { id: "price_course", product: "prod_course" } },
    ]);
    expect((await createExternalPaymentHandler(deps)(request())).status).toBe(
      503,
    );
    expect(store.releaseRefresh).toHaveBeenCalledWith(
      expect.objectContaining({ _payment_id: "pi_paid", _fence: "1" }),
    );
    expect(store.apply).not.toHaveBeenCalled();
    store.acquireRefresh.mockResolvedValue({ status: "busy", fence: "" });
    store.releaseRefresh.mockClear();
    expect(
      await (await createExternalPaymentHandler(deps)(request())).json(),
    ).toEqual({ error: "payment_refresh_busy" });
    expect(store.releaseRefresh).not.toHaveBeenCalled();
  });
  it("refuses the wrong authenticated Stripe account", async () => {
    const { deps, store, reader } = setup();
    reader.get.mockResolvedValue({ id: "acct_other" });
    expect((await createExternalPaymentHandler(deps)(request())).status).toBe(
      400,
    );
    expect(store.apply).not.toHaveBeenCalled();
  });
  it("protects setup metadata behind admin authorization and never returns secrets", async () => {
    const { deps } = setup();
    const statusRequest = () =>
      new Request("https://example.test/callback?action=status", {
        method: "POST",
        body: "{}",
      });
    const response = await createExternalPaymentHandler(deps)(statusRequest());
    expect(await response.text()).not.toMatch(/sk_test|whsec|acct_example/);
    vi.mocked(deps.authorizeAdmin).mockRejectedValue({ status: 403 });
    expect(
      (await createExternalPaymentHandler(deps)(statusRequest())).status,
    ).toBe(403);
    expect(deps.verify).not.toHaveBeenCalled();
    expect(deps.store).not.toHaveBeenCalled();
  });
  it("keeps an incomplete or disabled integration unavailable", async () => {
    const { deps } = setup();
    deps.env = () => undefined;
    expect((await createExternalPaymentHandler(deps)(request())).status).toBe(
      503,
    );
    deps.env = (name) =>
      name === "EXTERNAL_STRIPE_ENABLED" ? "false" : environment[name];
    expect((await createExternalPaymentHandler(deps)(request())).status).toBe(
      503,
    );
    expect(deps.verify).not.toHaveBeenCalled();
  });
  it("accepts the same canonical object across endpoint API renderings", async () => {
    const { deps, store } = setup();
    vi.mocked(deps.verify).mockResolvedValue({
      ...event,
      api_version: "2025-04-30.basil",
      data: {
        object: {
          ...event.data.object,
          legacy_display_field: "Rendered by endpoint version",
        },
      },
    });
    const response = await createExternalPaymentHandler(deps)(request());
    expect(response.status).toBe(200);
    expect(store.apply).toHaveBeenCalled();
  });
  it("rejects a canonical event pointing at a different payment object", async () => {
    const { deps, store } = setup();
    vi.mocked(deps.verify).mockResolvedValue({
      ...event,
      data: { object: { id: "cs_wrong_object" } },
    });
    const response = await createExternalPaymentHandler(deps)(request());
    expect(response.status).toBe(409);
    expect(store.apply).not.toHaveBeenCalled();
  });
});
