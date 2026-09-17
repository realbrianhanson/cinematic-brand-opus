# Audit — publishing reliability and hardening (Batch 5)

Scope: publish gate and automated content runs, public feeds, outbound URL
fetching, lint/format separation, reproducible checks. No frontend was
published, no email was sent, no paid AI generation ran, and no published
content record was modified during verification.

## 1. Publish gate and automated runs

| Defect found | Status | Where |
| --- | --- | --- |
| `loadGateSettings` defaulted `auto_publish_enabled` to `true` when the settings row was missing | Fixed — fails closed (`false`, cap `0`) | `supabase/functions/_shared/publishGate.ts` |
| A settings **query error** silently produced permissive defaults | Fixed — the error is thrown; callers return 503 | `publishGate.ts`, `auto-publish-gate`, `manual-publish`, `daily-content-run` |
| Daily-cap count treated a DB failure as `0` published today | Fixed — a count error is a gate failure ("daily cap check failed") | `publishGate.ts` |
| `NaN` fact-check comparisons passed the gate when counts were absent or non-numeric | Fixed — counts must be finite numbers, otherwise the post is held | `publishGate.ts` |
| Cap check used `dailyCap + 1` and could then still generate `maxDrafts` more | Fixed — the remaining budget is computed atomically and bounds the batch | `daily-content-run`, RPC `content_claim_opportunities` |
| Overlapping runs selected the same queue rows (duplicate drafts) | Fixed — `FOR UPDATE SKIP LOCKED` claim marks rows `drafting`, increments `attempts`, stamps `last_attempt_at`; stale claims older than 10 minutes are reclaimed | RPC `content_claim_opportunities` / `content_claim_opportunity` |
| `draft-from-opportunity` could be invoked twice for one opportunity | Fixed — single-row atomic claim; a second caller gets `409 already being drafted` | `draft-from-opportunity` |
| `publish-scheduled-posts` published on schedule alone, ignoring current gate conditions | Fixed — it re-evaluates the gate per post, honours `publish_override`, and updates conditionally on `status = 'scheduled'` | `publish-scheduled-posts` |
| Status updates ignored errors | Fixed — held/failed posts are reported; HTTP 207 when any update failed | `publish-scheduled-posts`, `auto-publish-gate`, `manual-publish` |

Notes:

- `publish-scheduled-posts` evaluates with `ignoreDailyCap: true`. The daily
  budget is consumed when a draft is **scheduled** by `auto-publish-gate`;
  re-charging it at release time would strand already-approved posts. Quality,
  lint and fact-check conditions are still enforced at release.
- Brian's live values were preserved exactly: `auto_publish_enabled = true`,
  `auto_publish_daily_cap = 3`, `auto_publish_min_quality = 85`.
- The two claim RPCs are `SECURITY DEFINER` with `EXECUTE` granted to
  `service_role` only (revoked from `PUBLIC`, `anon`, `authenticated`).
- The migration only adds functions; no column was dropped and no row rewritten.

## 2. Feeds, URL safety, settings isolation

| Defect found | Status | Where |
| --- | --- | --- |
| Sitemap/LLM feeds swallowed query errors and could serve a truncated or empty feed | Fixed — read errors throw with a labelled message | `src/lib/feeds.server.ts` |
| Feeds paginated neither posts nor generated pages (1000-row Data API cap) | Fixed — `fetchAllRows` pages with `.range()` until a short page | `feeds.server.ts` |
| RSS ordered and dated items by `created_at` | Fixed — uses `published_at` with `created_at` fallback | `feeds.server.ts` |
| RSS `<author>` contained a bare name, which is invalid (it expects an email) | Fixed — emits `<dc:creator>` with the `xmlns:dc` namespace | `feeds.server.ts` |
| Operator-supplied RSS source URLs were fetched with no scheme/host/size/redirect protection | Fixed — `fetchTextBounded` (https-only by default, private/loopback/link-local/metadata hosts blocked, credentials and non-standard ports rejected, 12s timeout, 2 MB cap, redirects revalidated per hop) | `_shared/safeFetch.ts`, `poll-sources` |
| `ogImage.tryDirect` fetched an arbitrary remote article URL with `redirect: "follow"` and no size guard | Fixed — routed through `fetchTextBounded` (200 KB cap, html content type) and the page URL is validated first | `_shared/ogImage.ts` |
| A scraped page could plant a non-http (`javascript:`, internal host) image URL in the database | Fixed — resolved image URLs must be public http(s) or they are skipped | `_shared/ogImage.ts` |
| Remix settings could fall back to Brian's identity | Verified — `feeds.server.ts` throws on a `site_settings` read error rather than substituting defaults; presets carry no borrowed proof (`src/config/__tests__/presets.test.tsx`) | `feeds.server.ts`, `src/config/` |

Not changed deliberately: `is_admin(uuid)` and `validate_link_click()` remain
`SECURITY DEFINER` and executable by `anon`. Public read policies call
`is_admin`, and revoking it previously broke the public site. The database
linter flags both; the flags are accepted.

## 3. Checks

Reproducible entry points:

- `npm run typecheck` — `tsgo --noEmit`
- `npm run format:check` — Prettier only
- `npm run lint` — ESLint with `prettier/prettier` disabled, so it reports code
  problems rather than whitespace
- `npm run test` — Vitest
- `npm run verify` — all three
- `.github/workflows/verify.yml` — the same steps plus a production build

Results at the time of writing:

- Typecheck: clean.
- Tests: **77 passed** across 10 files, including the new
  `publishGate.test.ts` (9), `safeFetch.test.ts` (10) and `feeds.test.ts` (3),
  plus the existing security (`newsRequest`, `newsMarkdown`), newsletter,
  SSR head, router and rebrand-preset suites.
- Correctness lint: 246 errors / 283 warnings remain, effectively all
  `@typescript-eslint/no-explicit-any` in pre-existing code, plus 3
  `no-useless-escape` and 2 `no-empty` inside edge functions. React hook rules
  report **zero** errors. No rule was disabled globally to reach this state;
  `no-explicit-any` is a warning **only** under `supabase/functions/**`, where
  untyped third-party JSON payloads dominate, so its volume cannot mask real
  errors in `src/`. Lint and format steps in CI are non-blocking until that
  pre-existing backlog is cleared; tests, typecheck and build are blocking.
- Formatting: a large pre-existing Prettier diff exists across the repository.
  Run `npm run format` to normalise it in a dedicated commit; it was not mixed
  into these correctness changes.

## 4. Limitations and remaining external tasks

- `npm run build` fails when the checkout path contains an apostrophe (a
  TanStack/Nitro code-generation limitation). See README.md.
- The unauthenticated/draft denial checks for `generate-news-article` were
  proven against the live function, not in CI.
- Admin-triggered news generation is reachable only through `poll-sources` and
  cron; there is no editor button.
- `site_settings.newsletter_postal_address` is still empty. Bulk email
  compliance in several jurisdictions expects a postal address; set it in
  Admin > Settings before enabling the weekly digest.
- Publishing the frontend, submitting the sitemap in Search Console, and
  Cloudflare Worker changes remain manual, outside this repository.
- Members must never replay the cron-scheduling migrations against a shared
  backend; see PUSH_TEN_SETUP.md.
