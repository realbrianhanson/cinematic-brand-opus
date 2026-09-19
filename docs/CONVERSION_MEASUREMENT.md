# Conversion measurement

The admin conversion report combines **optional browser measurement** with **actual native order records**. It never treats a click as a sale or mixes currencies.

## What the report means

- Date ranges are 7, 30 or 90 UTC calendar days, including today.
- Measured sessions are consenting, anonymous visitor sessions that **started** in the chosen range. They expire after 30 minutes of inactivity or 24 hours total. They are sessions, not unique people.
- Traffic source, medium and campaign are fixed on the first accepted event. Only short lowercase slugs are accepted. Query strings, fragments, full referrers, emails, order/access tokens, IP addresses and user agents are not saved with events.
- Shop, offer and outbound counts are distinct measured sessions. These are independently reached steps; they are not a claim that every visitor followed a fixed linear funnel.
- A free claim or paid order is attributed only when the server reserved the real order with a valid, still-active session capability and that session had already viewed the **same offer**. Later requests cannot move attribution to another session.
- Paid conversion and revenue metrics include only currently fulfilled, positive-price native orders whose **verified Stripe webhook** classified them as live. Reservation-time configuration cannot prove a live payment. Test payments and payments with unknown mode are shown separately. Historical records are not guessed to be live.
- Native totals use actual fulfillment time within the chosen range and include real orders without browser consent. They therefore have a different denominator from the measured-session cohort. No click-to-sale rate uses unrelated orders.
- Refunds mean orders fulfilled during the chosen range that are now marked refunded. This is not a count of refunds processed during that date range because existing orders have no refund timestamp.
- Revenue is the recorded order amount for currently fulfilled live orders, separately by currency; refunded orders are excluded. It is not payout, profit or a Stripe balance.
- Download links issued counts orders whose **first signed download URL** was successfully generated in the range. It does not prove a visitor completed the file download. Repeated link requests do not inflate the count.
- Unattributed native outcomes have no qualifying optional measurement link, including when a visitor withheld or withdrew consent. A retained session that began before the chosen period is still recognized as known attribution for coverage but is not added to the period's session funnel.
- Sources, offers and placements are each limited to their top 20 rows. Summary counts cover the whole selected cohort.

## Collection and access

`conversion-events` accepts only bounded POST bodies (8 KiB, at most ten events) from the configured HTTPS site origin. Only `page_view`, `shop_view`, `offer_view` and `outbound_click` are accepted. Public paths, placements, destinations and published offer IDs are validated. The collector uses its own clock, never a browser-supplied event time or claimed purchase.

Record requests require `consent: true`, a random UUID session ID and a separate random 256-bit capability (`session_token`, 64 lowercase hex characters). Only its SHA-256 hash is stored. Knowing a session ID alone cannot append events, attach an order or forget that session. Unknown bearer tokens and authenticated traffic, DNT/GPC, identifiable bots, local/preview origins and known QA/admin paths are excluded. Browser code also excludes signed-in users and owner testing before collection. This reduces test/bot contamination; it is not proof against a sophisticated client forging public measurement requests.

Rate limits use hashes of an edge-provided IP address and session ID with the existing bounded limiter. Raw IP addresses and user agents are not stored in conversion tables or application logs. Error responses/logs never include request bodies or private provider details.

All conversion tables have RLS enabled and no anonymous or authenticated direct-table grants. Only service-side functions can record facts. The aggregate `admin_conversion_snapshot` RPC independently checks `is_admin(auth.uid())`, even for an authenticated caller.

## Consent withdrawal and retention

A capability-authenticated `forget` request removes the session's events and order attribution. A minimal revoked-session tombstone (capability hash and timestamps, with source labels reset) prevents an already in-flight event batch from recreating measurement after withdrawal. This revocation still works after DNT/GPC or sign-in changes.

The `conversion-retention-daily` cron job calls `conversion_cleanup()` every day at 04:23 UTC. It removes sessions older than 90 days and cascades their events and optional order attribution, including revocation tombstones. Daily scheduling means deletion occurs on the next scheduled run after the cutoff. The migration fails if the scheduler is unavailable rather than silently omitting retention.

Payment mode and first-download facts are operational order metadata without browser identity; they remain tied to the order. Deleting optional measurement never deletes a purchase, changes its access rights, sends an email or alters a subscription.

## Deployment and verification

1. Apply `20260919220000_conversion_measurement.sql` with pg_cron available.
2. Deploy `conversion-events`, `offers-api` and `offer-stripe-webhook` together with their shared modules.
3. Publish the frontend. The collector will refuse preview/local origins; previews can use isolated request mocks.
4. Confirm the configured `site_settings.site_url`, the installed cleanup cron job, and admin-only report access.
5. Existing native orders remain available during tracking failures. Optional order, download and payment-mode RPCs abort after 500 ms and safely ignore measurement errors, so an analytics outage cannot hold checkout or fulfillment open. Browser tracking and attribution remain best-effort. If payment-mode recording is unavailable after a verified payment, that payment is reported as unknown rather than assumed live; a duplicate verified webhook can reconcile its mode.

Run `node scripts/tests/conversion-database.mjs` for the isolated SQL role, capability, deduplication, expiry, attribution, refund, currency, cohort, withdrawal and retention checks. The cron fixture proves job installation and executes cleanup directly; it does not simulate an elapsed production day or parallel PostgreSQL transactions. `src/lib/__tests__/conversion-backend.test.ts` verifies real collector HTTP handling with mocked persistence, payload bounds, privacy exclusions and nonblocking order hooks. Tests do not send real email, create live orders or use Stripe payments.

## Browser controls and release

Measurement is off until the visitor allows it. The main footer and offer footer expose Measurement preferences. Preference storage failures fail closed, revocation clears this tab's session, and a storage event carries a decline across open tabs. A subsequent opt-in starts a new session capability. The collector response must acknowledge `accepted: true` before a claim receives optional attribution. A collection failure never disables the form.

The browser uses a local-storage preference and session-storage capability. Only the configured canonical HTTPS origin measures activity; local previews and URLs containing a `measurement` parameter are excluded. Use `?measurement=off` for production read-only QA. Browser tests mock collector requests and must never write fabricated production activity.

Resource CTA collection now uses the same private collector. The previous `cta_events` writer is retired; existing historical rows are not mixed into conversion totals. Legacy reports identify the change in collection rather than implying the old data still measures current activity.

Deploy migration `20260919220000_conversion_measurement.sql` and the `conversion-events`, `offers-api`, `offer-stripe-webhook`, and `weekly-report` edge functions, then publish the frontend. Verify the managed backend deployment independently from GitHub sync. Member sites use their own canonical URL and a clean database; the bootstrap refuses inherited conversion data but permits the initialized configuration singleton. No third-party analytics key is needed. Stripe credentials remain a separate owner setup step.
