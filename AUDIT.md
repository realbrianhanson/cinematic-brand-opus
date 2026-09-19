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
- **Final frontend published and verified:** after explicit owner approval, release `ad9c362` was published through Lovable as deployment `6da68c17-f744-41d6-87f8-a5fcb345bf0e`. The deployment header was verified on brianhanson.com across home, blog, news, resources, login, feeds and article/resource detail routes. The public-date repair is live; the current JavaScript asset is `index-14QoAOpR.js`, and the fresh browser load/search produced no application hydration error. [Release CI passed](https://github.com/realbrianhanson/cinematic-brand-opus/actions/runs/35194577062). No release approval remains outstanding.
- The published homepage was checked in a 390px iframe: 387px client width equaled scroll width, with no horizontal overflow. The mobile menu opened, Escape closed it, and focus returned to the Open menu button. Live search found the older matching article beyond the first page. Browser-extension session errors were excluded from application error results.
- Backend deployment required two narrowly scoped Lovable operations (2.6 credits total); code fixes were made directly in GitHub. Lovable automatically regenerated database types during deployment; these were retained and reformatted to satisfy CI.

## Limits and follow-through

- No real newsletter email, new subscriber, paid AI request, payment, or production test article was created for verification. Provider rejection/timeout/partial response paths are mocked; actual provider delivery remains unexercised. Automatic approval review rejected live POST authorization probes to avoid possible mail/generation side effects; they were not executed.
- The isolated member tests use schema fixtures. A brand-new Cloud remix was not provisioned. Historical migrations omit some original table creation, so a fresh standalone SQL replay is not advertised as supported.
- Old malformed news records that never contained a recoverable headline still merit editorial review; the importer now rejects that structure.
- The 13 old Lovable coding prompts remain paused. Direct GitHub changes replace that workflow. Brian's existing custom-domain Cloudflare Worker routing is preserved.

This is a measured audit, not a guarantee that every possible integration and future content payload is bug-free.

## Admin navigation follow-up — September 17, 2026

A user-reported live check reproduced `/admin/posts/new` displaying the posts list instead of the editor. The posts, content-types, pillars, and generated-page list routes were parent routes without outlets, swallowing their editor children. Converted the four lists to index routes so all seven new/edit destinations render directly under the protected admin layout. URLs remain unchanged.

The Generate sidebar link successfully opened `/admin/generate` during the live reproduction. Two completed-job links inside that screen still pointed to nonexistent `/admin/generated-pages`; both now target `/admin/pages`. Regression coverage uses the actual generated route tree to check all eight affected destinations, list URLs with/without trailing slashes, and every literal admin link in the admin components. No production content or generation jobs were created for this check.

Released source `cc703e7089dd0ee5ed497960af270f73cb1b9f36` through Lovable deployment `2997a1c1-6940-4f5b-a302-2db3a4563c49`, confirmed by the live custom-domain response header. Authenticated live checks passed for both sidebar/dashboard New Post links, existing post Edit, new Content Type, new Pillar, generated-page Edit JSON, and the Generate screen. No new application console errors appeared (the existing browser-extension session error is unrelated). All 156 unit tests, TypeScript, production build, and full GitHub CI passed: <https://github.com/realbrianhanson/cinematic-brand-opus/actions/runs/35195326855>. Lint remains at 0 errors and 283 existing warnings.

## September 19 completion release

- Reworked admin navigation, post search/filter/pagination, dashboard loading/error
  states, recent-edit links, refresh outcomes and IndexNow receipts. Performance
  reports distinguish lifetime totals, selected periods and stale Search Console data.
- Added separate recoverable working copies, optimistic article save conflicts,
  revision history, mobile/desktop previews and editorial review guidance. Fixed a
  reproduced Tiptap mount/unmount crash when opening New Post; the regression test
  mounts the actual editor under React StrictMode.
- Added a guided Site setup wizard for member identity, niche, logo/favicon, colors,
  author and offer. Public SSR metadata uses the same request-scoped configuration.
  Neutral member setup removes owner-specific proof without changing private secrets.
- Added searchable resource discovery, article contents/source/author sections and
  three linked topic guides. Revised ten existing articles using primary sources,
  preserving their URLs/publication dates and clearing superseded fact-check results.
- Applied and recorded five additive migrations (20260919090000–20260919094000).
  Read back private RPC restrictions and published-library aggregates in production.
- Verification: 171 tests in 29 files; six isolated database suites; frontend
  TypeScript; formatting; production build; all 34 Deno entrypoints pass. Lint has
  zero errors and 281 existing warnings. Dependency audit reports no advisories.
- Actual email delivery, paid AI generation and a fresh Cloud remix were not run for
  QA. Ten articles received source review; this does not imply every historical
  article was fact-checked. The 15 queued Lovable prompts remain paused and preserved.
- Release publication evidence is recorded below after GitHub sync and deployment.

### Completion release publication evidence

Implementation `577e18a9cc4cceadde802112954c4942ed7067ed` passed the complete
[GitHub workflow](https://github.com/realbrianhanson/cinematic-brand-opus/actions/runs/35421335602),
and Lovable reported that exact synced commit. Frontend deployment
`9b4ddcf6-9357-4c96-bcfa-e4eb2875d38b` is verified by the custom-domain response
header. Home, blog (following its normal redirect), news, resources, login, all
three guides, sitemap, RSS, LLM feed and favicon respond successfully; an absent
article returns 404. Sampled public pages have one canonical and route-specific titles.

Authenticated live checks passed for dashboard totals, New Post, article Preview,
Generate, existing article Edit and revision entries, Performance RPCs and all
three Site setup steps. No settings or test articles were saved. Resource search
returns the revised Shopify article. Browser error inspection found only a
browser-extension session error, not an application error. The local 390px mobile
homepage has equal client/scroll width (387px), without horizontal overflow.

The deployment-only Lovable operation deployed `submit-indexnow` and its helpers
for 0.6 credits. Cloud independently shows a fresh deployment time and the 15 old
queued prompts remain paused. Lovable automatically regenerated database types
(despite the no-edit request); these were inspected, retained and formatted, and
the frontend typecheck passes. This reconciliation changes types/documentation
only, without changing the verified runtime implementation.

## September 19 editorial generation release

Implemented shared reader-question briefs, six article formats, source-passage retrieval, recent-title comparison, three candidate headline pairs, relevant unused author notes, and topic-specific image composition with vision review. Removed blog word-count/year/FAQ penalties and the misleading admin score display. Search metadata joins the factual claim review; repaired fact-remediation's invalid SEO-column read. Image alt text is reviewed after generation and editable/recoverable in the admin.

A ten-article pilot adds prompts, examples, comparison tables, and ten original explanatory illustrations. URLs and original publication dates are preserved. The exact revisions and guarded transaction are in `content/editorial-pilot-20260919/`. Facts are primary-source reviewed; illustrations and worked data are labeled, not presented as firsthand tests.

Validation: 176 application tests in 30 suites; six existing database suites plus the new pilot transaction/rollback suite; frontend typecheck; all 34 Deno entrypoints; formatting; build; lint 0 errors (290 warnings). The new migration was applied and read back; no email or paid generation was invoked for QA. Actual release verification follows after deployment.

## September 19 homepage design and copy refresh

Owner-authorized homepage refresh, retaining `/videos/hero-bg.mp4` and its existing poster. The hero now leads with a practical business benefit and shorter copy; both calls to action fit the checked laptop viewport (1511×769) and the 390px phone layout. Removed the scroll-driven hero fade and empty avatar placeholders. Proof is static and readable, with community membership described consistently; removed the ambiguous revenue total and unnamed testimonial from the live preset.

Moved the free event before the condensed three-part story, added concrete workflow examples and three configured guide links, improved small-text contrast, and reduced section/divider spacing. Preserved the speaking portrait and added on-demand playback of the existing event video. The inquiry form creates an explicitly unsent email draft addressed to the configured recipient, with a copy fallback; it does not create a new delivery service or claim to send messages. External member booking links remain supported. Featured resources are optional and absent from the neutral member preset.

Code and security review covered the new inquiry path. Fixed review findings in navigation configuration and encoded email-recipient handling. Validation includes the full application suite, five focused inquiry regressions, member rendering, TypeScript, lint, formatting, production build, and actual server-rendered homepage content/order. Browser review checked desktop and phone layout, retained video, both hero actions, and speaking navigation. No production email or subscription was sent for QA. Deployment evidence is captured in the task's final release checks.

## September 19 authority, Shop, and admin upgrade

### Delivered behavior

- Preserved Brian's `/videos/hero-bg.mp4` hero video, added pause/resume controls, strengthened product and event paths, and removed the blocking intro, custom cursor, and animated film-grain canvas from the homepage composition. Real testimonials and a portrait-led story provide the proof; no reference-site metrics or testimonials were copied.
- Added featured homepage Shop listings, consistent product cards with original fallback artwork, clearer offer-page actions, safe plain-text heading/bullet formatting, and related public offers. Owner product copy remains separate from member defaults. Native checkout, external destinations, and affiliate disclosures remain distinct.
- Moved the full speaking form to `/speaking` and added a private admin inquiry inbox. The new bounded, rate-limited submission endpoint stores inquiries with retry protection; only administrators can read them or change status/notes. Intake defaults off for member installations. Brian's intake is now enabled after migration and function deployment. No automatic inquiry email is sent.
- Reworked the admin overview around exact content, subscriber, Shop, order, and inquiry counts; added attention links, grouped navigation, Cmd/Ctrl+K commands, and article/offer creation shortcuts. Offer tabs retain their state in the URL. Queue controls report saved automation state and distinguish skipped work, partial failures, and actual publication success.
- The final crawl follow-up also protects copied inquiry records in member bootstrap checks. See [Authority upgrade](./docs/AUTHORITY_UPGRADE.md), [Speaking inquiries](./docs/SPEAKING_INQUIRIES.md), and [Offers setup](./docs/OFFERS_SETUP.md) for operation and limitations. Canonical Mobbin design references are recorded in the authority guide.

### Verification and crawl findings

- **329 tests in 51 files pass**, with TypeScript, formatting, production build, changed-backend Deno checks, and all **nine isolated database suites** passing.
- ESLint reports **zero errors and 290 existing warnings**. The dependency audit reports **zero advisories**; lint rules were not relaxed.
- **Fourteen isolated admin journeys** pass. Read-only live checks covered the homepage, Shop, speaking page, and authenticated admin across 1440px desktop and 390px/320px phone layouts.
- A **351-page public crawl** found three defects: a resource-category route using the wrong parameter and returning 500, missing server-rendered metadata on the HTML sitemap, and a duplicate legacy article H1. Follow-up source `7dd07074dd5f444a83592b91261e035c9cd1bc26` corrects these paths and adds regressions. The confirming published recrawl passed **351 of 351 pages** at `2026-09-19T08:07:43.767Z`, with `failures: []` and `duplicateTitles: []`, on release `529cab4` (`/tmp/authority-live-crawl-report.json`).
- The final-deployment Shop browser rerun passed at 390px and 1440px for both real products, search/filter behavior, and exact outbound destinations. It recorded **zero page errors and zero order API calls** (`/tmp/external-shop-production-qa-report.json`).
- Production readback verified the inquiry migration, deployed intake, and Brian-only activation. The database contained **zero inquiries and zero orders** at that check. No production test inquiries, leads, subscribers, orders, payments, or outbound emails were created.

### Publication evidence

- The initial authority frontend, source `e1895e7`, is live on deployment `a75247b7-7b11-4912-acac-0a356eeb837c`.
- The speaking migration was applied and the submission function deployed before enabling Brian's intake. The narrowly scoped backend deployment used **0.4 Lovable credits**.
- Follow-up source `7dd07074dd5f444a83592b91261e035c9cd1bc26` is pushed. Its `render-page` crawler function is deployed: operation `umsg_01m2wayrk1epbtekpx8je9ex5j` reports a completed nested deployment, with receipt `43b777fedac1118f64215379f1e17cfeb233ca72`. This deployment-only operation used **0.8 credits**, bringing this upgrade's backend deployment total to **1.2 credits**.
- Final release source `529cab4a79dae02caf8b63b4a2ac29ea1da95c0b` contains the follow-up fixes and normalized Lovable-generated database types. Frontend deployment `8fb599cc-64bf-4245-b88b-02856958139e` is verified by the live custom-domain GET response header.
- A direct GET to the deployed `render-page` function for `/blog/rank-higher-in-2026-ai-seo-for-small-businesses` returns 200, the proper article title, and exactly one H1.
- Final [release CI](https://github.com/realbrianhanson/cinematic-brand-opus/actions/runs/35431065671) **passed every step**, including TypeScript, formatting, lint, 329 application tests, nine database suites, Deno checks, and the production build. The confirming 351-page live recrawl also passed. This release is published and the checks recorded above are complete.

Stripe keys intentionally remain unconfigured, so paid native checkout remains unavailable. External purchases and affiliate commissions are not included in website order counts. Inquiry notifications are manual through the private inbox. These measured checks do not establish guaranteed rankings, conversions, revenue, or freedom from every possible future defect.
