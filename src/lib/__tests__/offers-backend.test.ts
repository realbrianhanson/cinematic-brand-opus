import { describe, expect, it, vi } from "vitest";
import {
  accessUrl,
  canonicalOfferOrigin,
  checkoutRequest,
  authorizedOrderItem,
  effectiveFollowUpId,
  claimReservedOffer,
  hashOfferToken,
  nextOfferAvailable,
  normalizedEmail,
  OFFER_PUBLIC_COLUMNS,
  type OfferOrder,
  paymentReadiness,
  publicOrder,
  readOfferWebhookBody,
  requirePayments,
  requireToken,
  safeCheckoutUrl,
  stripeEventMutation,
  type StripeEventInput,
} from "../../../supabase/functions/_shared/offers";

const token = "ab".repeat(32);
const id = "10000000-0000-4000-8000-000000000001";
const now = Date.parse("2026-09-19T12:00:00Z");
const order: OfferOrder = {
  id,
  offer_id: id,
  parent_order_id: null,
  email: "buyer@example.com",
  name: "Buyer",
  status: "pending",
  title_snapshot: "A practical guide",
  asset_path_snapshot: "private/guide.pdf",
  asset_name_snapshot: "guide.pdf",
  amount_minor: 1900,
  currency: "usd",
  next_offer_id: id,
  next_offer_deadline: "2026-09-19T13:00:00Z",
  declined_at: null,
  stripe_session_id: null,
  stripe_checkout_url: null,
  checkout_expires_at: "2026-09-19T13:00:00Z",
  fulfilled_at: null,
};
const paidEvent: StripeEventInput = {
  id: "evt_1",
  type: "checkout.session.completed",
  livemode: false,
  data: {
    object: {
      id: "cs_test_1",
      metadata: { offer_order_id: id, integration: "site-offers" },
      mode: "payment",
      payment_status: "paid",
      payment_intent: "pi_1",
      amount_total: 1900,
      currency: "usd",
    },
  },
};

