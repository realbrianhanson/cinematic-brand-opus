# Admin and backend audit — September 25, 2026

This is the non-offer portion of the website audit. The release coordinator owns the public website, funnel builder, live read-only verification, newsletter dashboard findings, dependencies, and release checks. This review did not send mail, invoke paid generation, edit production records, or deploy functions.

## Confirmed defects fixed

### 1. Speaking email settings failed to load for an administrator (high)

`src/components/admin/SpeakingNotifications.tsx` selected `site_settings.newsletter_reply_to` directly. The database deliberately withholds that private email column from the authenticated table grants. An administrator's RLS role cannot override a missing column privilege. This matches the error observed in the authenticated live browser by the release coordinator.

The panel now uses the existing `admin_read_site_settings` RPC, which verifies the administrator role before returning private configuration. No grants or defaults were relaxed. Regressions simulate refusal of direct private-column reads and a rejected RPC; the failed lookup never enables saving. Existing settings remain disabled until the owner changes them.

### 2. Automatic guide publishing could never authenticate its link rebuild (high)

`supabase/functions/generate-pillar/index.ts` calls `build-silo-links` with the service-role bearer. The old link endpoint unconditionally used `auth.getUser()`, which cannot resolve a service-role token to a user, and returned 401. The caller only caught rejected network promises, so an HTTP error was silently ignored.

The link endpoint now uses the established `authorizeCronOrAdmin` helper. It accepts a verified service-role/cron invocation or an authenticated administrator, and still refuses arbitrary bearers. The guide caller checks HTTP status, applies a deadline, and registers the follow-up with `EdgeRuntime.waitUntil` so it survives the response lifecycle. HTTP tests cover the verified-internal path, authorization refusal, invalid inputs, unsupported methods, and safe error responses.

### 3. Rebuilding internal links could erase valid links and report false success (high)

The old `build-silo-links` deleted existing links before reading source content, ignored query/insert/delete errors, and incremented the success count even when inserts were refused. A temporary source query failure could wipe the whole graph while reporting success. Every rebuild also discarded unchanged link IDs and their dependent click history.

The new `build-silo-links/links.ts` reads all source pages, guides, and existing links before writing. It preserves unchanged IDs, updates changed anchors in place, saves additions first, and only then removes obsolete/duplicate links. Every storage failure rejects the operation. Pagination reads to exhaustion instead of rebuilding only the first API result window. Missing requested pages are rejected before any mutation.

This is deliberately a migration-free repair, not a claim of a database transaction. If a later write fails, earlier successful additions can remain; the endpoint reports failure and a retry reconciles them. Multiple simultaneously running rebuilds are not serialized by a database lock and can temporarily insert duplicates. A subsequent reconciliation removes duplicates. A transaction/RPC plus unique identity constraint remains the stronger long-term option if concurrent rebuilding becomes common.

### 4. Individual link rebuilds bypassed the sibling cap and content-type rule (medium)

The old reverse-link loop linked every existing sibling to a newly published resource without checking content type or the ten-link cap enforced by the forward loop. Early resources could accumulate hundreds of siblings even though the code promised a cap of ten.

Individual rebuilds now reconcile affected source pages using the same deterministic selection as a full rebuild: published resources in the same assigned niche, different content types, at most ten recent siblings. Moving or unpublishing a resource repairs incoming links too. Unassigned resources cannot become an accidental cross-topic silo. Tests exercise fourteen siblings, same-type exclusion, draft exclusion, and removal of stale links.

### 5. Background resource refreshes overwrote unsaved edits (high)

`src/components/admin/GeneratedPageEditor.tsx` hydrated the entire form whenever `updated_at` changed. A query refresh after another administrator saved a change replaced the current administrator's unsaved JSON despite the comment promising to preserve it.

The editor now hydrates only once per resource and explicitly resets hydration after a confirmed successful regeneration or an administrator-confirmed reload. Background changes leave local typing intact. The saved baseline remains independent from query refetches: a newer query result refuses saving, and every update includes an atomic `updated_at` comparison so a change that has not refetched is also protected. Successful writes advance the baseline from the returned row. Server scoring can advance its timestamp only when editable title, status, content, and SEO fields still match the saved baseline; a concurrent edit stops publication or an override.

