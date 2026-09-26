# External Stripe payment reconciliation

This is a separate operational payment ledger. It does not alter the native offer checkout, grant access, create charges, send emails, or join payment facts to browser sessions. It must not be added to manual-import totals without reconciling overlap. PushTen's actual account, product IDs, webhook subscription and isolated test flow remain **unverified** until an operator completes the steps below.

## Supported scope

The `external-stripe-webhook` function accepts signed `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `invoice.payment_succeeded`, `charge.refunded`, `refund.created`, `refund.updated` and `refund.failed` events. It retrieves the account, immutable event and current payment objects directly from Stripe. All provider requests are GETs. One-time Checkout and invoice payments (including subscription renewals) map to the underlying PaymentIntent, preventing Checkout/invoice/async/refund double counting. Subscription Checkout sessions themselves are recorded as unsupported, because invoice payments own that revenue.

Only exact configured price **and** product pairs qualify. Every line must map to one destination. A completed Checkout is not sufficient: payment must be paid, positive and captured. Invoice payments require paid invoices and a PaymentIntent allocated only to that invoice. A renewal is a payment, not a new customer. Native `metadata.integration=site-offers` payments are excluded.

Refund observations fetch the charge and the complete bounded refund list. Only `status=succeeded` refund amounts reduce value; pending, requires-action, canceled or failed refunds do not. A succeeded refund can later return to requires-action or fail, so an authoritative refresh may reduce the refunded amount. Refunds arriving before a sale can reconstruct its canonical invoice/Checkout mapping. Partial and full refunds remain distinct. Gross/refund/net monetary totals are decimal strings to preserve exact integers; currencies are never combined. Stripe charge minor units are preserved, including zero/three-decimal currencies and Stripe's two-decimal ISK/UGX representation.

Not covered: direct charges without a PaymentIntent, payments allocated across invoices, out-of-band payment records, mixed destinations, ambiguous checkout associations, unusual partial/multiple captures, baskets over 100 lines, more than 20 invoice payments, over 100 refunds, disputes/fees/credit notes, registrations/bookings and historical backfill. These limits fail closed or produce an explicit unsupported/unmapped outcome. Other payment gateways need their own adapter.

## Deployment and activation

Apply `20260926190000_external_payment_reconciliation.sql` through the normal reviewed deployment flow. Deploy `external-stripe-webhook` with Supabase JWT verification disabled: Stripe authenticates through its signature; the status action independently requires an authenticated administrator. No secrets belong in source, frontend variables, screenshots or logs.

Configure **separate external adapter secrets**, without reusing native offer configuration:

| Secret                           | Contract                                                                                                                                                                                                                                       |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `EXTERNAL_STRIPE_MODE`           | Exactly `test` or `live`.                                                                                                                                                                                                                      |
| `EXTERNAL_STRIPE_ACCOUNT_SCOPE`  | `self` for an endpoint in the actual Stripe account; `connected` for a Connect platform endpoint with an explicitly allowlisted account. Organization event contexts are unsupported.                                                          |
| `EXTERNAL_STRIPE_ACCOUNT_ID`     | Actual account ID `acct_…`; both authenticated account retrieval and event account scope must agree.                                                                                                                                           |
| `EXTERNAL_STRIPE_SECRET_KEY`     | A server-only `sk_test_…`/`rk_test_…` or `sk_live_…`/`rk_live_…` key matching mode and authorized to read that account and the required objects.                                                                                               |
| `EXTERNAL_STRIPE_WEBHOOK_SECRET` | `whsec_…` belonging to this endpoint and mode, not another endpoint or local CLI listener.                                                                                                                                                     |
| `EXTERNAL_STRIPE_PRICE_MAP`      | JSON array of 1–50 exact `{ "price_id": "price_…", "product_id": "prod_…", "destination": "pushten" }` entries. Destination is a lowercase bounded slug. Each price appears once. The example contains placeholders, not verified PushTen IDs. |
| `EXTERNAL_STRIPE_ENABLED`        | Only literal `true` enables intake; absent/false pauses it.                                                                                                                                                                                    |
| `EXTERNAL_STRIPE_LIVE_ACK`       | Live additionally requires literal `I_VERIFIED_ACCOUNT_PRODUCTS_AND_TEST_FLOW`, set only after the operator verifies account, mappings and the real test flow. This is an operator attestation, not automatic proof.                           |

Supabase supplies `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. Restrict the Stripe key to required read access where practical: account, events, Checkout Sessions/line items, invoices/line items/invoice payments, PaymentIntents, charges and refunds. Canonical reads explicitly pin `Stripe-Version: 2025-03-31.basil`; webhook payloads are used for identity and current objects are retrieved with that version. Create an endpoint for the seven events above at the deployment's `/functions/v1/external-stripe-webhook` URL.

Before live activation, verify the actual external platform integration. A HighLevel checkout using Stripe does not prove it uses Stripe Checkout Sessions. Confirm whether the sale creates supported invoices or sessions, and verify both initial annual payments and later renewals. Use an isolated Stripe test account/sandbox with its own actual product map, webhook secret and test key. Never place a test card in a live checkout. Exercise paid, unpaid/delayed, duplicate retry, refund-before-sale, partial/full/pending refund and renewal flows. Compare the resulting ledger to Stripe's own transaction totals. This work did not perform those real provider tests.

## Security, idempotency and failure behavior

The official Stripe SDK verifies the untouched UTF-8 body and `Stripe-Signature`, including its signed timestamp with a 300-second tolerance. Missing/invalid signatures, wrong mode/account and organization contexts are rejected. Canonical account/event retrieval verifies the credential scope. The endpoint is GET-only toward the fixed Stripe API origin, rejects redirects, limits reads to 32 calls/25 seconds, each request to 8 seconds, each body to 1 MiB and lists to at most five pages plus resource-specific item limits. It never follows provider-returned URLs.