describe("offer backend boundaries", () => {
  it("charges immutable basket line items and rejects totals that do not match", () => {
    const items = [
      {
        id: "20000000-0000-4000-8000-000000000001",
        order_id: id,
        offer_id: id,
        role: "primary" as const,
        title_snapshot: "Guide",
        asset_path_snapshot: "private/guide.pdf",
        asset_name_snapshot: "guide.pdf",
        amount_minor: 1900,
        currency: "usd",
      },
      {
        id: "20000000-0000-4000-8000-000000000002",
        order_id: id,
        offer_id: "10000000-0000-4000-8000-000000000002",
        role: "bump" as const,
        title_snapshot: "Templates",
        asset_path_snapshot: "private/templates.zip",
        asset_name_snapshot: "templates.zip",
        amount_minor: 500,
        currency: "usd",
      },
    ];
    const basket = { ...order, amount_minor: 2400, items };
    const checkout = checkoutRequest(basket, token, "https://example.com", now);
    expect(
      checkout.line_items.map((item) => item.price_data.unit_amount),
    ).toEqual([1900, 500]);
    expect(
      checkout.line_items.map((item) => item.price_data.product_data.name),
    ).toEqual(["Guide", "Templates"]);
    expect(() =>
      checkoutRequest(
        { ...basket, amount_minor: 1900 },
        token,
        "https://example.com",
        now,
      ),
    ).toThrow("basket");
    expect(() =>
      checkoutRequest(
        { ...basket, items: [{ ...items[0], currency: "eur" }, items[1]] },
        token,
        "https://example.com",
        now,
      ),
    ).toThrow("basket");
    expect(
      authorizedOrderItem({ ...basket, status: "fulfilled" }, items[1].id)
        .asset_path_snapshot,
    ).toBe("private/templates.zip");
    expect(() =>
      authorizedOrderItem(
        { ...basket, status: "fulfilled" },
        "30000000-0000-4000-8000-000000000003",
      ),
    ).toThrow("not available");
    expect(() =>
      authorizedOrderItem({ ...basket, status: "refunded" }, items[1].id),
    ).toThrow("not available");
    expect(
      authorizedOrderItem({ ...order, status: "fulfilled" })
        .asset_path_snapshot,
    ).toBe(order.asset_path_snapshot);
  });
  it("uses the persisted downsell stage without reviving a declined or expired path", () => {
    const parent = {
      ...order,
      status: "fulfilled" as const,
      downsell_offer_id: "20000000-0000-4000-8000-000000000001",
      upsell_declined_at: new Date(now).toISOString(),
    };
    expect(effectiveFollowUpId(parent)).toBe(parent.downsell_offer_id);
    expect(nextOfferAvailable(parent, false, now)).toBe(true);
    expect(
      nextOfferAvailable(
        { ...parent, declined_at: new Date(now).toISOString() },
        false,
        now,
      ),
    ).toBe(false);
    expect(nextOfferAvailable(parent, true, now)).toBe(false);
    expect(nextOfferAvailable(parent, false, now + 3_600_000)).toBe(false);
  });
  it("requires both valid-shaped server secrets without claiming connection verification", () => {
    expect(paymentReadiness()).toEqual({
      secret_configured: false,
      webhook_configured: false,
      payments_ready: false,
      mode: "unconfigured",
    });
    expect(paymentReadiness("sk_test_example")).toMatchObject({
      payments_ready: false,
      mode: "test",
    });
    expect(paymentReadiness("sk_live_example", "whsec_example")).toMatchObject({
      payments_ready: true,
      mode: "live",
    });
    expect(() => requirePayments("sk_test_example")).toThrow("not available");
    expect(
      paymentReadiness("pk_live_public", "whsec_example").payments_ready,
    ).toBe(false);
  });
  it("accepts only 256-bit lowercase hex tokens and hashes them without retaining plaintext", async () => {
    expect(requireToken(token)).toBe(token);
    for (const invalid of ["abc", token.toUpperCase(), "x".repeat(64), null])
      expect(() => requireToken(invalid)).toThrow();
    const hash = await hashOfferToken(token);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(hash).not.toBe(token);
    expect(await hashOfferToken(token)).toBe(hash);
  });
  it("rejects redirect destinations outside a validated canonical site origin", () => {
    expect(canonicalOfferOrigin("https://member.example/")).toBe(
      "https://member.example",
    );
    for (const invalid of [
      "http://member.example",
      "https://user:pass@member.example",
      "https://member.example/path",
      "https://member.example?next=evil",
      "//evil.example",
    ])
      expect(() => canonicalOfferOrigin(invalid)).toThrow();
    const url = new URL(accessUrl("https://member.example", token));
    expect(url.pathname).toBe("/offer-access");
    expect(url.search).toBe("");
    expect(url.hash).toBe(`#token=${token}`);
  });
  it("only redirects to Stripe's hosted checkout domain", () => {
    expect(safeCheckoutUrl("https://checkout.stripe.com/c/pay/cs_1")).toContain(
      "checkout.stripe.com",
    );
    for (const invalid of [
      "javascript:alert(1)",
      "https://checkout.stripe.com.evil.test/c",
      "https://evil.test/",
      "https://user@checkout.stripe.com/",
    ])
      expect(safeCheckoutUrl(invalid)).toBeNull();
  });
  it("normalizes addresses and rejects invalid or oversized input", () => {
    expect(normalizedEmail(" Buyer@Example.com ")).toBe("buyer@example.com");
    expect(() => normalizedEmail("a@example.com\nBcc: b@evil.test")).toThrow();
    expect(() => normalizedEmail(`${"a".repeat(250)}@example.com`)).toThrow();
  });
  it("public order and offer projections exclude private data", () => {
    const publicRecord = publicOrder(order);
    expect(publicRecord).not.toHaveProperty("email");
    expect(publicRecord).not.toHaveProperty("asset_path_snapshot");
    expect(publicRecord).not.toHaveProperty("stripe_session_id");
    expect(OFFER_PUBLIC_COLUMNS.split(",")).not.toContain("asset_path");
    expect(OFFER_PUBLIC_COLUMNS.split(",")).not.toContain("next_offer_id");
  });
  it("only exposes a next offer for a fulfilled, eligible parent", () => {
    expect(nextOfferAvailable(order, false, now)).toBe(false);
    const fulfilled = { ...order, status: "fulfilled" as const };
    expect(nextOfferAvailable(fulfilled, false, now)).toBe(true);
    expect(nextOfferAvailable(fulfilled, true, now)).toBe(false);
    expect(
      nextOfferAvailable(
        { ...fulfilled, declined_at: new Date(now).toISOString() },
        false,
        now,
      ),
    ).toBe(false);
    expect(nextOfferAvailable(fulfilled, false, now + 3_600_000)).toBe(false);
    expect(
      nextOfferAvailable({ ...fulfilled, status: "refunded" }, false, now),
    ).toBe(false);
  });
});

