# Approved release and remaining polish — September 25, 2026

Brian approved merging PRs15,16,17 and the remaining reliability, funnel, measurement and polish work. Frontend publication remains separate from the established preview delivery boundary.

## Delivery record

- PR15 merged as `a33a322`; PR16 as `4492aa9`; PR17 as `b11e54c` after confirming each exact head's successful GitHub check. Lovable exact sync at `b11e54c` was verified.
- Applied reviewed newsletter truth (`20260923140000`), admin overview (`20260923150000`) and resources/guides (`20260923152000`) migrations in separate transactions, recording their exact source and version atomically. Live Overview and Audience reads work; relevant RPC grants were checked.
- Applied reviewed atomic admin (`20260925100000`), staged Search Console import (`20260925101000`) and First AI Build measurement (`20260925110000`) migrations. Verified history, new fields and service-only event/import write boundaries. An uncertain first measurement response was checked against history/schema before retry; the successful retry is recorded once.
- Applied the reviewed checkout-recovery migration (`20260925120000`) after generic financial review and a separate database review. Existing orders retain their original snapshots; native payment configuration is still absent.
- Resend shows `m.brianhanson.com` verified. The historical W39 provider rejection is not a current domain-verification failure. No subscriber messages were sent or retried.

## Implemented in this change set

- Whole-page copy context: ordered sections, FAQs, CTA/microcopy and protected terms, plus server-verified preceding offer details for upsells. Missing/ambiguous/truncated inventories are explicit. Suggestions still require deliberate application and stale outputs cannot replace newer edits.
- All-or-nothing settings saves with version conflicts; atomic neighboring-widget reorder, including tied sort values.
- Search Console property configuration, staged imports and atomic activation. Incomplete/failed runs retain the last complete dataset; empty successful imports are distinguished from no import. Provider/config reads have deadlines and malformed dimensions are rejected.
- Consent-gated giveaway actions across browser, endpoint, database and dashboard. Only fixed action/project labels are recorded, not business inputs or generated prompts. Overlapping session counts are not presented as a sequential funnel or sales.
- Crawlable blog archive pages, category-preserving canonical/previous/next URLs and later-page404s; stored guide/resource relationships in initial HTML. The optional related-resource lookup has a deadline and prototype-like content type slugs cannot crash grouping.
- Device-only crash recovery for guide, resource and news editors, explicit Restore/Discard and changed-revision protection. Independent review required separate concurrent-editor slots before release; see the recovery report.
- A matched PushTen participant example using the existing attributed Susie quote; the shop appears before the full testimonial wall. Member presets and sites without that offer/source do not inherit the example.
- Controlled explicit recovery of expired follow-up checkout, with immutable order details, fresh provider verification, numbered attempts, original-window limits and stale-webhook protection. See the checkout report for release order and exclusions.

## Verification record

Final combined run passed 2266 tests in 196 files. All 28 aggregate isolated database suites passed; the new checkout suite also passed independently and is included as suite 29. Typecheck, full lint (0 errors / 285 warnings), formatting, production build, production-worker smoke check and all 40 managed-function Deno checks passed. Concurrent-backup regressions are included in the final test count.

Browser checks used the real compiled production worker against read-only existing public content. At390px and320px, planner generation, tailored output, copy confirmation, edit-answer retention, homepage layout and navigation worked with no horizontal overflow on checked pages. Escape dismissed the mobile menu and returned focus. The download button showed its started state, but the browser automation download event timed out; file completion is not independently certified. Blog page2 rendered twelve older articles and pagination. Browser inspection caught quoted numeric pagination parameters produced by the router compatibility component; previous/next archive links now use native anchors preserving the canonical URL. The local development server had a stale dependency-module hydration error; the compiled worker did not reproduce it.

These are specific checks, not certification that every browser/device/provider path is flawless.

## Work still requiring separate evidence or configuration

- Native Stripe secret and webhook configuration are absent. A confirmed isolated backend with test keys and isolated recipients is required for real purchase/webhook/access-email/refund verification and destructive authenticated CRUD/storage tests. A preview is not an isolated database. No real payments or emails were used to make QA pass.
- One-time offers and guarded follow-up checkout remain the implemented native commerce path. Native order bumps, one-click charges, downsells, subscriptions and controlled experiments require actual offer/provider choices; they are not claimed as delivered by this reliability release.
- Historic editorial flags require claim-to-source review.104 published articles are flagged for contradictory fact-check results; that is a review queue, not proof that all104 are false. Human review/revision provenance for generated resources remains a separate editorial workflow improvement. Existing source links and truthful refreshed timestamps remain in place.
- Wider browser/assistive-technology coverage, field performance budgets and paid AI output evaluation remain unverified. Local automation does not prove live external integrations or copy quality.
- The optional offer-access retry schedule is not enabled because it could send historical queued customer email. Optional Jev automation, credentials/auth changes and public frontend publication are also outside this release's executed actions.

Keep edited source, GitHub merge, Lovable preview sync, backend deployment and public frontend publication distinct.
