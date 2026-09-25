import { describe, it, expect, vi } from "vitest";
import {
  checkoutRecoveryState,
  assertCheckoutCanBeRetired,
  recoverOfferCheckout,
  type RecoverableSession,
} from "../../../supabase/functions/_shared/offerCheckoutRecovery";
import {
  type OfferOrder,
  checkoutRequest,
  hashOfferToken,
  stripeEventMutation,
} from "../../../supabase/functions/_shared/offers";
const now = Date.parse("2026-09-25T12:00:00Z");
const token = "a".repeat(64);
const order: OfferOrder = {
  id: "11111111-1111-4111-8111-111111111111",
  offer_id: "22222222-2222-4222-8222-222222222222",
  parent_order_id: "33333333-3333-4333-8333-333333333333",
  email: "reader@example.com",
  name: "Reader",
  status: "expired",
  title_snapshot: "Original toolkit",
  asset_path_snapshot: "private/original.pdf",
  asset_name_snapshot: "original.pdf",
  amount_minor: 2700,
  currency: "usd",
  next_offer_id: null,
  next_offer_deadline: null,
  declined_at: null,
  stripe_session_id: "cs_original",
  stripe_checkout_url: null,
  checkout_expires_at: new Date(now - 1000).toISOString(),
  fulfilled_at: null,
  checkout_attempt: 1,
};
const parent = {
  status: "fulfilled" as const,
  declined_at: null,
  next_offer_deadline: new Date(now + 3 * 3600_000).toISOString(),
};
const session: RecoverableSession = {
  id: "cs_original",
  mode: "payment",
  status: "expired",
  payment_status: "unpaid",
  livemode: false,
  metadata: { integration: "site-offers", offer_order_id: order.id },
  payment_intent: null,
};
function harness(overrides: Partial<OfferOrder> = {}) {
  const prepared = {
    ...order,
    status: "pending" as const,
    stripe_session_id: null,
    checkout_attempt: 2,
    checkout_expires_at: new Date(now + 3600_000).toISOString(),
    checkout_retry_origin: "https://example.com",
  };
  return {
    order: { ...order, ...overrides },
    parent,
    token,
    origin: "https://example.com",
    secret: "sk_test_fixture",
    webhook: "whsec_fixture",
    now,
    retrieve: vi.fn().mockResolvedValue(session),
    prepare: vi.fn().mockResolvedValue(prepared),
    provider: {
      create: vi.fn().mockResolvedValue({
        id: "cs_retry",
        url: "https://checkout.stripe.com/retry",
        paymentIntentId: null,
      }),
      record: vi.fn().mockResolvedValue(undefined),
    },
  };
}
describe("controlled follow-up checkout recovery", () => {
  it("retrieves proof before preparing a new attempt with frozen amount/file and a versioned key", async () => {
    const input = harness();
    expect(await recoverOfferCheckout(input)).toMatchObject({
      status: "pending",
      checkout_url: "https://checkout.stripe.com/retry",
    });
    expect(input.retrieve).toHaveBeenCalledWith("cs_original");
    expect(input.retrieve.mock.invocationCallOrder[0]).toBeLessThan(
      input.prepare.mock.invocationCallOrder[0],
    );
    expect(input.provider.create).toHaveBeenCalledWith(
      expect.objectContaining({
        line_items: [
          {
            price_data: {
              currency: "usd",
              unit_amount: 2700,
              product_data: { name: "Original toolkit" },
            },
            quantity: 1,
          },
        ],
        metadata: expect.objectContaining({ offer_checkout_attempt: "2" }),
        expires_at: (now + 3600_000) / 1000,
      }),
      `site-offer-${order.id}-attempt-2`,
    );
    expect(input.provider.record).toHaveBeenCalledWith(
      order.id,
      expect.objectContaining({ id: "cs_retry" }),
      2,
    );
  });
  it.each([
    { status: "open" },
    { status: "complete" },
    { payment_status: "paid" },
    { payment_intent: "pi_uncertain" },
    ...[
      "processing",
      "succeeded",
      "requires_payment_method",
      "requires_action",
      "requires_capture",
    ].map((status) => ({ payment_intent: { id: "pi_previous", status } })),
  ])(
    "refuses an unsafe previous session %j without creating or reserving anything",
    async (change) => {
      const input = harness();
      input.retrieve.mockResolvedValue({ ...session, ...change });
      await expect(recoverOfferCheckout(input)).rejects.toMatchObject({
        code: "checkout_not_safe_to_retry",
      });
      expect(input.prepare).not.toHaveBeenCalled();
      expect(input.provider.create).not.toHaveBeenCalled();
    },
  );
  it("accepts only a positively canceled intent and sends its identity to the transaction", async () => {
    const input = harness();
    input.retrieve.mockResolvedValue({
      ...session,
      payment_intent: { id: "pi_canceled", status: "canceled" },
    });
    await recoverOfferCheckout(input);
    expect(input.prepare).toHaveBeenCalledWith(order, "pi_canceled");
  });
  it.each([
    { id: "cs_other" },
    { mode: "subscription" },
    { livemode: true },
    {
      metadata: {
        integration: "site-offers",
        offer_order_id: order.id,
        offer_checkout_attempt: "3",
      },
    },
  ])("rejects mismatched provider identity %j", (change) => {
    expect(() =>
      assertCheckoutCanBeRetired(order, { ...session, ...change }, "test"),
    ).toThrow("could not be verified");
  });
  it.each([
    { status: "refunded" as const },
    { status: "fulfilled" as const },
    { parent_order_id: null },
    { amount_minor: 0 },
    { checkout_attempt: 4 },
    { stripe_session_id: null },
  ])("blocks an ineligible order %j", async (change) => {
    const input = harness(change);
    await expect(recoverOfferCheckout(input)).rejects.toMatchObject({
      code: "checkout_recovery_unavailable",
    });
    expect(input.retrieve).not.toHaveBeenCalled();
  });
  it("does not reset the original offer window or retry after parent refund", () => {
    expect(
      checkoutRecoveryState(
        order,
        {
          ...parent,
          next_offer_deadline: new Date(now + 30 * 60_000).toISOString(),
        },
        now,
      ).available,
    ).toBe(false);
    expect(
      checkoutRecoveryState(order, { ...parent, status: "refunded" }, now)
        .available,
    ).toBe(false);
  });
  it("resumes an uncertain prepared attempt with exactly the same key and payload", async () => {
    const input = harness({
      status: "pending",
      checkout_attempt: 2,
      stripe_session_id: null,
      checkout_expires_at: new Date(now + 30 * 60_000).toISOString(),
      checkout_retry_origin: "https://original.example",
      checkout_retry_token_hash: await hashOfferToken(token),
    });
    input.parent = {
      ...parent,
      next_offer_deadline: new Date(now + 30 * 60_000).toISOString(),
    };
    await recoverOfferCheckout(input);
    await recoverOfferCheckout(input);
    expect(input.retrieve).not.toHaveBeenCalled();
    expect(input.prepare).not.toHaveBeenCalled();
    expect(input.provider.create.mock.calls[0]).toEqual(
      input.provider.create.mock.calls[1],
    );
    expect(input.provider.create.mock.calls[0][0].success_url).toBe(
      `https://original.example/offer-access#token=${token}`,
    );
  });
  it("rejects a different recovery alias for an uncertain attempt rather than change idempotent input", async () => {
    const input = harness({
      status: "pending",
      checkout_attempt: 2,
      stripe_session_id: null,
      checkout_expires_at: new Date(now + 3600_000).toISOString(),
      checkout_retry_token_hash: await hashOfferToken("b".repeat(64)),
    });
    await expect(recoverOfferCheckout(input)).rejects.toMatchObject({
      code: "checkout_access_changed",
    });
    expect(input.provider.create).not.toHaveBeenCalled();
  });
  it("does not mutate the first-attempt Stripe payload across rollout", () => {
    expect(
      checkoutRequest(
        {
          ...order,
          status: "pending",
          checkout_expires_at: new Date(now + 3600_000).toISOString(),
        },
        token,
        "https://example.com",
        now,
      ).metadata,
    ).toEqual({ offer_order_id: order.id, integration: "site-offers" });
  });
  it("carries attempt identity into webhook processing and rejects invalid values", () => {
    const event = {
      id: "evt_retry",
      type: "checkout.session.expired",
      livemode: false,
      data: {
        object: {
          id: "cs_retry",
          mode: "payment",
          metadata: {
            integration: "site-offers",
            offer_order_id: order.id,
            offer_checkout_attempt: "2",
          },
        },
      },
    };
    expect(stripeEventMutation(event, "test")).toMatchObject({
      _checkout_attempt: 2,
    });
    event.data.object.metadata.offer_checkout_attempt = "2.0";
    expect(() => stripeEventMutation(event, "test")).toThrow(
      "Invalid checkout attempt",
    );
  });
});
