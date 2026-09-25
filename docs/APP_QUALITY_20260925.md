# Application quality pass — September 25, 2026

## Scope and release status

This pass starts at `bd75611` on `codex/app-quality-20260925`, stacked on the First AI Build work. The [verification matrix](APP_QUALITY_MATRIX_20260925.md) accounts for 70 route modules, 20 admin navigation destinations, 13 widget types, six resource renderer types and 40 managed-function entry points. An inventory is not a claim that every state of every feature passed an end-to-end test.

The changes are frontend repairs and regression tests. No database migration, managed-function deployment, live publication, payment, newsletter delivery, password change, paid generation, or production test record was performed. The live site and Lovable's synced main were at `711f704` when checked. Earlier PRs #15 and #16 still require the outstanding main-merge approval; this branch does not bypass it.

## Repaired behavior

- **Editor work preservation:** protect unsaved settings, content formats, resources, guides and niches against navigation; do not replace dirty drafts with background refreshes. Handle news-item load races and deliberate discard correctly. Return errors when a settings/category mutation affects no row; preserve a category's existing URL when its display name changes.
- **Widget saves:** serialize changes to the same widget, prevent repeated visibility actions, keep failed drafts and Retry when switching zones, and address stalled write/refetch recovery. The [admin report](APP_QUALITY_ADMIN_20260925.md) records the final concurrency behavior and remaining backend atomicity limits.
- **Admin recovery:** distinguish failed generated-page loads from an empty library, correct pagination after deletion, and enforce generation batch limits in the actual action handler.
- **Customer access:** stop older payment/status requests from overwriting newer results, resume bounded polling after retry, and retain the original recovery token for a closed follow-up. A closed child checkout offers status/support; it does not promise a second order that the database prohibits.
- **Offer actions:** bound requests for checkout, access, recovery and download; retain server error messages and safe retry identities. Copy assistance can be cancelled and times out. Failed proof-library reads are visible and retryable. See the [funnel report](APP_QUALITY_FUNNELS_20260925.md).
- **Malformed service failures:** null or incorrectly shaped JSON error bodies retain a useful error and HTTP status, instead of throwing a second decoding error.
- **Public controls:** news search/topic selection survives Back and reload; failed news/blog pagination stops automatic retry loops and exposes a deliberate retry. Search/retry buttons now have the missing shared visual style and a minimum 44-pixel target.
- **Copy and browser recovery:** shared page-link copying announces failure and exposes a selectable link if clipboard access is denied or stalls for five seconds. Late results cannot announce success for another page. A blocked browser-storage API no longer throws while handling a stale deployed JavaScript chunk.
- **Newsletter confirmation evidence:** ten direct adapter tests cover pending-only confirmation, suppression states, repeated links, missing configuration, read/write failure, and a concurrent unsubscribe. These execute the app adapter against controlled database responses; they do not establish real email delivery.
- **Production preview:** the old command looked for a nonexistent `dist/server/server.js`, although the build generates a Cloudflare worker. A pinned Wrangler runtime and local-only launcher now run the actual build. The new GitHub smoke check verifies rendered sign-in controls and the compiled JavaScript asset, with bounded startup and process cleanup. The smoke supports macOS/Linux and fails explicitly before spawning on Windows.

## Verification evidence

The baseline had 2,083 passing tests across 182 files and a successful production build. During this pass all 26 isolated database suites passed, all 40 function entry points passed Deno checking, and Bun's lockfile advisory check reported no advisories. There were no database or managed-function code changes in this pass.

Final combined verification passed: **2,163 tests across 188 files** (80 additional tests), application typecheck, full ESLint (zero errors; 290 existing warnings), production build, repository-wide Prettier and whitespace checks. Focused red/green regression checks preceded the clipboard, news/filter and worker fixes. Independent code and TypeScript reviewers inspected the changes and their follow-up corrections; findings are not closed merely because mocked tests pass.

An independent database reviewer also verified the widget timestamp trigger and privileges against the live backend read-only, and exercised current/stale-version updates plus non-admin denial in isolated PostgreSQL. The conditional write protects against late requests; it does not detect another tab's edits made before the save's fresh version read. It introduces no schema changes.

The runtime smoke also passed on a build using CI placeholder values, both with the root `.env` present and temporarily absent (restored). The pinned preview dependency obeys the repository's release-age rule; the final lockfile advisory check reported no advisories. The production deployment target and ordinary build command remain unchanged.

## Browser evidence from this pass

Local frontend: `http://127.0.0.1:5186`, using public read-only data. Authenticated read-only admin checks: `https://brianhanson.com` on the currently deployed version, not this branch.

