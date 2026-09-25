import {
  type OfferOrder,
  OfferError,
  claimReservedOffer,
  type OfferCheckoutProvider,
  paymentReadiness,
} from "./offers.ts";

export interface CheckoutRecoveryState {
  available: boolean;
  reason: string;
}
export function checkoutRecoveryState(
  order: OfferOrder,
  parent: Pick<
    OfferOrder,
    "status" | "declined_at" | "next_offer_deadline"
  > | null,
  now = Date.now(),
): CheckoutRecoveryState {
  const unavailable = (reason: string) => ({ available: false, reason });
  if (!order.parent_order_id || order.amount_minor <= 0)
    return unavailable(
      "Checkout recovery is available for paid follow-up offers.",
    );
  if (!["pending", "expired", "failed"].includes(order.status))
    return unavailable("A completed or refunded purchase cannot be restarted.");
  if (!parent || parent.status !== "fulfilled" || parent.declined_at)
    return unavailable(
      "This follow-up is no longer available. Your access page shows the status of your original purchase.",
    );
  const attempt = order.checkout_attempt ?? 1;
  if (
    order.status === "pending" &&
    !order.stripe_session_id &&
    attempt > 1 &&
    Date.parse(order.checkout_expires_at ?? "") > now &&
    (!parent.next_offer_deadline ||
      Date.parse(parent.next_offer_deadline) > now)
  )
    return {
      available: true,
      reason: "Continue preparing the same checkout attempt.",
    };
  if (
    parent.next_offer_deadline &&
    Date.parse(parent.next_offer_deadline) <= now + 31 * 60_000
  )
    return unavailable(
      "There is not enough time left in the original offer window to start another secure checkout.",
    );
  if (attempt >= 4)
    return unavailable(
      "The checkout retry limit has been reached. Contact support for help.",
    );
  if (!order.stripe_session_id)
    return unavailable(
      "The previous checkout could not be identified safely. Contact support before trying another payment.",
    );
  if (
    order.status === "pending" &&
    Date.parse(order.checkout_expires_at ?? "") > now &&
    (!parent.next_offer_deadline ||
      Date.parse(parent.next_offer_deadline) > now)
  )
    return unavailable("Use the existing checkout while it is open.");
  return {
    available: true,
    reason:
      "We will check that the previous checkout is closed and unpaid before opening another one.",
  };
}

export interface RecoverableSession {
  id: string;
  mode: string | null;
  status: string | null;
  payment_status: string;
  livemode: boolean;
  metadata: Record<string, string> | null;
  payment_intent: string | { id: string; status?: string } | null;
}
/** No cancellation or automatic charge: only a terminal unpaid session is safe to retire. */
export function assertCheckoutCanBeRetired(
  order: OfferOrder,
  session: RecoverableSession,
  mode: "test" | "live",
) {
  const intent = session.payment_intent;
  if (
    session.id !== order.stripe_session_id ||
    session.mode !== "payment" ||
    session.livemode !== (mode === "live") ||
    session.metadata?.integration !== "site-offers" ||
    session.metadata.offer_order_id !== order.id ||
    (session.metadata.offer_checkout_attempt ?? "1") !==
      String(order.checkout_attempt ?? 1)
  )
    throw new OfferError(
      409,
      "checkout_review_required",
      "The previous checkout could not be verified. Contact support before making another payment.",
    );
  if (
    session.status !== "expired" ||
    session.payment_status !== "unpaid" ||
    (intent !== null &&
      (typeof intent === "string" || intent.status !== "canceled"))
  )
    throw new OfferError(
      409,
      "checkout_not_safe_to_retry",
      "The previous payment is not confirmed closed and unpaid. Refresh your payment status or contact support before trying again.",
    );
}

export async function recoverOfferCheckout(input: {
  order: OfferOrder;
  parent: Pick<
    OfferOrder,
    "status" | "declined_at" | "next_offer_deadline"
  > | null;
  token: string;
  origin: string;
  secret?: string;
  webhook?: string;
  retrieve: (sessionId: string) => Promise<RecoverableSession>;
  prepare: (
    order: OfferOrder,
    paymentIntentId: string | null,
  ) => Promise<OfferOrder>;
  provider: OfferCheckoutProvider;
  now?: number;
}) {
  const now = input.now ?? Date.now();
  const state = checkoutRecoveryState(input.order, input.parent, now);
  if (!state.available)
    throw new OfferError(409, "checkout_recovery_unavailable", state.reason);
  const readiness = paymentReadiness(input.secret, input.webhook);
  if (!readiness.payments_ready)
    throw new OfferError(
      503,
      "payments_unavailable",
      "Paid checkout is not available yet.",
    );
  let order = input.order;
  if (order.stripe_session_id) {
    const session = await input.retrieve(order.stripe_session_id);
    assertCheckoutCanBeRetired(
      order,
      session,
      readiness.mode as "test" | "live",
    );
    const intent = session.payment_intent;
    order = await input.prepare(
      order,
      typeof intent === "object" && intent ? intent.id : null,
    );
  }
  return claimReservedOffer({
    ...input,
    paid: true,
    reserve: async () => order,
  });
}