Regressions include an administrator opening a draft, another administrator publishing it, a background refetch, and the first administrator attempting to save the preserved draft. The published content and status remain unchanged. Additional tests cover an unseen concurrent change, scoring between save/publish, changes during the override dialog, and explicitly loading a fresh baseline.

### 6. A removed resource could appear to save successfully (medium)

Resource updates previously checked only the Supabase error. An update matching zero rows is not a database error. The editor now requires a returned row before reporting success, invoking scoring, or navigating away. A regression simulates a resource disappearing before save and verifies that the editor retains the user's changes.

### 7. A score calculated from old content could validate a newer resource (high)

`supabase/functions/score-content-quality/index.ts` read the resource, calculated its score, and saved that score by ID without checking the source version. A concurrent edit could clear the old score in the database, only to have the stale computation put it back onto changed content.

Score persistence now compares `updated_at` from the source read and requires a returned row. A changed/deleted row gets HTTP 409 and `persisted: false`; the administrator must score the latest content again. Unsaved preview scoring remains read-only. HTTP regressions cover successful version-matched scoring, a concurrent update, and no-write previews.

## Further findings and limitations

- **Media deletion coverage:** the original usage checker omitted builder JSON and branding JSON, so it could incorrectly label visible assets unused. Passed to the release coordinator, who owns its implementation and tests in this audit.
- **Admin overview/audience newsletter failures:** independently observed by the release coordinator; their investigation/fix is outside this package to avoid overlapping edits.
- **Remaining cross-editor save conflict detection:** blog posts and generated-resource edits now have persisted-version conflict protection. Topic guides still save by ID. Extending the same workflow to topic guides and server-side regeneration remains recommended. This package does not claim to solve every multi-editor conflict.
- **Outbound source fetches:** the shared bounded fetcher validates URL literals and redirects, deadlines, and response size. It does not resolve DNS and bind the result to a checked public address. A hostname that resolves to a private address is not rejected by hostname validation alone. No private-network request was attempted. Treat stronger DNS/egress controls as an infrastructure hardening item rather than a demonstrated live exploit.
- **Legacy auth-column caveat:** `20260923111000_public_column_grants.sql` already documents that non-admin authenticated accounts can read private columns of published content because authenticated table reads are retained for the admin UI. This is not a new finding from this review. Keep public Auth signup disabled until admin reads are separated, as that migration documents.
- **Admin forms and uploads:** several older forms use modal wrappers rather than the shared accessible Dialog and do not consistently preserve drafts on accidental navigation. Media, news, and guide uploads also have different client validation and library-registration behavior. Standardizing these workflows is useful polish but is not reported as a new unauthenticated upload vulnerability; writes remain administrator-restricted.

## Coverage

The review inspected the route/component/library inventory and authentication paths (`AuthContext`, protected routes, admin login, admin preview marker, shared cron authorization), public chat guard and response headers, private configuration grants, generated-resource/guide editors and publishing/scoring, generation controls and link building, media uploads/deletion/reference checks, redirect reads/writes, speaking intake/notifications/configuration and delivery grants, newsletter subscribe/confirmation/unsubscribe/webhook handlers and delivery documentation, source polling and bounded fetch helpers, and rendering/error boundaries. Migration policy/grant searches covered the migration inventory; the release coordinator performed the independent live RLS/read-only inspection and the full database suites.

Files with consequential new behavior in this package:

- `src/components/admin/SpeakingNotifications.tsx`
- `src/components/admin/GeneratedPageEditor.tsx`
- `supabase/functions/build-silo-links/index.ts`
- `supabase/functions/build-silo-links/links.ts`
- `supabase/functions/generate-pillar/index.ts`
- `supabase/functions/score-content-quality/index.ts`

This is risk-based source inspection, not a statement that every code path was executed. The public UI/funnel reports cover separate surfaces. Tests use isolated mocks and local data only.

## Verification and rollout

Targeted component/HTTP/reconciliation suites verify the failures above. The three changed edge entry points pass Deno 2.9.6 type checking. The release coordinator runs the full application, database, formatting, and lint checks after integration.

The admin UI corrections can arrive through GitHub/Lovable preview sync. The backend corrections require deployment of `build-silo-links`, `generate-pillar`, and `score-content-quality` with their shared modules; pushing GitHub alone does not establish that those managed functions changed. This package adds no migration and does not publish the website or enable any scheduler, inquiry email, or paid generation.
