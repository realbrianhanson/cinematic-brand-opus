# Deployment status and release procedure

Updated September 25, 2026. This replaces the earlier PR3–11 checklist; do not replay old migrations or follow its obsolete publishing, DNS, or account-change instructions.

## Verified release state

PR15, PR16, PR17 and PR18 are merged into `main`. Lovable's connected project `aad54f9f-2dc1-4e99-9396-88f3e07eb70c` reported exact sync at `bbe1dcda62ea70391b4e5882dc82d5d0768b90d7`. Frontend delivery is preview-only; a backend deployment does not publish the frontend.

The newsletter-truth, admin-overview and resources/guides migrations (`20260923140000`, `20260923150000`, `20260923152000`) were applied from their reviewed source in individual transactions, with source and version recorded in migration history. Live Overview and Audience reads now work. Resource job stall handling is installed.

All previously expected September23/24 migrations were found in history except the optional Jev schedule and the offer-access email retry schedule. Required offer delivery fields/RPCs are supplied separately by `20260925140000_offer_delivery_schema_without_schedule`, now applied without activating cron. Do not apply either schedule as a test. In particular, enabling `20260923141000_offer_access_retry_cron` can deliver previously queued customer messages.

The sender domain `m.brianhanson.com` is verified in Resend. The W39 rejection shown in the admin is historical. No customer messages were sent or retried during this release. No changes were made to DNS, authentication, administrator roles, provider keys or existing schedules, except the reviewed resource job stall sweeper contained in its migration.

## Remaining rollout

See `RELEASE_POLISH_20260925.md` for the new September25 change set and actual verification results. Deploy reviewed schema prerequisites before the matching backend and preview code. Record each migration atomically with its source. Check migration history after uncertain responses before attempting a retry.

The first managed deployment delivered 38 of 40 functions. The follow-up moves shared preflight/credit helpers into `_shared`; redeploy `cluster-opportunities`, `draft-from-opportunity` and their updated consumer `daily-content-run`. Check the follow-up PR delivery note for completion. The remaining managed deployment uses Lovable's function deployment capability. Repository sync alone does not prove deployment. Deploy the matching source only; do not regenerate code, invoke content generation, send newsletters, retry customer messages or publish the frontend as part of that operation.

Native Stripe secret and webhook configuration are absent in the current application. Real payment, delivery and authenticated destructive/CRUD QA need a confirmed separate test backend with Stripe test credentials and isolated recipients. A Lovable preview is not evidence of database isolation. Until then, isolated SQL suites and mocked provider/browser-component tests are the available evidence, not proof of live purchases or inbox delivery.

## Publication and editorial review

Brian retains the separate public frontend publication step. Review permissions for attributed testimonials before that publication. Historical content flagged for fact review still requires source-by-source human judgment; a flag alone does not prove a claim false, and a generation timestamp does not establish verification.

Revert code through Git history if needed. Keep additive migrations in place unless a reviewed rollback specifically accounts for newer clients and retained data.
