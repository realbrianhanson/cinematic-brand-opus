# Download access and email recovery

**Last updated:** September 23, 2026
**Deployment status:** The original outbox (migration `20260919210000`) was published September 19, 2026. The automatic retry worker (migration `20260923141000_offer_access_retry_cron.sql`, the updated `offers-api`, and the admin delivery panel) is in the repository and must be applied, deployed, and published in that order before it runs. Stripe credentials remain intentionally unset. Provider behavior is covered by isolated tests; no production email was sent for QA.

Native free and paid downloads retain their immediate private access page. Fulfillment also prepares a transactional email containing a private access link. External products and affiliate links remain entirely with their destination provider and never create these deliveries.

## Configuration and deployment

1. Apply and record `supabase/migrations/20260919210000_offer_access_delivery.sql` before deploying the changed functions. It adds private delivery/grant tables and an atomic fulfillment trigger. It does not send messages, queue historical orders, alter existing orders, or change Stripe keys.
2. Deploy `offers-api` and `offer-stripe-webhook`, including the shared access-mail helpers and `offers-api/deliveryRetry.ts`.
3. Apply and record `supabase/migrations/20260923141000_offer_access_retry_cron.sql` after `offers-api` is deployed. It adds the attempt columns and the `failed` status, replaces the claim/record functions, adds the admin requeue function, and schedules the `offer-access-retry-15min` pg_cron job. The job reads `CRON_INVOCATION_SECRET` from Vault and sends it as `x-cron-secret`; `offers-api` checks it against the same Vault secret (`get_cron_invocation_secret`), so no extra function secret is needed. The migration sends nothing by itself. Unschedule with `SELECT cron.unschedule('offer-access-retry-15min');`.
4. Publish the frontend. The access page, recovery form, native offer notice, and admin delivery controls use the new API fields/actions.
5. Check **Admin → Business → Offers & shop → Setup**. Mail uses `RESEND_API_KEY` plus the existing `newsletter_from_address`, `newsletter_reply_to`, and canonical HTTPS `site_url` settings. Sender configuration does not prove provider acceptance or inbox delivery. A separate live email test requires explicit authorization.

Paid native checkout requires both Stripe credentials and valid download-email configuration. Stripe keys remain intentionally unset for Brian's site. Free downloads still unlock immediately without mail configuration and visibly tell the visitor to save their private link. No newsletter subscription is created.

## Customer behavior

- The original browser-generated private link continues to work as before, including for older orders. Refunds still revoke downloads; access never follows from a checkout redirect alone.
- Initial emails are prepared atomically when a native order becomes fulfilled. Free claims attempt delivery in an Edge background task; verified paid fulfillment attempts delivery in the webhook. Email failures do not revoke an already fulfilled order.
- Emails contain new random 256-bit bearer links, valid for 30 days. Anyone holding a link can access that order while it is eligible. Expiry affects the emailed grant, not the original order or its original private link.
- `/offer-access?recover=1` requests links for up to 20 most recent fulfilled orders matching the entered email. Pending, failed, expired, refunded, and other-address orders are excluded. The response is the same whether a matching order exists. It never returns links, customer information, order counts, or entitlements to the requester.
- Recovery is rate-limited to 10 requests per IP per hour and 3 requests per address per day. A one-hour per-address cooldown reuses the same delivery instead of sending another message. A hidden website field absorbs simple bots. Limiter failures fail closed.
- The access page distinguishes provider-accepted, still-processing, unavailable, and uncertain delivery. It always retains the copy-private-link fallback and offers recovery/support. Provider acceptance is not described as guaranteed inbox delivery.

## Durable retries

The private outbox freezes the complete encrypted provider payload and hashed grants before contacting Resend. Each delivery has a stable provider idempotency key, a two-minute exclusive lease, and a saved provider receipt. Repeated claims, overlapping workers, and retried webhooks reuse the same initial delivery.

Automatic free delivery runs immediately after the claim. A failed or uncertain paid delivery returns a retryable webhook response after payment was safely recorded, allowing Stripe to retry the same email without applying the payment twice. Free customers can explicitly retry email from their access page. Another recovery request resumes the existing recovery delivery during its cooldown.

### Automatic retry worker

The pg_cron job `offer-access-retry-15min` runs every 15 minutes (`*/15 * * * *`) and posts `{"action":"retry_deliveries"}` to `offers-api` with the cron secret. Each run attempts up to 10 deliveries that are `pending` (or `sending` with a lapsed lease) and whose `next_attempt_at` is due, oldest first. When download email is not configured, the cron run returns `skipped: "delivery_unavailable"` and changes nothing. Leases, frozen payloads, and saved receipts keep an overlapping cron run, admin click, webhook, or customer retry from calling Resend twice for the same attempt.

Backoff is set per delivery after each unsuccessful attempt: 5 minutes after the first, then doubling (10, 20, 40, 80, 160, 320 minutes) up to a 6-hour cap, clamped to 1 minute–6 hours in the database. Because the worker only wakes every 15 minutes, an attempt can run up to 15 minutes after its due time. Every attempt records `last_attempt_at`, the provider HTTP status, and a short plain-English reason (no recipients, links, or payloads).

