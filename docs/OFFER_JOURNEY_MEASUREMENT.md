# Follow-up offer measurement

A separate follow-up report in **Admin → Conversions** measures which exact native offer sequences lose or gain interest. It does not infer purchases from button clicks, external offers, or provider redirects.

## Optional visitor measurement

- The visitor must allow measurement. Canonical-origin, anonymous-visitor, GPC/DNT, preview/testing exclusions, session capabilities, consent revocation, and the existing 90-day retention apply.
- `/offer-access` still rejects ordinary page views and outbound click events. An intersection observer records a displayed follow-up only when it enters the viewport, once per displayed parent/child pair for that route/consent lifecycle. Browsers without intersection observation produce no inferred view.
- Event payloads contain a random event ID, one fixed action (`upsell_view`, `upsell_accept`, `upsell_decline`), the literal `/offer-access` path, and two published offer IDs. They contain no order IDs, emails, names, private access tokens/URLs, or free-text metadata.
- Continue records intent to begin the child checkout/free claim. The child reservation waits up to the existing one-second measurement handoff bound; optional tracking failure never stops checkout. Decline records only after the server confirms the decline.
- The collector requires both published native offers and either their current parent → child relationship or a fulfilled order's original relationship. This preserves measurement for older legitimate purchase links after you change the funnel. Continue/decline require a previously recorded view.
- Order attribution uses the immutable preceding **order's** offer/next-offer snapshot, an actual prior view of that exact pair, and the short-lived session capability. A child offer's standalone landing view cannot stand in for seeing the follow-up step. Neither views nor order/session links are backfilled.

## Reports and denominators

The follow-up report groups consenting sessions that began in the selected UTC period. Each parent/child row counts distinct sessions that saw that step. Continue, decline, confirmed free-claim, and confirmed live-purchase rates use only that row's measured view sessions. Actions may overlap across retries. Paid outcomes require the server-verified live payment mode and fulfilled status; currently refunded orders are excluded.

A separate operational table counts follow-up orders **fulfilled** in the selected UTC period, independent of visitor consent/session dates. It separates live paid, free, test, unknown-mode, and now-refunded orders. Order value stays separated by currency and excludes tests, unknown modes and currently refunded orders. It is before fees, not net earnings, and must never be divided by the measured-session denominator.

Existing landing-page rates continue to use qualifying offer landing views. Sessions containing only follow-up events are excluded from the public landing-page session denominator, source totals, and daily counts. Its un-attributed coverage counts include orders with follow-up-only views; the dashboard explicitly explains this and directs the owner to the separate follow-up report. All-native operational totals already include follow-up orders, so do not add the two operational tables together.

## Deployment and validation

Apply `20260925160000_offer_journey_measurement.sql` before deploying the updated `conversion-events` and `offers-api` functions/frontend. It reuses the existing private tables and retention job, adds no schedule, sends no email, and creates no order/payment. The admin RPC is `admin_offer_journey_snapshot(_days)`; it checks administrator identity and accepts only 7, 30, or 90 days. Collection and binding remain service-only.

The new report fails visibly with retry if its RPC is unavailable; other reports remain usable. Older frontends/backends can omit the optional public `order.offer_id` field and simply do not record follow-up views.

Validation: `scripts/tests/journey-measurement-database.mjs` covers private routes, published relationships, preceding views, child snapshot binding, standalone compatibility, immutable attribution, session cohorts, free/live/test/refund/currency distinctions, revoked/expired session cleanup, and grants. Browser/component tests cover visibility, consent, token exclusion, intention versus confirmed order, failure/retry, and bounded optional reservation handoff. Tests are isolated and do not submit real purchases or send customer messages.
