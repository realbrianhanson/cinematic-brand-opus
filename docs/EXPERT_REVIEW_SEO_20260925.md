# SEO/AEO council review — 25 September 2026

Reviewed `/tmp/cinematic-council-20260925` from `711f704`, including the previous audit and focused public/backend reports. This review looked for additional failures rather than counting the previous repairs again. The SEO Audit and AI SEO skills were consulted; current recommendations below use official Google documentation, not the skills' unsupported numerical lift claims.

## The six strongest findings

### 1. High: missing pages redirect to the homepage instead of remaining missing

**Evidence:** At 06:31 UTC, a public GET to `https://brianhanson.com/council-missing-page-20260925` returned HTTP 302, `Location: /`. `src/lib/notFoundLookup.ts:97` manufactured the home destination after absent/malformed rules and even database failures. `src/lib/notFoundRedirect.server.ts` converted real HTML 404s to that result; the client component and crawler renderer did the same.

**Impact:** Visitors lose the context of the broken link. Crawlers receive an irrelevant destination; Google explicitly cautions that unrelated homepage redirects can be treated as soft 404s. This is a risk, not evidence of an existing Search Console soft-404 classification. [Google's redirect guidance](https://developers.google.com/search/docs/crawling-indexing/site-move-with-url-changes).

**Implemented locally:** Preserve the original 404 status and body unless a saved rule exists; still record missing paths and honor explicit internal/external redirects. The visible missing-page screen offers Resources and Home. Database failure/timeout does not consume the response body or invent a destination. Equivalent crawler-renderer change is staged and needs managed-function deployment.

### 2. High: resource pages claim editorial verification the system does not establish

**Evidence:** The live resource `/resources/ideas-use-cases/45-best-ai-for-solo-created-content-growth-in-2026` says “Last verified Jul 11, 2026” and that sources were reviewed. It also claims 65% production-time savings without an inline supporting citation. It has a list of eight general links, including social posts, rather than claim-to-source traceability. The statistic has not been independently disproved; its support is unclear. `src/pages/GeneratedPage.tsx:356` derived verification from `last_refreshed`; the author box even used `created_at`. The crawler renderer repeated these assurances. `refresh-stale-content/index.ts:163` can proceed with no research and later sets `last_refreshed` regardless.

**Implemented locally:** Label the stored event “Last refreshed”; remove automatic reviewed/live-research assurances and the creation-date-as-verification label from both renderers. Actual source links and author attribution remain.

**Additional refresh repair, staged:** The previous refresh endpoint updated by ID only, and the existing database quality trigger only gates the transition into published status (`20260705202218_995647ab-4ff6-4540-befd-6194d2755f48.sql:32`). Published resources now remain intact when substantive research with a usable source link is unavailable or when the replacement fails the existing 75/100 structural-quality threshold. A historical publishing override does not approve a new replacement. Saving requires the original `updated_at` and status to match atomically and must return a row; a conflict, deletion or database error produces a failed result, never a refreshed count or success log. Internal prompts and fallback metadata no longer describe provider output as independently verified. Explicit draft refreshes remain drafts. This guard requires deployment of `refresh-stale-content`; no generated content was changed during this review.

**Still required:** Store refresh proposals as revisions for human approval, keep the previous published version recoverable, add explicit research/review provenance, and connect numerical/product claims to primary evidence. A provider source link and a structural score are not factual verification. The new safeguards do not create an editorial approval workflow or certify historic claims. [Google's guidance on reliable content and explaining how it was made](https://developers.google.com/search/docs/fundamentals/creating-helpful-content).

**Unsupported source instruction corrected:** The refresh prompt also labeled a fixed list of tools, including Jasper and Copy.ai, as defunct/outdated. Their current official pages still describe available platforms, so this was not a defensible retirement rule. It now requires a current linked source for a retirement claim and does not treat absence from search results as evidence that a tool has closed. [Jasper platform](https://www.jasper.ai/platform), [Copy.ai platform](https://www.copy.ai/platform/powering-gtm-ai).

### 3. High: the search-decline detector manufactures trends from import order

**Evidence:** `check-content-freshness/index.ts:12–69` claimed two 14-day windows but split query rows by the midpoint `fetched_at`. `gsc-sync/index.ts:154` stores rolling 28-day aggregates without a date dimension. Executing the original detector locally with one imported row (10 clicks, position 4) falsely returned that page as declining with delta +10: previous position was invented as zero.

**Implemented locally:** Compare only actual adjacent, equal-duration stored reporting periods. Compare queries present in both periods, weight position by impressions, ignore missing baselines/overlap/malformed data/duplicate imports, and scope to the site's origin. Read history in bounded 1,000-row pages rather than silently relying on a request larger than the API cap. Read errors now fail rather than announcing everything is fresh. Ten comparison regressions and five endpoint regressions cover this behavior.

**Limits:** Imported query rows are not complete property totals; missing queries remain unknown. This repair cannot certify a snapshot whose import was interrupted (finding 4). It does not claim a ranking decline has actually happened on this site. A stronger measurement system stores daily observations or atomic completed period snapshots. Google's API groups by the requested dimensions and does not promise all query rows. [Search Analytics API](https://developers.google.com/webmaster-tools/v1/searchanalytics/query).

### 4. Medium: a failed Search Console import can replace a good snapshot with a partial one

**Evidence:** `supabase/functions/gsc-sync/index.ts:161–186` deletes the existing period, ignores the delete result, then inserts in 1,000-row chunks. Failure on a later chunk leaves an incomplete latest period; the dashboard reads the latest period without an import-completion marker. An empty API result cannot distinguish an imported zero from an unavailable run in the UI.

**Recommendation:** Stage each run with an ID and expected row count, activate it only after complete success, then retire the previous version transactionally. Store successful empty runs and failed-run metadata. Use an explicit configured GSC property, since the current hard-coded URL-prefix property cannot represent a Domain property such as `sc-domain:brianhanson.com`. This requires a deliberate backend/data migration and is not included in the local fixes. No production import was invoked.

### 5. Medium: the article archive has no crawlable path to page two

**Evidence:** The live blog's initial HTML contains 12 article links and no page/cursor links. `src/pages/Blog.tsx:408` exposes the new accessible Load more button, but it remains a JavaScript-only action. `src/routes/blog.index.tsx:10` only loads page one and supports category, not a page number. This is separate from the previously repaired accessibility issue. The XML sitemap does list the older posts, so this is not a claim they are completely undiscoverable.

**Recommendation:** Add server-rendered page-number URLs, anchor-based Next/Previous, and self-canonicals for page two onward, with optional Load more enhancement. Preserve category and reader position when returning from an article. Google's crawlers generally follow anchor hrefs rather than clicking Load more controls. [Google's pagination guidance](https://developers.google.com/search/docs/specialty/ecommerce/pagination-and-incremental-page-loading).

### 6. Medium opportunity: useful topic paths are too dependent on automatic keyword matching

**Evidence:** The current sitemap lists 350 articles, three topic guides and one generated resource. Many recent headlines are news reactions; the resource itself presents 45 mostly short ideas. The sampled Verizon article and the resource contain no topic-guide links in initial HTML. `src/pages/BlogPost.tsx:114–160` derives relationships through client queries and one-word niche matching; `PillarBanner.tsx:6` also fetches its relationship after loading. Existing guides do link to each other and selected articles, which is a sound foundation.

**Recommendation:** Give each priority buyer problem one maintained guide, several substantive implementation examples, a relevant resource and a specific offer. Store intentional article-to-guide/offer relationships and render the key links server-side. Expand the highest-value ideas with real inputs, outputs, time/cost, failure cases and Brian's approved examples. Do not mass-generate more variations or merge articles merely because titles look similar; confirm competing query intent in Search Console first. There is no verified cannibalization finding here.

## What is already working / limits

- Initial HTML for the sampled resource, guide and article already contains substantive text, canonical/metadata and multiple JSON-LD blocks (six, five and five respectively). There is no basis for recommending another generic “add schema” pass.
- The sitemap is paginated in code and contains 369 public URLs in this fresh fetch. Robots permits public crawling. Named AI-agent groups allow public access; access-control boundaries still depend on application authorization, not robots.txt.
- Google's AI Overviews/AI Mode do not require special AI files or special schema. Prioritize evidence, useful content, crawlable relationships and accurate measurement; do not promise a citation lift from `llms.txt`. [Official AI features guidance](https://developers.google.com/search/docs/appearance/ai-features).
- No Search Console account, authenticated production data, paid generation, order flow, full historical fact check, or real-user performance dataset was accessed by this subtask. It cannot establish index coverage, traffic loss, a ranking penalty or conversion lift.

## Local verification / delivery boundary

74 focused tests pass across seven files: missing-page server/client behavior and matching admin instructions, resource labels, search comparisons, the freshness endpoint and 15 mocked refresh-safety cases. Scoped lint has zero errors (existing edge-renderer `any` warnings remain), and Deno checking passes for all three changed edge entries. The coordinator's final integration checks cover full application typing and the complete test suite. No production records were changed and nothing was deployed by this subtask. Frontend/server-entry changes arrive in Lovable preview through GitHub; `render-page`, `check-content-freshness` and `refresh-stale-content` require separate managed-function deployment. No database migration is included.
