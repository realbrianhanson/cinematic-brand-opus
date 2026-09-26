# Nonpayment experience polish

This release completes the five approved improvements while native Stripe setup remains pending. It does not publish the frontend, activate a journey, rewrite editorial content, enroll contacts, send QA emails, or run paid AI calls for testing.

## Delivered behavior

- The First AI Build planner offers explicit seven-day browser recovery, preserves unfinished edits separately from the generated plan, detects intervening tab writes, and provides a complete white Print / Save as PDF document. Optional descriptions stay in browser storage; existing consented project-enum observations are unchanged. See [planner recovery](PLANNER_RECOVERY_PRINT.md).
- Website chat now stops in-flight answers, retries the original question without duplicating it, aborts on close/reset, validates bounded text-only history, and separates history by site identity. Public help grounding includes the planner, support, access recovery and speaking. Catalog context follows the actual landing-page fallback rule, excluding hidden legacy copy when structured sections are rendered. The model, provider and pricing remain unchanged.
- Widgets, Site Setup, redirects and content-to-offer assignments save against the version actually edited. Stale writes/deletes preserve the local draft. Explicit reloads are guarded and cannot race another edit or save. See [configuration conflicts](ADMIN_CONFIGURATION_CONFLICTS.md).
- Orders support now searches contact, order ID, offer title and purchased extras; displays immutable basket snapshots; separates live, test and unknown payment modes; and reports access, first download-link issuance and the latest access-email status accurately. A provider accepting an email is not proof of inbox delivery; a download link is not proof of a finished download. The projection is admin-only and never returns private access tokens, storage paths, provider identifiers or email payloads. It has no send, refund or order-mutation action.
- Connected journey reports observe consenting measurement sessions separately from functional sessions. They show step reach, first branch choice, confirmed Continue, handoffs, active visits and settled visits with no observed next action, per immutable published revision. Handoffs are never presented as purchases. See [tracking and limitations](FUNNEL_JOURNEY_MEASUREMENT.md).

The empty-remix bootstrap also refuses inherited order-item, journey, idempotency-log, experiment and external-payment data, including the new optional measurement table.

## Deployment

Apply these additive migrations once, in order:

1. `20260927100000_admin_configuration_conflicts.sql`
2. `20260927110000_funnel_journey_measurement.sql`
3. `20260927120000_admin_offer_order_support.sql`

Deploy `funnel-journey-measurement`. It uses explicit origin, capability, consent and rate-limit validation with gateway JWT verification disabled, consistent with the existing public measurement collector. No additional secret is required. Git synchronization alone does not deploy the database migration or collector. The existing `conversion-events` collector and cleanup job handle shared withdrawal/retention; database cascades and the revocation trigger remove supplemental events.

Keep frontend changes in Lovable preview until the owner chooses Publish. Database and backend deployments use the shared project backend; the additions preserve old frontend compatibility.

## Verification and scope

Tests use isolated databases, mocked network responses and fictional local browser inputs. They cover stale admin writes/deletes and reload races, recovery/storage failures, actual chat-SDK cancellation/retry/reset, order privacy and labeling, literal search/filter/pagination, optional collector authorization, graph validation, deduplication, consent withdrawal and retention.

Browser verification reproduced and fixed a blank Chrome print document caused by Tailwind's important `[hidden]` reset. The final sample renders six complete white pages without the site's navigation, newsletter or offers. Named print pages cover the body to avoid a trailing blank page; list markers and heading typography are explicit. Actual printer/PDF pagination varies with paper settings. No physical print was submitted.

Payments, email inbox delivery and real model response quality have not been exercised through live customer/provider actions during this sprint. The user still needs Stripe readiness and an authenticated Brian Hanson GHL subaccount before those provider-specific checks can be completed.
