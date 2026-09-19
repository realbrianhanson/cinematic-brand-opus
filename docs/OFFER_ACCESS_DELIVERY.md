# Download access and email recovery

**Last updated:** September 19, 2026
**Deployment status:** Published September 19, 2026. Migration `20260919210000` is applied and recorded; both functions are deployed. The live admin confirms a configured download-email sender and zero pending or uncertain deliveries. Stripe credentials remain intentionally unset. Provider behavior is covered by isolated tests; no production email was sent for QA.

Native free and paid downloads retain their immediate private access page. Fulfillment also prepares a transactional email containing a private access link. External products and affiliate links remain entirely with their destination provider and never create these deliveries.

## Configuration and deployment

1. Apply and record `supabase/migrations/20260919210000_offer_access_delivery.sql` before deploying the changed functions. It adds private delivery/grant tables and an atomic fulfillment trigger. It does not send messages, queue historical orders, alter existing orders, or change Stripe keys.
2. Deploy `offers-api` and `offer-stripe-webhook`, including the new shared access-mail helpers. No new function or cron job is required.
3. Publish the frontend. The access page, recovery form, native offer notice, and admin delivery controls use the new API fields/actions.
4. Check **Admin → Business → Offers & shop → Stripe setup**. Mail uses `RESEND_API_KEY` plus the existing `newsletter_from_address`, `newsletter_reply_to`, and canonical HTTPS `site_url` settings. Sender configuration does not prove provider acceptance or inbox delivery. A separate live email test requires explicit authorization.

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

Automatic free delivery runs immediately after the claim. A failed or uncertain paid delivery returns a retryable webhook response after payment was safely recorded, allowing Stripe to retry the same email without applying the payment twice. Free customers can explicitly retry email from their access page. Another recovery request resumes the existing recovery delivery during its cooldown. Administrators can retry up to three pending deliveries per click in the setup tab. There is no hidden periodic worker: pending counts and these retry paths are explicit.

Resend documents a [24-hour idempotency window](https://resend.com/docs/dashboard/emails/idempotency-keys). This implementation stops automatic replay after 20 hours or ten attempts and marks the message **needs review**. An unreadable encrypted envelope, known bounced/complained recipient, or legacy recipient longer than 254 characters also needs review. Historical 255–320-character addresses never block order fulfillment. Inspect the provider receipt before any manual resend; a fresh customer-requested recovery email is a separate request. Newsletter unsubscribe status alone does not block a requested transactional access message.

## Privacy and access control

`offer_access_deliveries` and `offer_access_grants` have RLS enabled and no anonymous or authenticated table grants. Service-only functions prepare deliveries, claim/freeze/send receipts, and resolve capability hashes. The browser receives only its authorized access state or aggregate admin delivery counts. There is no email-address-only access endpoint.

Tokens are SHA-256 hashed for lookup. The frozen email body is AES-256-GCM encrypted with a purpose-separated HKDF key derived from the existing service-role secret; the delivery ID is authenticated additional data. No plaintext bearer token is stored in an order, grant, or outbox column. Provider request bodies, recipient addresses, links, and errors are not logged. Links put tokens in the URL fragment, and the access page removes the fragment into session storage. The page remains noindex with a no-referrer policy.

Rotating the service-role secret makes old unsent envelopes unreadable; those sends are quarantined rather than rebuilt with a new payload under an old provider idempotency key. Already emailed hashed grants and original links remain valid. Fresh recovery requests use the new secret. The member bootstrap refuses inherited delivery or grant records, including on an already-marked copy; do not copy customer data into a member installation.

## Verification

Unit tests exercise encryption integrity/key and delivery binding, escaped email content, stable provider requests, malformed/failed provider responses, frozen-payload retries, suppression, and refusal to send before durable grant storage. Actual handler tests check recovery-response parity, admin authorization, refund denial, bounded bodies, and consistent checkout readiness. Component tests cover neutral recovery acknowledgement, duplicate submits, and input-preserving failures. Isolated PGlite tests load the real historical offer schema and cover no-backfill upgrades, legacy recipients, private grants, cooldown, exact initial idempotency, sequential lease exclusion/reclaim, stale receipts, expiry, old-token preservation, and uncertain-send quarantine. These sequential fixtures do not simulate truly concurrent database sessions. The member bootstrap suite covers refusal to initialize over inherited delivery/grant data, including copies carrying an existing bootstrap marker.

`npm run test:database` includes `scripts/tests/offer-access-delivery-database.mjs`. Local verification uses mocked providers and isolated databases; it does not create live leads, orders, payments, subscriptions, or email deliveries.
