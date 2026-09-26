# Funnel platform completion — September 26, 2026

User-approved scope: flagship continuation, commerce and delivery verification, confirmed external revenue, connected funnel branches, optional order bumps, downsells, and controlled offer experiments. Editorial/article corrections are excluded.

## Workstreams

- Native commerce: public_theme_architecture owns basket snapshots, exact totals, downloads and persisted downsell decisions; additive migration 170000.
- Connected journeys: template_fit_current_builder owns versioned graph, validator, editor, simulator, public runner and First AI Build continuation; additive migration 180000.
- External revenue: site_experience_audit owns signed provider adapter, private event ledger, reconciliation and setup panel; additive migration 190000.
- Experiments and integration: root owns consented stable two-variant offer tests, verified outcome reporting, shared routes/sidebar/types/config and release validation; additive migration 200000.

## Acceptance and release status

- Implementation complete across four workstreams; integration/regression and browser checks complete.
- Independent reviews fixed: returned/failed-refund accounting with durable fencing; mutable webhook delivery envelope; endpoint-version event rendering; stale offer variant state; unsaved funnel navigation; stale journey responses.
- Passed: independent code/security/database reviews; application typecheck and lint; 2,501 tests across 223 files; complete database regression suite; all backend function runtime checks; production build and production preview runtime checks.
- Passed: local browser plan generation and isolated editor/simulator, public branches, checkout-extra/download/decline previews, experiment create/start/stop, white/dark and mobile layout checks. Isolated UI fixtures made no live orders, emails or configuration writes.
- Final production rebuild passed after the last review fixes.
- Pending: GitHub merge, additive database migrations, exact backend deployment, Lovable preview verification.
- Apply all five migrations in timestamp order before deploying `offers-api`, `funnel-journey-api`, `external-stripe-webhook`, `offer-experiments` and `offer-stripe-webhook` (the latter shares the updated commerce module). Confirm the daily journey-retention task and refreshed RPC signatures.
- Keep optional extras, downsells and experiments inactive during a preview-only rollout. Access emails open the canonical published frontend; publish the compatible frontend before enabling commerce that needs its multi-file access interface. The owner journey seed stays private until deliberate publication.
- Provider activation pending: user asked for the real provider workspace and dedicated test inbox. Public native API currently reports payments_ready=false. No real customer QA emails or charges authorized for testing; no public frontend Publish.
- Preserve current dark appearance, intentional white appearance, old orders and existing fulfillment. No historical order or email backfills. No invented prices, outcomes, testimonials, urgency or one-click charges.
- Outside checkout handoffs remain handoffs until signed, reconciled provider evidence confirms payment. Test payments and refunds must be identified separately. Experiments stay off until intentionally configured and started; no automatic winner claims.