The final compiled Cloudflare worker was also browser-checked at `http://127.0.0.1:5190/news`: the server rendered 30 news items, then the hydrated Search control changed the URL to `?q=Databricks` and returned the matching article. This verifies production-runtime rendering and a real interactive query, separately from the development server.

| Journey                     | Observed outcome                                                                                                                 | Boundary                                                             |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Homepage testimonial image  | Opens enlarged screenshot; Escape closes the dialog                                                                              | No new testimonial publication                                       |
| Homepage quotation controls | Pause changes to Play; community disclosure expands                                                                              | Current configured content only                                      |
| News search                 | Databricks search returns matching item, URL contains query; topic changes URL; Back and reload retain the search                | Failed-request retries covered in controlled tests                   |
| News mobile navigation      | At nominal 390px, menu opens with focus on Close; Escape closes and returns focus to Open menu                                   | Chrome, not all browsers or assistive technologies                   |
| News narrow layout          | At nominal 320px, document and scroll widths both 317px; search target 48.5px tall                                               | Scrollbar accounts for the 3px difference                            |
| Shop search                 | No-match search reports zero and provides Clear filters; clearing restores three listings                                        | Inventory as observed during test                                    |
| PushTen offer               | Correct provided checkout URL, new-tab notice, `noopener noreferrer`; at 320px no horizontal overflow; CTA heights 72px and 52px | External purchase was not attempted                                  |
| Anonymous admin access      | `/admin` redirects to `/admin/login`; no admin content shown                                                                     | Session revocation/password exchange require dedicated test accounts |
| Sign-in controls            | Password visibility toggles; Forgot password opens the reset form                                                                | No credentials entered and no reset email sent                       |
| Admin command palette       | Search for new offer opens `/admin/offers/new`                                                                                   | Read-only navigation                                                 |
| Offer preview               | Phone toggle reflects selected state; Review shows missing required offer details                                                | No draft saved or published                                          |
| All 20 admin destinations   | Navigation and page headings inspected; no production mutations exercised                                                        | Render checks are not CRUD completion tests                          |
| Overview and audience       | Live overview/newsletter reads visibly fail; audience leaves counts unavailable and resend disabled                              | Confirmed backend prerequisite failure, not a passing feature        |

Public viewport overrides were reset after checking; the authenticated admin override was reset separately. Early viewport attempts targeted another active tab and were not counted as phone evidence until dimensions were measured on the intended page.

## Confirmed live blockers

Read-only metadata inspection reconfirmed that the shared backend lacks `admin_overview_snapshot`, `admin_page_view_counts`, `admin_newsletter_audience`, `newsletter_retry_failed_delivery`, and `newsletter_sends.last_error`. `admin_content_breakdown` exists. The exact reviewed migrations are:

1. `20260923140000_newsletter_truth.sql`
2. `20260923150000_admin_overview_truth.sql`

These change the shared backend immediately; a frontend preview cannot install them. The earlier independent migration review and [deployment runbook](DEPLOY_ADMIN_AUDIT.md) explain prerequisites, delivery-history correction, compatibility and post-deployment read checks. Reconcile that runbook with current migration history before applying anything. A frontend “Backend update pending” state improves diagnosis but cannot make those missing services operate.

## Remaining acceptance gates

1. **Release the approved frontend and separately reviewed backend changes**, then verify exact deployed versions and admin reads. Prior GitHub merge approval remains pending; no main merge or Lovable publication occurred in this pass.
2. **Provision a disposable integrated QA environment** with administrator and non-administrator test accounts. Exercise every CRUD/write family with reloads, two concurrent sessions, interrupted requests and real storage. Component mocks plus isolated SQL contracts do not prove deployed browser-to-database integration.
3. **Run commerce and delivery provider sandboxes:** native free/paid/external offers, test checkout, signed duplicate/out-of-order webhook, correct asset access, recovery email, follow-up accept/decline/expiration, and reconciliation. Do not report an accepted API request as delivered email or confirmed payment.
4. **Run a budgeted staging content job for each generator**, verify cancellation, duplicates, evidence/quality gates and provider failure. This pass incurred no generation charges.
5. **Complete cross-browser, screen-reader and performance/load checks.** This pass's browser interactions used Chrome. See the matrix for unexecuted states and existing source-level coverage.

Known longer-term work remains explicit: atomic widget reordering/private-plus-public settings writes, Search Console partial-import safety, coordinated planner measurement allowlists, and legacy-renderer parity for the new planner. These are not silently included in a claim of full completion.

The release bar is reproducible outcomes and recoverable failures. “Every feature works flawlessly” remains the target, not a guarantee established by one build or a passing test count.
