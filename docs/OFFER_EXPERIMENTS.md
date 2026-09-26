# Controlled offer copy experiments

The admin's Offer experiments screen creates a private draft from a published native offer with a standalone public claim page. Follow-up-only offers are excluded because landing experiments do not count child orders. A snapshots the current headline, supporting copy and real CTA label. B is a reviewed alternate for those three fields. Both variants share the same commercial terms, checkout, assets and the remaining page content. Drafts do not affect visitors. Starting uses a version check and permits only one running experiment per offer; stopping is final. Any change to the source offer automatically stops its running experiment. A new test must be created from the current offer.

The primary metric is fixed at creation: fulfilled free claims for free offers, or signed-provider-confirmed live paid orders for paid offers. Administrators record the hypothesis, minimum duration (7–90 days) and minimum exposed sessions per variant before starting. The suggested values are placeholders; choose a sample size using the baseline rate and smallest useful improvement. The UI reports observations and planned-sample progress without an automatic winner, p-value or promised conversion lift.

## Assignment and privacy

Tests use the existing optional, first-party measurement session and its secret capability. Only canonical-host, consented, anonymous traffic without a browser privacy signal participates. Preview, signed-in traffic, visitors declining measurement and external-checkout offers retain the published copy. A failed/slow experiment request never blocks the offer or its checkout. Requests omit cookies and contain bounded IDs and session capability, never contact data or full URLs.

Assignment is stable within one measured session, randomized 50/50 in the database, and idempotent on retries. A bounded client request can update text shortly after hydration; interaction cancels the pending decision so copy does not change while a visitor is using the page. Exposure is recorded only after the assigned headline is visibly on screen in an active tab. Assignments that are never displayed are excluded. Consent changes erase the session's assignment observations. Normal 90-day measurement retention applies, so older reports are not permanent accounting records.

## Outcomes

The browser cannot submit a conversion or payment. Reports join exposure, the existing authenticated measurement-to-order binding, fulfilled order state and verified payment mode. Exposure must precede reservation; follow-up orders are excluded from the landing test. A free primary resource in a paid basket counts as a free claim only after the basket has a verified live payment; test and unknown-mode baskets are excluded. Test payments and refunded sessions are separate. Refunded orders no longer count as conversions. Existing basket accounting remains separate from these session-level results.

Only purchase reservations made while the test ran qualify, including later completion of those reservations. Stopping a test or changing an offer cuts off new reservations. Report cohorts describe consenting sessions, not every visitor or unique person; a returning person can have another session. Provider callbacks and privacy withdrawals can update previously displayed totals. Reaching the planned minimums invites statistical review; it is not evidence of a winner by itself.

## Deployment

Apply 20260926200000_offer_experiments.sql after the commerce and existing measurement migrations. Deploy offer-experiments with gateway JWT verification disabled; the handler enforces canonical origin, anonymous transport, quotas and the private session capability. Public roles have no table access or direct decision RPC access. Admin functions enforce is_admin(auth.uid()). No experiment is started by migration.
