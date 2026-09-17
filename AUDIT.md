# Website audit and repair record — September 17, 2026

## Verified repairs

- **Rendering and navigation:** rich public HTML renders on the server; shared sanitization protects browser and crawler paths. JSON-LD is script-safe. Login has an independent route, the admin layout renders once, and auth tests cover stale sessions and role responses. Mobile navigation supports Escape and focus restoration.
- **Newsletter:** streaming request limits, neutral subscription responses, conditional confirmation/unsubscription, required sender/reply-to/postal configuration, frozen audience/content, durable provider receipts and suppression rechecks. Partial/ambiguous deliveries stop in `needs_review` instead of claiming success or blindly replaying. Admin status and preview/save errors are visible. Brian's supplied mailing address is saved only in his production settings.
- **Publishing:** global draft reservations include in-flight work; a claim starts once and stale workers cannot insert under a replacement claim. Scheduling atomically rechecks quality/facts and the rolling cap. Existing owner limits remain three daily / minimum quality 85. Post scheduling uses the selected IANA timezone and rejects ambiguous/nonexistent DST times. Post/SEO save errors are surfaced; SEO upserts have a unique post identity.
- **Admin/privacy:** complete settings and inactive/private niches are available through role-checked RPCs; anonymous and ordinary accounts do not gain private-column access. CSV niche import handles quoted fields/newlines and reports validation errors. Widget config is validated and rapid changes preserve pending fields.
- **Public content:** news search/lane and blog category filters run before pagination. An actual article beyond the first news page was found through the UI. Shared literal escaping prevents filter punctuation changing query meaning. Resource renderers tolerate malformed JSON; links are protocol-checked; clipboard success is shown only after copying succeeds.
- **News quality:** the importer requests validated structured output instead of treating citation/table lines as headlines. Historical recoverable table formatting and RSS entities are cleaned for display; rows without a recoverable headline receive a factual source-update label, not an invented headline. Stored public articles were not rewritten for this check.
- **Member template:** public identity, listing copy, brand colors and verification metadata are configurable. A green home-care member preset was rendered with no borrowed owner proof/links. Backend prompts use configured author identity; empty settings do not silently promote the owner's offer. The guarded neutral bootstrap refuses populated databases, leaves automation off and is idempotent. The guide accurately describes Cloud remix schema copying and explicit admin setup.
- **Final live findings:** public dates now use an explicit locale and UTC across news/articles/resources, fixing an observed server/browser hydration mismatch. News rewriting uses bounded source fetching and provider timeouts; mapped private IPv4 and link-local IPv6 literals are rejected.
- **Tooling:** reproducible Bun install, declared TypeScript checker, required lint/format checks, backend Deno checking and isolated database regression tests in CI. Vulnerable dependency versions were patched without a broad framework upgrade. Existing cron request timeouts were repaired without changing schedules, active flags, credentials or URLs; the repair is reproducible in a migration.

## Measured verification

- Frontend TypeScript: pass.
- Unit/rendering regressions: **143 tests, 24 files, pass**.
- Correctness lint: **zero errors**; existing Deno `any`/React hook warnings remain visible (283 warnings in the final measured run). Rules were not weakened to obtain a pass.
- Formatting: checked separately; generated output is excluded.
- Production build: pass.
- Backend: **all 34 edge entrypoints pass `deno check`**.
- Dependency audit: `bun audit --json` returns `{}` (no reported advisories).
- Isolated PostgreSQL fixtures: newsletter snapshot of **1,101 recipients**, suppression, durable receipts, leases, crash quarantine and stale previews; pipeline reservation/ownership/cap/90-minute spacing; anonymous/nonadmin denial and admin access; empty member setup/idempotency/populated-owner refusal; SEO retry and cron preservation tests pass.
- Read-only local HTTP: home, blog, news, resources, a published article, a published generated resource, login, sitemap, RSS and LLM feed return 200; an absent article returns 404. Sampled HTML pages contain one title and one canonical. Article/resource bodies are present before JavaScript.

## Release status

- [PR #1](https://github.com/realbrianhanson/cinematic-brand-opus/pull/1) is merged into `main` (`af371327`). GitHub-to-Lovable sync was verified by the reported source commit.
- All five September 17 migrations (`070000`, `071000`, `072000`, `073000`, `074000`) were applied together and recorded in migration history. Newsletter and private-configuration grants were read back; existing cron schedules and owner settings were preserved.
- All 34 backend functions were deployed; Cloud's function table independently showed fresh deployment times. A public crawler article returned 200 with a full article body and `nosniff`; the Supabase gateway applies its own sandbox/content-type headers.
- Frontend deployment `38e32a28-dbf1-41da-89ca-0251c5721502` was verified on brianhanson.com through its response deployment header. Home, blog, news, resources, login, sitemap, RSS, LLM feed and a generated resource returned 200; an absent article returned 404.
- Live browser checks verified search finds an article beyond the first page, one admin layout after reload, and complete admin settings including the saved newsletter address.
- Final implementation `63cd072` passes [all GitHub checks](https://github.com/realbrianhanson/cinematic-brand-opus/actions/runs/35194258064): build, TypeScript, lint, format, 143 tests, five database suites and 34 Deno entrypoints. Follow-up backend deployment completed. The deployment agent's prose incorrectly said 35 functions; its enumerated list and the source contain 34.
- **Final frontend follow-up is not published:** automated approval review rejected the second publish request because it required explicit production-publish approval. The live deployment above includes the main audit repair; the later public-date hydration fix is synced in GitHub/Lovable but awaits release. This is the remaining release decision.
- The attempted browser viewport override did not change the desktop viewport (client width equaled scroll width, 1508); it was reset. An isolated 390px frame measured 387px client/scroll width, with no horizontal overflow.
- Backend deployment required two narrowly scoped Lovable operations (2.6 credits total); code fixes were made directly in GitHub. Lovable automatically regenerated database types during deployment; these were retained and reformatted to satisfy CI.

## Limits and follow-through

- No real newsletter email, new subscriber, paid AI request, payment, or production test article was created for verification. Provider rejection/timeout/partial response paths are mocked; actual provider delivery remains unexercised. Automatic approval review rejected live POST authorization probes to avoid possible mail/generation side effects; they were not executed.
- The isolated member tests use schema fixtures. A brand-new Cloud remix was not provisioned. Historical migrations omit some original table creation, so a fresh standalone SQL replay is not advertised as supported.
- Old malformed news records that never contained a recoverable headline still merit editorial review; the importer now rejects that structure.
- The 13 old Lovable coding prompts remain paused. Direct GitHub changes replace that workflow. Brian's existing custom-domain Cloudflare Worker routing is preserved.

This is a measured audit, not a guarantee that every possible integration and future content payload is bug-free.
