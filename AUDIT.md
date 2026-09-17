# Independent verification update — September 17, 2026

The earlier report below describes generated changes, not a complete independent sign-off. The overall A–Z audit and member-ready release are **not complete**.

Direct-code repair verified locally:

- Published articles now render their rich content in the initial HTTP response. Browser-only DOMPurify caused server rendering to fail; all three public HTML renderers now share a DOM-free sanitizer with the crawler endpoint.
- JSON-LD is escaped for TanStack’s actual HTML script sink. A regression test renders that component with an injected closing-script payload.
- `/admin/login` is outside the protected admin route. The duplicate admin outlet is removed.
- Auth role state is bound to the current user. Tests cover stale session reads, user switching, rejected role reads, and late responses.
- Missing articles return visible not-found content with HTTP 404. Authenticated admin draft preview uses a separate query/cache key.
- Decorative intro/animation markup is deterministic and does not cover the no-JavaScript page. Cursor/grain honor reduced-motion and data-saving preferences.
- Mobile keyboard menu activation, Escape, and focus return were verified at 387px with no horizontal overflow.
- Public resource readers no longer select private niche context. CTA tracking uses the configured origin consistently during server and browser rendering.

Measured checks: 82 tests passed; frontend TypeScript passed; production build passed; changed crawler edge function passed Deno checking. HTTP checks passed for home, login, published article and missing article. Full lint still fails with **246 errors and 284 warnings** across the existing project; this is not a clean lint sign-off. No real emails, paid generation, publishing, subscriber creation, or production test articles were used.

Deployment: these direct changes require GitHub integration/merge and deployment. A code diff or local build does not prove the deployed backend function has updated. Brian’s Cloudflare Worker and custom-domain setup are unchanged.

Remaining verified issues (not signed off):

1. Newsletter delivery needs a frozen audience/content snapshot, durable receipts, explicit partial/uncertain states, pagination, and truthful failure handling. Current provider failures can still result in a `sent` state.
2. Confirmation/unsubscription need conditional atomic state transitions; subscription request parsing needs streaming byte limits and neutral responses.
3. Newsletter admin statuses and private sender/reply-to/postal settings need completion; the postal address is not configured.
4. Niche admin visibility and private-column access require scoped policy/RPC repair without exposing context to nonadmins.
5. Concurrent content claims/publishing need global budget serialization and claim ownership; quality gates need non-finite/malformed input rejection.
6. News search/lane and blog category filters must operate before pagination. Niche CSV import needs quoted-field parsing and validation.
7. Post scheduling needs explicit configured-timezone conversion and DST tests; partial post/SEO saves must not report success or duplicate retries.
8. Member backend prompts, links and fallback identity remain partly Brian/AI-specific. Public accent tokens, listing copy and infrastructure metadata are not fully configurable.
9. Fresh member setup needs a guarded, idempotent neutral bootstrap and accurate Cloud-remix/admin-account instructions. Historical migrations have missing baseline table creation; a fresh SQL replay is not verified.
10. Dependency advisories, the full backend Deno check, legacy lint errors, and CI’s npm-lock/undeclared-tsgo mismatch remain to fix.
11. Crawler protocol filtering and the remaining generated-resource/social link sinks need review beyond HTML-body sanitization.

The 13 saved Lovable follow-up requests are paused. Continue the work through direct code; do not resume those requests against these changes.

---

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
