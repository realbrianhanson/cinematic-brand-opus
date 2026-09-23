# Offer builder

The admin offer builder adds private strategy, working copy, page sections, contextual upsell copy, a proof library, revision recovery, and AI copy assistance. Existing offers remain the commerce identity used by checkout, downloads, catalog listings, and historical orders.

## Data and publication

- `offers.presentation` is the published presentation only. Anonymous visitors can read it only for published offers under the existing row policy. Null preserves the original page layout and copy.
- `offer_builder_drafts` holds the complete private working document: `{ offer, builder }`. `offer` contains editable commerce fields and `builder` follows `src/lib/offerBuilder.ts`.
- `offer_builder_revisions` retains an immutable revision for every successful save or publication. Authenticated administrators can read revisions but cannot write, update, or delete them directly. The UI loads the latest 30 revisions.
- `offer_proof_items` is an administrator-only reusable library. Proof notes, approval state, selected proof IDs, strategy, and working copy never enter the public presentation.

Saving a draft of an existing offer does **not** update any `offers` column, including its price, status, slug, asset, funnel destination, presentation, or `updated_at`. For a new offer, the first save creates a minimal valid draft identity; incomplete paid setup stays in the private document until publication. Its temporary live slug is `draft-{id}`. The editor keeps the requested draft slug separately.

Publication writes the explicitly allowed commerce fields, forces the published status, and installs the validated presentation in one transaction. Existing price, published-readiness, external-listing, catalog, asset-path, and acyclic-funnel constraints still run. A failed publication does not create a revision or alter the draft. Published presentation sections retain the shared schema's `proofId` key with an empty string, so internal proof references cannot leak.

The database validates exact keys and types recursively, bounds section counts to 30 per page, bounds copy and URLs, checks HTTPS URLs, and caps each working document at 1 MB. The public presentation constraint also protects direct legacy writes. Raw HTML is not part of the schema; the shared public renderer is responsible for rendering text and safe links.

## Save and recovery contract

`offer_builder_save(_offer_id, _document, _expected_offer_updated_at, _expected_draft_version, _publish, _request_id)` is callable only by authenticated administrators. Use null versions for a new offer or absent draft. It returns `{ offer, draft, revision_id, published }`; the draft includes `version`, `updated_at`, and `base_offer_updated_at`.

Each save compares both the current live offer timestamp and the private draft version. A stale client gets a conflict instead of overwriting another editor. Direct changes through a legacy editor invalidate the live timestamp. When loading an older draft whose base timestamp differs from the current offer, the editor must show the mismatch and reconcile the working commerce fields before a subsequent save or publication. After that deliberate reconciliation, the current live timestamp and current draft version permit saving.

Offer mutations acquire the shared funnel graph lock before locking offer rows. A statement trigger gives direct insert, update, and delete operations the same order as the builder RPC, preventing a legacy edit and builder save from deadlocking through reversed lock acquisition. New-offer creation is serialized before checking whether its ID exists; simultaneous creates cannot bypass the same timestamp and draft-version checks.

A request UUID is durable idempotency: retry the **identical** inputs with the **same** request ID after an uncertain network failure. The database returns the original result even when later revisions exist. Reusing that request ID for changed content or different expected versions is rejected. A new user edit or a resolved conflict requires a new ID.

Recovery loads an earlier document into the current working copy; it does not change the live page. Saving recovered content uses the current concurrency values and creates a new revision. Publication remains a separate action. Purchase snapshots and stored customer access are never modified by builder saves or recovery.

Client helpers are in `src/lib/offerBuilderClient.ts`:

- `loadOfferBuilder(id)` returns the draft and latest 30 revisions.
- `saveOfferBuilder({ offerId, document, expectedOfferUpdatedAt, expectedDraftVersion, publish, requestId })` implements the RPC contract.
- `listOfferProof()` returns up to 200 items, newest first.
- `saveOfferProof(input)` creates or updates proof; `deleteOfferProof(id)` removes a library record. Previously published text remains an independent copy.

## AI assistance

The server verifies the administrator's authenticated session and reads approved proof using that session. `admin_offer_copy_allow()` supplies a database-backed rolling limit of 12 requests per minute and 100 per day per administrator. It records only the user ID and request time, not prompts or generated copy, and remains effective across server instances. Only authenticated administrators can call it; usage rows are private. The endpoint must call it before model generation and fail closed if the RPC is unavailable.

AI results are suggestions for the editor. They do not save, publish, change prices, or insert unreviewed proof automatically. Requests, selected evidence, model responses, and media addresses must pass their corresponding shared/server validation. The production deployment needs the configured AI provider environment variables already used by the project; provider availability is separate from the migration.

## Deployment

1. Apply `supabase/migrations/20260923090000_offer_builder.sql` to the target database before exposing the new editor. It is additive and requires the existing offer, shop, and external-listing migrations.
2. Deploy the updated `offers-api` edge function so access responses include the published thank-you presentation. Deploy the application and AI server route from the same release. Check the configured authenticated API and model access in the target environment.
3. Verify a new private draft, an existing published offer draft, an explicit publication, revision recovery, approved proof selection, and an authenticated AI suggestion in the preview environment.
4. Confirm old published offers with null presentation, existing checkout/access links, and existing analytics still work. Verify both accept and decline previews without creating orders.

The implementation does not add new payment capture behavior, one-click charges, order bumps, multi-branch funnel execution, or automated split testing. Existing hosted checkout and follow-up routing remain the purchasing flow for this release.

## Verification

Run `bun scripts/tests/offer-builder-database.mjs`. The in-memory PostgreSQL suite applies the real migrations and verifies anonymous/member isolation, administrator proof access, immutable revisions, incomplete draft handling, publication atomicity, exact public schema, private proof stripping, no live mutations on draft save, request replay, dual concurrency checks, revision restoration, direct legacy changes, historical order snapshots, and durable AI limits. Run the existing offer database tests and application tests alongside the release's typecheck, lint, build, and browser journey checks.
