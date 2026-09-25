# Offer and funnel quality pass — September 25, 2026

Working tree: `/tmp/cinematic-quality-20260925`, starting commit `bd75611`. This report covers source review, mocked browser-component/API regressions and isolated database contract tests. It does **not** certify production payments, inbox delivery, live administrator writes or paid generation. No deployment, production mutation, email, payment or model call was performed.

## Repaired behavior

1. **Offer requests can no longer leave controls waiting indefinitely.** Claim, status, download, recovery, delivery health and retry requests have a 20-second outer deadline and abort their transport after completion/timeout. This bounds a stalled session lookup as well as the response. Unread non-2xx response bodies are decoded inside the deadline before transport cancellation, preserving useful server messages, codes and status. A used or unreadable error body retains a safe error and HTTP status. No mutation is retried automatically, and uncertain claims retain their existing idempotency token.
2. **Old payment checks no longer overwrite newer access.** Automatic and manual status requests use an ordered request identity in addition to the current access token. A late automatic `pending` response cannot hide a download that a newer check has confirmed. Requests for an old resource cannot change the current one. An explicit retry after an initial failure resumes bounded polling for pending payment/email processing. Background polling pauses during an explicit action, and access actions lock synchronously against rapid repeated clicks.
3. **Closed follow-up orders have an honest recovery path.** Expired, failed or refunded follow-up claims retain their child access token/link and the original resource remains available. The unusable accept/decline controls are hidden and support is offered. The existing database permits only one child order per parent; creating a new checkout for a closed child requires a separate backend design. This change does not promise or attempt an unsupported second child order.
4. **Proof-library failures are distinguishable from an empty library.** A failed read offers an in-place retry, keeps unsaved evidence fields, and does not say there is no saved evidence. Loading prevents evidence mutations from being overwritten by a late list result. Evidence save/delete use a synchronous mutation lock to prevent duplicate writes before React updates the controls.
5. **The copy assistant can recover from a stalled request.** Session acquisition is bounded at five seconds and the complete request/response at 40 seconds. An explicit cancel aborts the pending request and restores editing; a cancelled session lookup cannot later start generation. Late/cancelled suggestions cannot apply themselves, and the existing explicit-apply/stale-copy protections remain. Cancellation stops waiting locally; it does not certify that an already-started provider operation incurred no cost.

## Source coverage and existing protections checked

- `OfferEditor`: create/edit initialization, private drafts, publish confirmation, CAS version references, uncertain first-save recovery, status changes, handoff, revision restore, preview construction, file validation/upload, navigation protection, proof insertion, page controls and review.
- `offerBuilderClient`, `offerEditorState`, `offerBuilderDiff`, `OfferRevisionHistory`: draft/history data contracts, RPC null version tokens, restoration using current version tokens, material setting comparisons, legacy fallback and unchanged-public-content checks.
- `OfferPageFields`, `OfferNextStep`, `OfferDeliveryStep`, `OfferJourneyReadiness`, `OfferStatusActions`, `OfferReviewStatus`, `OffersManager`, `OfferDeliveryHealth`: section editing/order, recipes, selected follow-up, separate checkout limitation, save/publish affordances, configuration-versus-verification wording, list filters and delivery retry UI.
- `OfferCopyAssistant`, copy request/server schemas, `OfferProofLibrary`: generation request boundaries, server authentication/quota/deadline, explicit application, immutable proof snapshots, approval selection, private notes, editing/retry and mutation state.
- `OfferLanding`, `offerClaim`, `OfferAccess`, `OfferRecovery`, shared `offers` client: native/external/preview branches, paid-readiness retry, idempotent native claims, separate optional newsletter consent, checkout/access navigation, fragment privacy, polling, download, child acceptance/decline, access email and clipboard fallback.
- Offer route adapters/public loader and preview loader; relevant offer reserve-order SQL and access/status backend branches. The one-child-per-parent constraint was checked against the actual SQL rather than inferred from UI mocks.

This is targeted ownership coverage, not a claim that every byte of the repository or every stored offer record was read. The route/function-wide inventory is in `APP_QUALITY_MATRIX_20260925.md`.

## Executed validation

All executions below were local on September 25, 2026 against this worktree's offer changes:

- Baseline: **126 tests passed in six focused files** before changes.
- Expanded final offer suite: **288 tests passed in 20 files**. Includes the changed client, journey, proof and assistant tests; builder schema/validation/diffs; editor, list, readiness and delivery-health controls; access recovery; copy handler; HTTP/backend, mail and delivery helpers.
- Newly added regressions were observed failing before the related fixes for: stalled API transport, stale status response, retry polling, false-empty proof failure, assistant cancellation and assistant timeout. Further regressions verify HTTP error-body lifetime, terminal-child behavior against the real contract, rapid duplicate actions and initial proof-load mutation protection.
- **Three isolated database suites passed:** `offers-database.mjs`, `offer-builder-database.mjs`, `offer-access-delivery-database.mjs`. These exercise reserve/retry constraints, published/native/external protections, shop privacy, order snapshots, draft CAS/history, proof permissions, access grant isolation/expiry, delivery lease/retry/receipt rules, uncertain-send handling and scheduled retry contracts.
- Scoped ESLint and `git diff --check` passed. Parent owns the integrated repository typecheck/build, full-suite execution and independent review record.

No tests used real contact details, a live inbox, Stripe transactions or the paid AI gateway. Mocked component success is not proof of the deployed adapter/provider outcome.

## Required release evidence

1. In a disposable authenticated environment, create and save a private free, paid and external offer; reload each; edit/publish; race a save from a second session; restore a historical revision; upload the supported file types; verify storage visibility and old-order file snapshots. This browser-to-database/storage path remains unexecuted here.
2. Use Stripe test mode and a test inbox to prove claim/payment/webhook/fulfillment, duplicate/out-of-order signed events, async payment, expired/failed/refunded orders, follow-up acceptance/decline/deadline and access recovery. Check the actual delivered file and email, not only a redirect or configuration flag.
3. Verify the deployed copy handler with a small explicitly budgeted generation, including authentication expiry, cancellation and provider failure. Local schema/handler tests do not prove output quality or provider availability. Whole-page context for the copy assistant remains the separate opportunity recorded in `EXPERT_REVIEW_FUNNELS_20260925.md`.
4. Manually verify authenticated builder keyboard/focus and mobile layouts with long real copy, all section/media types and changed routes. This agent did not use browser automation or assert visual perfection.
5. Treat frontend preview, shared-backend release and live publication as distinct release steps. No existing main-branch approval restriction is bypassed by these local fixes.