### Stopped deliveries: `failed` vs `needs_review`

Each attempt ends as `sent`, `not_sent` (Resend definitely did not accept it), `uncertain` (it may have: timeout, 5xx, 409, missing receipt, or an attempt interrupted after the payload was frozen), or `blocked`.

- **failed**: 10 attempts and Resend never accepted any of them. Safe to requeue once the cause (for example an unverified sender domain or a bad API key) is fixed.
- **needs_review**: automatic replay stopped because an earlier attempt may have reached Resend. This happens after 10 attempts with any uncertain result, or 20 hours after the first uncertain attempt, inside Resend's documented [24-hour idempotency window](https://resend.com/docs/dashboard/emails/idempotency-keys), so a customer is never emailed twice. Blocked sends also land here: an unreadable encrypted envelope, a known bounced/complained recipient, or a legacy recipient longer than 254 characters. Historical 255–320-character addresses never block order fulfillment. Newsletter unsubscribe status alone does not block a requested transactional access message.

### Admin view and requeue

`{action:"health"}` returns `delivery_pending`, `delivery_needs_review`, `delivery_failed`, `delivery_next_retry_at` (the earliest pending retry), and `delivery_last_issue` (the most recent pending, sending, failed, or needs-review delivery with a recorded reason: `id`, `status`, `attempts`, `provider_status`, `detail`, `at`, and `next_attempt_at` for pending rows). No recipients, links, or payloads are returned.

**Admin → Offers → Setup → Download email delivery** shows all three counts and explains the latest problem in plain English:

- Retrying: when the last try failed, the time, the reason, and the next scheduled try. Customers can still use their private link meanwhile.
- Failed: how many emails stopped after 10 tries without Resend accepting them. Fix the cause, then press **Requeue**.
- Needs review: check the Resend log first. Requeue only when it shows no send.

The page summary and setup heading stop saying "ready" while any delivery is failed, needs review, or retrying after a problem.

**Requeue** (behind a confirmation dialog) sends `{action:"retry_deliveries", requeue_id:<delivery_last_issue.id>}`. Only an administrator session may requeue; the cron secret cannot. The database returns the delivery to `pending` with its attempt count reset, the same frozen message, and the same idempotency key, and extends its emailed grants to 30 days from now. Deliveries that were already accepted (`provider_id` saved), are still retrying, or are blocked (bounced/complained recipient, legacy long recipient, unreadable envelope) return HTTP 409 `requeue_unavailable`. The same request then attempts up to 3 due deliveries, including the requeued one. It needs a configured sender; otherwise it returns 503 after requeueing, and the cron job picks the delivery up once sending is configured. **Retry due emails now** runs the same admin batch without a requeue.

A fresh customer-requested recovery email is a separate request and is never blocked by a stopped delivery.

## Privacy and access control

`offer_access_deliveries` and `offer_access_grants` have RLS enabled and no anonymous or authenticated table grants. Service-only functions prepare deliveries, claim/freeze/send receipts, and resolve capability hashes. The browser receives only its authorized access state or aggregate admin delivery counts plus the latest issue's ID, status, attempt count, provider status, and reason. There is no email-address-only access endpoint.

Tokens are SHA-256 hashed for lookup. The frozen email body is AES-256-GCM encrypted with a purpose-separated HKDF key derived from the existing service-role secret; the delivery ID is authenticated additional data. No plaintext bearer token is stored in an order, grant, or outbox column. Provider request bodies, recipient addresses, links, and errors are not logged. Links put tokens in the URL fragment, and the access page removes the fragment into session storage. The page remains noindex with a no-referrer policy.

Rotating the service-role secret makes old unsent envelopes unreadable; those sends are quarantined rather than rebuilt with a new payload under an old provider idempotency key. Already emailed hashed grants and original links remain valid. Fresh recovery requests use the new secret. The member bootstrap refuses inherited delivery or grant records, including on an already-marked copy; do not copy customer data into a member installation.

## Verification

Unit tests exercise encryption integrity/key and delivery binding, escaped email content, stable provider requests, malformed/failed provider responses, frozen-payload retries, suppression, and refusal to send before durable grant storage. Actual handler tests check recovery-response parity, admin authorization, refund denial, bounded bodies, and consistent checkout readiness. Component tests cover neutral recovery acknowledgement, duplicate submits, and input-preserving failures. Isolated PGlite tests load the real historical offer schema and cover no-backfill upgrades, legacy recipients, private grants, cooldown, exact initial idempotency, sequential lease exclusion/reclaim, stale receipts, expiry, old-token preservation, and uncertain-send quarantine. These sequential fixtures do not simulate truly concurrent database sessions. `OfferDeliveryHealth` and `OffersManager` component tests cover the failed/needs-review/pending counts, the plain-English retry and stop banners, confirmation-gated Requeue with its pending state, error toast, and health refresh, and the summary no longer claiming readiness while deliveries are stuck. The member bootstrap suite covers refusal to initialize over inherited delivery/grant data, including copies carrying an existing bootstrap marker.

`npm run test:database` includes `scripts/tests/offer-access-delivery-database.mjs`. Local verification uses mocked providers and isolated databases; it does not create live leads, orders, payments, subscriptions, or email deliveries.
