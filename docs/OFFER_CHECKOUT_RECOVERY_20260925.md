# Controlled follow-up checkout recovery

Implemented recovery for a paid follow-up order's expired checkout. The buyer must explicitly choose **Restart checkout** from that order's existing private access page. Status reads do not create payments. The original resource and its access link remain available.

## Payment safety and behavior

- Reuses the immutable order, original price/currency/title/file, and private access token. The unique `parent_order_id` remains in place.
- Retrieves the previous Stripe Checkout Session with expanded PaymentIntent before reserving another attempt. Requires matching order/integration/attempt/payment mode, `expired` session, `unpaid` payment status, and either no PaymentIntent or a positively `canceled` intent.
- Open, complete, paid, processing, requires-action, requires-payment-method, unknown, and refunded cases cannot be restarted through this flow. A failed local order is eligible only if the fresh provider state meets those same terminal criteria. No intent is canceled automatically and no saved card is charged.
- The original parent must remain fulfilled and not declined. A new session expires at the earlier of one hour or the original follow-up deadline; at least 31 minutes must remain to accommodate Stripe's minimum session lifetime. No offer window or sale price is reset. Unlimited parent windows remain unlimited; each order is capped at four total attempts.
- Private `offer_checkout_attempts` history records retired sessions, verified-unpaid time, PaymentIntent identity, original expiry, and new prepared attempts even before Stripe creation succeeds.
- Each attempt uses a distinct deterministic idempotency key, frozen origin, expiry, and access-token hash. A timeout reuses the same prepared attempt and payload. Switching to another email recovery alias during an uncertain attempt is refused; the buyer must return to the private link used to restart it or contact support.
- A delayed old-session expired/failed event is acknowledged without changing the new attempt. An old retired-attempt refund cannot revoke the current purchase. A paid event contradicting confirmed retirement fails closed and remains retryable for manual review; it is never silently fulfilled or refunded.
- Current-attempt webhooks may arrive before the session-record call and still fulfill exactly once. Numbered metadata prevents a prior session from being attached to the new attempt. The initial attempt's payload and idempotency key remain unchanged for rollout compatibility.

## Deployment

1. Apply `supabase/migrations/20260925120000_offer_checkout_recovery.sql`.
2. Deploy **offer-stripe-webhook** first. It must include the updated `_shared/offers.ts` event mapper to forward attempt metadata.
3. Deploy **offers-api**, including `_shared/offers.ts` and `_shared/offerCheckoutRecovery.ts`.
4. Deploy the website's `OfferAccess` UI and `OfferAccess` response contract.

The migration wraps the existing validated monetary transition procedures with attempt fencing. Its internal legacy procedures cannot be called by browser or service roles; public RPC wrappers and the preparation RPC are service-only. Administrators can read private attempt history through existing admin RLS. There is no public access to it.

Do not roll back the attempt-aware webhook after a second attempt has been created. Mixed versions fail closed but will prevent payment processing until the correct version is restored.

## Verification

- Focused backend, endpoint, and UI suites: 121 tests passed before final review.
- `node scripts/tests/offer-checkout-recovery-database.mjs`: isolated PostgreSQL checks cover migration backfill, prepared-attempt journaling, immutable snapshots, lost/concurrent-response replay, wrong token/session/attempt, original-window cap, retry limit, parent refund, webhook-before-record, late/duplicate events, current/retired refunds, contradictory paid events, and role restrictions.
- No real Stripe API request, checkout, charge, email, or production mutation was performed for verification. Real test-mode provider verification remains required before using recovery with customers.

## Deliberate limits

A session that cannot be identified after an uncertain original creation, an uncertain/processing payment, an expired original offer window, a refunded purchase, or a prepared retry that expires before its session can be recorded still needs support. The UI provides that route. This feature does not claim all failed-payment recovery is safe, and does not add one-click purchases, subscriptions, order bumps, or refund retries.

Provider references: [Retrieve a Checkout Session](https://docs.stripe.com/api/checkout/sessions/retrieve), [Expire a Checkout Session](https://docs.stripe.com/api/checkout/sessions/expire), [Create a Checkout Session](https://docs.stripe.com/api/checkout/sessions/create).
