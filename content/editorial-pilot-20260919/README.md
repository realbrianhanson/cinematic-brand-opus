# Editorial generator and ten-article pilot

September 19, 2026. Owner-authorized editorial improvement, preserving existing article URLs, statuses, and original publication dates.

## Generation changes

- Both blog entrypoints use the same reader-question brief, six task-dependent formats, candidate headline selection, recent-article history, and honest-evidence policy.
- Scheduled writing retrieves bounded source passages before drafting; inaccessible sources cannot support the article. Manual generation without retrieved evidence produces a labeled proposal flagged for editorial review.
- Planner favors useful evergreen workflows and comparisons, with news analysis when warranted. The 60/25/15 portfolio is guidance, not a quota or an SEO claim.
- Relevant unused author notes replace the old arbitrary newest-note fallback. No invented personal experience; repeated catchphrases and boilerplate sections are discouraged.
- Blog readiness no longer rewards 800 words, years in titles, or FAQ counts. Fact checking still runs independently and now includes search metadata. A score is not proof of factual quality or ranking potential.
- Cover generation chooses an underrepresented composition family using recent image history. One generation is followed by one vision review against up to three recent covers. Rejected/unreviewed images are not uploaded; no paid retry loop. Alt text comes from the finished pixels. This adds one configured model review call per generated cover.
- Saved editorial metadata retains the brief, title candidates, source URLs, visual concept, and review warnings. The admin shows the brief and permits editing the actual image description. Metadata assistance no longer encourages padding or arbitrary character quotas.

## Pilot

`articles.json` contains the ten reviewed revisions. Five replace weak news-to-business claims with bounded workflows; five expand recently corrected guides with task-specific prompts and decision aids. Fictional examples are labeled; the event arithmetic and spreadsheet totals were checked. Existing URLs remain unchanged.

Ten original diagrams have different subjects and compositions. SVG sources remain in `public/editorial`; WebP covers and PNG social images are rasterized from these authored diagrams. They are explicitly illustrations, not product screenshots or evidence of tests. Three diagrams also explain workflows inside article bodies. This pilot does not impose a diagram-only style on future generation.

Product facts were reviewed against the exact primary sources in each article on September 19, 2026. Source facts are distinguished from proposed workflows and hypothetical examples. No generated sales/revenue guarantees, invented tests, or fabricated case studies.

`apply.sql` locks the ten existing rows and refuses to apply if their exact previous `updated_at` values or published states have changed. It updates article fields and matching SEO rows in one transaction. Publish the image assets before running it. Revision history and a pre-release local snapshot preserve the earlier articles. Superseded embeddings and fact-check results are cleared rather than represented as evidence for new copy.

This artifact is specific to Brian's installation. Do not replay it against member remixes. The reusable generator uses configured identity and existing content; the member bootstrap stays neutral.

## Validation and measurement

Regression tests cover title selection, source retrieval failure/deduplication, optional article formatting, visual rotation, and rejecting unreviewed images. Frontend and Deno type checks, all application tests, database suites, lint, and production build are run before release. The pilot uses manually authored content and diagrams; live paid generation and real email delivery are not QA steps.

Use the September 14 Search Console import (August 17–September 13: 298 impressions, 2 clicks in imported rows) as a limited baseline. Track each URL's impressions, clicks, engagement, and qualified next-step actions over comparable periods; do not claim causation from this small sample. No automated monitoring was created.