describe("hosted checkout and webhook contracts", () => {
  function claimFixture(snapshot = order) {
    return {
      paid: true,
      secret: "sk_test_example",
      webhook: "whsec_example",
      token,
      origin: "https://member.example",
      reserve: vi.fn(async () => snapshot),
      provider: {
        create: vi.fn(async () => ({
          id: "cs_test_1",
          url: "https://checkout.stripe.com/c/pay/cs_test_1",
          paymentIntentId: null,
        })),
        record: vi.fn(async () => {}),
      },
      now,
    };
  }
  it("fails closed before reserving a paid order when either Stripe secret is absent", async () => {
    const fixture = claimFixture();
    await expect(
      claimReservedOffer({ ...fixture, webhook: undefined }),
    ).rejects.toThrow("not available");
    expect(fixture.reserve).not.toHaveBeenCalled();
    expect(fixture.provider.create).not.toHaveBeenCalled();
  });
  it("rejects external listings before Stripe readiness or local order reservation", async () => {
    for (const paid of [false, true]) {
      for (const secret of [undefined, "sk_test_example"]) {
        const fixture = claimFixture();
        await expect(
          claimReservedOffer({
            ...fixture,
            paid,
            checkoutMode: "external",
            secret,
          }),
        ).rejects.toMatchObject({ code: "external_checkout", status: 409 });
        expect(fixture.reserve).not.toHaveBeenCalled();
        expect(fixture.provider.create).not.toHaveBeenCalled();
        expect(fixture.provider.record).not.toHaveBeenCalled();
      }
    }
  });
  it("fulfills a free claim without payment secrets or provider calls", async () => {
    const fixture = claimFixture({
      ...order,
      amount_minor: 0,
      status: "fulfilled",
    });
    const result = await claimReservedOffer({
      ...fixture,
      paid: false,
      secret: undefined,
      webhook: undefined,
    });
    expect(result.status).toBe("fulfilled");
    expect(fixture.reserve).toHaveBeenCalledOnce();
    expect(fixture.provider.create).not.toHaveBeenCalled();
  });
  it("reuses a recorded live checkout instead of creating another session", async () => {
    const fixture = claimFixture({
      ...order,
      stripe_session_id: "cs_test_1",
      stripe_checkout_url: "https://checkout.stripe.com/c/pay/cs_test_1",
    });
    expect((await claimReservedOffer(fixture)).checkout_url).toContain(
      "cs_test_1",
    );
    expect(fixture.provider.create).not.toHaveBeenCalled();
  });
  it("retries a lost checkout association with exactly the same provider idempotency request", async () => {
    const fixture = claimFixture();
    fixture.provider.record.mockRejectedValueOnce(
      new Error("Database temporarily unavailable"),
    );
    await expect(claimReservedOffer(fixture)).rejects.toThrow(
      "Database temporarily unavailable",
    );
    await claimReservedOffer({ ...fixture, now: now + 40 * 60 * 1000 });
    expect(fixture.provider.create.mock.calls).toHaveLength(2);
    expect(fixture.provider.create.mock.calls[0]).toEqual(
      fixture.provider.create.mock.calls[1],
    );
    expect(fixture.provider.create).toHaveBeenCalledWith(
      expect.any(Object),
      `site-offer-${id}`,
    );
  });
  it("never creates a replacement session for an expired existing checkout", async () => {
    const fixture = claimFixture({
      ...order,
      stripe_session_id: "cs_test_1",
      checkout_expires_at: "2026-09-19T11:00:00Z",
    });
    await expect(claimReservedOffer(fixture)).rejects.toThrow(
      "latest payment status",
    );
    expect(fixture.provider.create).not.toHaveBeenCalled();
  });
  it("builds a deterministic, explicit one-time purchase from server snapshots", () => {
    const request = checkoutRequest(
      order,
      token,
      "https://member.example",
      now,
    );
    expect(
      checkoutRequest(order, token, "https://member.example", now + 1000),
    ).toEqual(request);
    expect(request.mode).toBe("payment");
    expect(request.line_items[0].price_data.unit_amount).toBe(1900);
    expect(request.line_items[0].price_data.product_data.name).toBe(
      order.title_snapshot,
    );
    expect(request.payment_intent_data.metadata).toEqual(request.metadata);
    expect(request).not.toHaveProperty("setup_future_usage");
    expect(request.success_url).toBe(request.cancel_url);
  });
  it("does not start expired, terminal, free, or invalid-currency checkout attempts", () => {
    for (const input of [
      { ...order, status: "refunded" as const },
      { ...order, amount_minor: 0 },
      { ...order, currency: "jpy" },
      { ...order, checkout_expires_at: "2026-09-19T11:15:00Z" },
    ])
      expect(() =>
        checkoutRequest(input, token, "https://member.example", now),
      ).toThrow();
  });
  it("maps only paid and mode-matched offer sessions to fulfillment", () => {
    expect(stripeEventMutation(paidEvent, "test")).toMatchObject({
      _event_id: "evt_1",
      _session_id: "cs_test_1",
      _order_id: id,
      _payment_intent_id: "pi_1",
      _amount_minor: 1900,
      _currency: "usd",
    });
    const unpaid = {
      ...paidEvent,
      data: { object: { ...paidEvent.data.object, payment_status: "unpaid" } },
    };
    expect(stripeEventMutation(unpaid, "test")).toBeNull();
    expect(() => stripeEventMutation(paidEvent, "live")).toThrow("mode");
  });
  it("ignores unrelated Stripe checkouts and rejects malformed offer sessions", () => {
    expect(
      stripeEventMutation(
        {
          ...paidEvent,
          data: { object: { ...paidEvent.data.object, metadata: {} } },
        },
        "test",
      ),
    ).toBeNull();
    expect(() =>
      stripeEventMutation(
        {
          ...paidEvent,
          data: { object: { ...paidEvent.data.object, amount_total: 19.5 } },
        },
        "test",
      ),
    ).toThrow();
    expect(() =>
      stripeEventMutation(
        {
          ...paidEvent,
          data: { object: { ...paidEvent.data.object, mode: "subscription" } },
        },
        "test",
      ),
    ).toThrow();
  });
  it("maps async failures and expiry without pretending they are paid", () => {
    for (const type of [
      "checkout.session.expired",
      "checkout.session.async_payment_failed",
    ]) {
      expect(stripeEventMutation({ ...paidEvent, type }, "test")).toMatchObject(
        { _event_type: type, _amount_minor: null, _currency: null },
      );
    }
  });
  it("revokes any refunded offer payment and accepts expanded payment intent IDs", () => {
    expect(
      stripeEventMutation(
        {
          ...paidEvent,
          type: "charge.refunded",
          data: { object: { payment_intent: { id: "pi_1" } } },
        },
        "test",
      ),
    ).toMatchObject({
      _event_type: "charge.refunded",
      _payment_intent_id: "pi_1",
      _session_id: null,
      _order_id: null,
    });
  });
  it("preserves signed raw body bytes and rejects oversized bodies", async () => {
    const raw = '{ "id": "evt_1", "value": "café" }\n';
    expect(
      await readOfferWebhookBody(
        new Request("https://site.test", { method: "POST", body: raw }),
      ),
    ).toBe(raw);
    await expect(
      readOfferWebhookBody(
        new Request("https://site.test", { method: "POST", body: "oversized" }),
        4,
      ),
    ).rejects.toThrow("too large");
    await expect(
      readOfferWebhookBody(
        new Request("https://site.test", {
          method: "POST",
          headers: { "content-length": "9000" },
          body: "ok",
        }),
        4,
      ),
    ).rejects.toThrow("too large");
  });
});
