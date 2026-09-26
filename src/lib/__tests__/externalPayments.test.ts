import { describe, expect, it, vi } from "vitest";
import {
  externalPaymentConfig,
  externalStripeReader,
  readExternalBody,
  reconcileExternalEvent as reconcile,
  validateExternalEvent,
  type ExternalPaymentConfig,
  type StripeReader,
} from "../../../supabase/functions/_shared/externalPayments";
const reconcileExternalEvent = (
  event: Record<string, unknown>,
  reader: StripeReader,
  config: ExternalPaymentConfig,
  acquire = async (_id: string) => "1",
) => reconcile(event, reader, config, acquire);

const config: ExternalPaymentConfig = {
  enabled: true,
  mode: "test",
  scope: "self",
  accountId: "acct_example",
  secret: "sk_test_example",
  webhookSecret: "whsec_example",
  prices: [
    {
      price_id: "price_course",
      product_id: "prod_course",
      destination: "pushten",
    },
  ],
};
const stamp = Math.floor(Date.now() / 1000) - 10;
const event = (
  type = "checkout.session.completed",
  id = "cs_test_example",
) => ({
  id: "evt_example",
  type,
  created: stamp,
  livemode: false,
  data: { object: { id } },
});
function fixture(overrides: Record<string, unknown> = {}) {
  const objects: Record<string, unknown> = {
    "/checkout/sessions/cs_test_example": {
      id: "cs_test_example",
      livemode: false,
      mode: "payment",
      payment_status: "paid",
      status: "complete",
      amount_total: 99700,
      currency: "usd",
      payment_intent: "pi_paid",
      metadata: {},
    },
    "/payment_intents/pi_paid": {
      id: "pi_paid",
      livemode: false,
      status: "succeeded",
      latest_charge: "ch_paid",
      amount_received: 99700,
      currency: "usd",
      metadata: {},
    },
    "/charges/ch_paid": {
      id: "ch_paid",
      livemode: false,
      status: "succeeded",
      paid: true,
      captured: true,
      amount_captured: 99700,
      currency: "usd",
      payment_intent: "pi_paid",
      created: stamp,
    },
    "/checkout/sessions/cs_test_example/line_items": [
      {
        id: "li_course",
        price: { id: "price_course", product: "prod_course" },
      },
    ],
    "/refunds": [],
    "/invoice_payments": [],
    "/checkout/sessions": [{ id: "cs_test_example" }],
    ...overrides,
  };
  const reader: StripeReader = {
    get: vi.fn(async (path) => {
      if (!(path in objects)) throw new Error(`Missing fixture ${path}`);
      return objects[path] as Record<string, unknown>;
    }),
    list: vi.fn(async (path) => {
      if (!(path in objects)) throw new Error(`Missing fixture ${path}`);
      return objects[path] as Record<string, unknown>[];
    }),
  };
  return { reader, objects };
}
describe("external Stripe activation and account boundaries", () => {
  const settings = {
    EXTERNAL_STRIPE_MODE: "live",
    EXTERNAL_STRIPE_ACCOUNT_SCOPE: "self",
    EXTERNAL_STRIPE_ACCOUNT_ID: "acct_example",
    EXTERNAL_STRIPE_SECRET_KEY: "sk_live_example",
    EXTERNAL_STRIPE_WEBHOOK_SECRET: "whsec_example",
    EXTERNAL_STRIPE_PRICE_MAP: JSON.stringify(config.prices),
    EXTERNAL_STRIPE_ENABLED: "true",
  };
  it("keeps live disabled until its separate activation acknowledgement", () => {
    expect(
      externalPaymentConfig((name) => settings[name as keyof typeof settings])
        .enabled,
    ).toBe(false);
    expect(
      externalPaymentConfig((name) =>
        name === "EXTERNAL_STRIPE_LIVE_ACK"
          ? "I_VERIFIED_ACCOUNT_PRODUCTS_AND_TEST_FLOW"
          : settings[name as keyof typeof settings],
      ).enabled,
    ).toBe(true);
  });
  it("rejects absent credentials, wrong key mode and ambiguous mapping", () => {
    expect(() => externalPaymentConfig(() => undefined)).toThrow(
      "configuration_incomplete",
    );
    expect(() =>
      externalPaymentConfig((name) =>
        name === "EXTERNAL_STRIPE_SECRET_KEY"
          ? "sk_test_example"
          : settings[name as keyof typeof settings],
      ),
    ).toThrow("configuration_incomplete");
    expect(() =>
      externalPaymentConfig((name) =>
        name === "EXTERNAL_STRIPE_PRICE_MAP"
          ? JSON.stringify([...config.prices, ...config.prices])
          : settings[name as keyof typeof settings],
      ),
    ).toThrow("invalid_price_map");
  });
  it("rejects wrong account/mode and never treats an absent mode as live", () => {
    expect(() =>
      validateExternalEvent({ ...event(), livemode: true }, config),
    ).toThrow("wrong_payment_mode");
    expect(() =>
      validateExternalEvent({ ...event(), livemode: undefined }, config),
    ).toThrow("wrong_payment_mode");
    expect(() =>
      validateExternalEvent({ ...event(), account: "acct_other" }, config),
    ).toThrow("wrong_payment_account");
    expect(() =>
      validateExternalEvent(event(), { ...config, scope: "connected" }),
    ).toThrow("wrong_payment_account");
    expect(() =>
      validateExternalEvent(
        { ...event(), account: config.accountId },
        { ...config, scope: "connected" },
      ),
    ).not.toThrow();
  });
});
describe("canonical external payment reconciliation", () => {
  it("uses canonical paid/captured objects and exact price/product pairs", async () => {
    const { reader } = fixture();
    const result = await reconcileExternalEvent(event(), reader, config);
    expect(result).toEqual({
      resolution: "applied",
      payments: [
        {
          payment_id: "pi_paid",
          charge_id: "ch_paid",
          amount_minor: 99700,
          refunded_minor: 0,
          currency: "USD",
          destination: "pushten",
          price_ids: ["price_course"],
          refresh_fence: "1",
          occurred_at: new Date(stamp * 1000).toISOString(),
        },
      ],
    });
    expect(JSON.stringify(result)).not.toContain("email");
  });
  it("does not count unpaid completion or a subscription session", async () => {
    const { reader, objects } = fixture();
    (
      objects["/checkout/sessions/cs_test_example"] as Record<string, unknown>
    ).payment_status = "unpaid";
    expect(await reconcileExternalEvent(event(), reader, config)).toEqual({
      resolution: "not_paid",
      payments: [],
    });
    (
      objects["/checkout/sessions/cs_test_example"] as Record<string, unknown>
    ).mode = "subscription";
    expect(await reconcileExternalEvent(event(), reader, config)).toEqual({
      resolution: "unsupported",
      payments: [],
    });
  });
  it("counts async success once by the same payment identity", async () => {
    const { reader } = fixture();
    const ordinary = await reconcileExternalEvent(event(), reader, config);
    const delayed = await reconcileExternalEvent(
      event("checkout.session.async_payment_succeeded"),
      reader,
      config,
    );
    expect(delayed.payments[0].payment_id).toBe(
      ordinary.payments[0].payment_id,
    );
  });
  it("excludes native offers and rejects credit for an unrelated product", async () => {
    const { reader, objects } = fixture();
    (objects["/payment_intents/pi_paid"] as Record<string, unknown>).metadata =
      { integration: "site-offers" };
    await expect(
      reconcileExternalEvent(event(), reader, config),
    ).rejects.toThrow("native_payment_excluded");
    objects["/checkout/sessions/cs_test_example/line_items"] = [
      { price: { id: "price_course", product: "prod_other" } },
    ];
    expect(await reconcileExternalEvent(event(), reader, config)).toEqual({
      resolution: "unmapped",
      payments: [],
    });
  });
  it("rejects mixed mapped/unmapped baskets instead of overstating sales", async () => {
    const { reader } = fixture({
      "/checkout/sessions/cs_test_example/line_items": [
        { price: { id: "price_course", product: "prod_course" } },
        { price: { id: "price_other", product: "prod_other" } },
      ],
    });
    await expect(
      reconcileExternalEvent(event(), reader, config),
    ).rejects.toThrow("mixed_or_unmapped_basket");
  });
  it("reconstructs partial/full refunds even when refund arrives before sale", async () => {
    const { reader, objects } = fixture({
      "/refunds": [
        {
          id: "re_partial",
          charge: "ch_paid",
          currency: "usd",
          amount: 10000,
          status: "succeeded",
        },
        {
          id: "re_pending",
          charge: "ch_paid",
          currency: "usd",
          amount: 89700,
          status: "pending",
        },
      ],
    });
    const partial = await reconcileExternalEvent(
      event("charge.refunded", "ch_paid"),
      reader,
      config,
    );
    expect(partial.payments[0].refunded_minor).toBe(10000);
    (objects["/refunds"] as Array<Record<string, unknown>>)[1].status =
      "succeeded";
    expect(
      (
        await reconcileExternalEvent(
          event("charge.refunded", "ch_paid"),
          reader,
          config,
        )
      ).payments[0].refunded_minor,
    ).toBe(99700);
  });
  it("refreshes succeeded refunds that later require action or fail", async () => {
    const refund = {
      id: "re_returned",
      charge: "ch_paid",
      currency: "usd",
      amount: 99700,
      status: "succeeded",
    };
    const { reader } = fixture({ "/refunds": [refund] });
    const acquire = vi.fn(async () => "12");
    const success = await reconcileExternalEvent(
      event("charge.refunded", "ch_paid"),
      reader,
      config,
      acquire,
    );
    expect(success.payments[0]).toMatchObject({
      refunded_minor: 99700,
      refresh_fence: "12",
    });
    refund.status = "requires_action";
    const update = {
      ...event("refund.updated", "re_returned"),
      data: { object: { id: "re_returned", charge: "ch_paid" } },
    };
    expect(
      (await reconcileExternalEvent(update, reader, config, acquire))
        .payments[0].refunded_minor,
    ).toBe(0);
    refund.status = "failed";
    expect(
      (
        await reconcileExternalEvent(
          { ...update, type: "refund.failed" },
          reader,
          config,
          acquire,
        )
      ).payments[0].refunded_minor,
    ).toBe(0);
    const intentRead = vi
      .mocked(reader.get)
      .mock.calls.findIndex(([path]) => path === "/payment_intents/pi_paid");
    expect(acquire.mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(reader.get).mock.invocationCallOrder[intentRead],
    );
  });
  it("does not read authoritative refunds without obtaining the payment lease", async () => {
    const { reader } = fixture();
    await expect(
      reconcileExternalEvent(event(), reader, config, async () => {
        throw new Error("busy");
      }),
    ).rejects.toThrow("busy");
    expect(reader.get).not.toHaveBeenCalledWith("/payment_intents/pi_paid");
    expect(reader.list).not.toHaveBeenCalledWith(
      "/refunds",
      expect.anything(),
      expect.anything(),
    );
  });
  it("preserves zero-decimal/three-decimal provider minor units", async () => {
    for (const unit of ["jpy", "kwd", "isk"]) {
      const { reader, objects } = fixture();
      for (const path of [
        "/checkout/sessions/cs_test_example",
        "/payment_intents/pi_paid",
        "/charges/ch_paid",
      ])
        (objects[path] as Record<string, unknown>).currency = unit;
      expect(
        (await reconcileExternalEvent(event(), reader, config)).payments[0],
      ).toMatchObject({ currency: unit.toUpperCase(), amount_minor: 99700 });
    }
  });
  it("reconciles subscription invoice renewals and refuses shared allocations", async () => {
    const paid = {
      id: "inpay_paid",
      invoice: "in_renewal",
      status: "paid",
      livemode: false,
      amount_paid: 99700,
      currency: "usd",
      payment: { type: "payment_intent", payment_intent: "pi_paid" },
    };
    const { reader, objects } = fixture({
      "/invoices/in_renewal": {
        id: "in_renewal",
        livemode: false,
        status: "paid",
        amount_paid: 99700,
        currency: "usd",
      },
      "/invoices/in_renewal/lines": [
        {
          pricing: {
            type: "price_details",
            price_details: { price: "price_course", product: "prod_course" },
          },
        },
      ],
      "/invoice_payments": [paid],
    });
    expect(
      (
        await reconcileExternalEvent(
          event("invoice.payment_succeeded", "in_renewal"),
          reader,
          config,
        )
      ).payments[0].payment_id,
    ).toBe("pi_paid");
    (objects["/invoice_payments"] as unknown[]).push({
      ...paid,
      id: "inpay_other",
      invoice: "in_other",
    });
    await expect(
      reconcileExternalEvent(
        event("invoice.payment_succeeded", "in_renewal"),
        reader,
        config,
      ),
    ).rejects.toThrow("allocated_payment_unsupported");
  });
});
describe("bounded provider transport", () => {
  it("uses a fixed GET endpoint, pinned API version and exact connected account", async () => {
    const request = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ data: [{ id: "price_test" }], has_more: false }),
        ),
    ) as unknown as typeof fetch;
    const reader = externalStripeReader(
      { ...config, scope: "connected" },
      request,
    );
    await reader.list("/prices", {}, 20);
    const call = vi.mocked(request).mock.calls[0];
    expect(String(call[0])).toBe("https://api.stripe.com/v1/prices?limit=20");
    expect(call[1]).toMatchObject({
      method: "GET",
      redirect: "error",
      headers: {
        "Stripe-Account": "acct_example",
        "Stripe-Version": "2025-03-31.basil",
      },
    });
    await expect(reader.get("https://attacker.invalid")).rejects.toThrow(
      "provider_read_limit",
    );
  });
  it("fails closed when a provider list is incomplete or duplicates IDs", async () => {
    const request = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ data: [{ id: "price_test" }], has_more: true }),
        ),
    ) as unknown as typeof fetch;
    await expect(
      externalStripeReader(config, request).list("/prices", {}, 1),
    ).rejects.toThrow("provider_page_limit");
    await expect(
      externalStripeReader(config, request).list("/prices", {}, 10),
    ).rejects.toThrow("invalid_provider_page");
  });
  it("bounds raw payloads before parsing", async () => {
    await expect(readExternalBody(new Response("123456"), 5)).rejects.toThrow(
      "body_too_large",
    );
    expect(await readExternalBody(new Response(" exact bytes "))).toBe(
      " exact bytes ",
    );
  });
});