`external_payment_events` stores minimized authenticated-event identity/digest, observation/acceptance times, resolution and counts. The digest includes only immutable event identity, API version and data fields; mutable delivery bookkeeping such as `pending_webhooks` is excluded. Changed bookkeeping is a legitimate retry; changed identity or data conflicts. Full provider bodies, contact data and secrets are neither stored nor logged. `external_payments` stores canonical payment/charge IDs, exact mapping, mode, currency and collected/refunded amounts. `external_payment_apply_event` commits receipt and facts atomically. A failed transaction leaves neither receipt nor partial facts and remains retryable.

Stripe does not promise event order and event timestamps have second precision. `provider_created_at` means the event's actual creation; `observed_at` means canonical retrieval completion. Neither orders updates. Immediately before authoritative PaymentIntent/charge/refund reads, the handler acquires an exclusive 60-second database refresh lease for that account/payment with a monotonically increasing fencing token. Busy payments return retryable errors. The atomic apply transaction locks and verifies the still-current, unexpired token before replacing refund totals in either direction. An expired worker cannot overwrite a newer refresh, even if its old request completes later. Successful apply releases its leases; handler cleanup releases leases after errors, while crash recovery uses expiry. No event timestamp last-write-wins rule is used. Immutable payment facts conflict rather than silently moving a payment between products/accounts/modes.

An accepted `unmapped`, `unsupported` or `not_paid` receipt stays accepted on retries. Adding a mapping later does **not** backfill those events. Backfill/reprocessing needs a separately reviewed reconciliation process. Keep old mappings stable while their payments can be refunded; deleting them may prevent later refund reconstruction.

Return 2xx only for a verified event that was durably processed/ignored, or an exact already-processed retry. Provider/DB failures return retryable errors. Monitor Stripe's delivery log and retry failures there; the admin panel cannot see events that never reached durable acceptance. Disable intake to stop writes; retain the ledger and migration data. The adapter creates no provider-side resources.

## Admin and database interfaces

- `POST external-stripe-webhook?action=status`: administrator-only safe configuration summary. Does not return keys, webhook secret or raw account data. `coverage_verified` remains false; configuration and accepted callbacks do not prove complete coverage.
- `external_payment_event_status(_provider text,_account_id text,_mode text,_event_id text,_payload_hash text)`: service role only; returns missing/processed/conflict.
- `external_payment_apply_event(_event jsonb,_payments jsonb)`: service role only; atomic deduplication and reconciliation. Exact contracts live in the migration and `externalPaymentHandler.ts`.
- `external_payment_acquire_refresh(_provider text,_account_id text,_mode text,_payment_id text)`: service role only; acquires a 60-second lease and returns `{status:'acquired',fence:'N'}`, or `{status:'busy'}`. Each payment observation includes the acquired decimal-string `refresh_fence`.
- `external_payment_release_refresh(_provider text,_account_id text,_mode text,_payment_id text,_fence text)`: service role only; releases only the matching current fence. Stale cleanup cannot release a newer worker's lease.
- `admin_external_payment_snapshot(_days integer default30)`: administrator-only JSON report for 7/30/90 UTC days. Payments are grouped by actual charge occurrence dates; their refunds reflect latest accepted observations. Callback counts use acceptance dates. History shows the latest 20 accepted callbacks across all dates. Live/test and currency totals remain separate.

Tables have RLS and no direct application-role grants. The new report is separate from native order reports and the manual CSV ledger. It does not calculate an external website conversion rate or claim a complete provider revenue total.

## HighLevel follow-up

No HighLevel adapter is activated in this slice. Current marketplace webhooks use Ed25519 `X-GHL-Signature`; legacy RSA was deprecated September 1, 2026. GHL `OrderCreate` may be pending and `OrderStatusUpdate` can signal completion, but the current catalog does not establish comprehensive refund/renewal delivery. The authenticated transaction API exposes invoice/subscription references and refunded amounts. A future adapter needs the actual sub-account OAuth/private-integration access, exact product mappings and payload tests, plus reconciliation polling or verified Stripe payments. Do not treat a generic workflow webhook as a signed marketplace event.

## Verification and primary documentation

Local validation: `npx vitest run src/lib/__tests__/externalPayments.test.ts src/lib/__tests__/externalPaymentHandler.test.ts` and `node scripts/tests/external-payments-database.mjs`. These test fixtures and an isolated PGlite database; they do not verify live provider credentials or production subscriptions.

- [Stripe signatures, retries and ordering](https://docs.stripe.com/webhooks)
- [Checkout fulfillment and delayed payment success](https://docs.stripe.com/checkout/fulfillment?payment-ui=stripe-hosted)
- [Invoice payments and allocation](https://docs.stripe.com/api/invoice-payment/object)
- [Invoice payment listing](https://docs.stripe.com/api/invoice-payment/list?api-version=2025-03-31.basil)
- [Pinned Basil invoice pricing model](https://docs.stripe.com/changelog/basil/2025-03-31/invoice-pricing-configurations)
- [Charge and refund semantics](https://docs.stripe.com/api/charges/object)
- [Returned and failed refunds](https://docs.stripe.com/refunds)
- [Event identity and mutable delivery bookkeeping](https://docs.stripe.com/api/events/object)
- [Event types](https://docs.stripe.com/api/events/types)
- [HighLevel signature guide](https://marketplace.gohighlevel.com/docs/webhook/WebhookIntegrationGuide/)
- [HighLevel transaction lookup](https://marketplace.gohighlevel.com/docs/ghl/payments/get-transaction-by-id/)
