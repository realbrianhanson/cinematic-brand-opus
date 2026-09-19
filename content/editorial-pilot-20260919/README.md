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

## Production release evidence

- Implementation pushed as `897dca420943bce48c0e74a649b56cc862e92597`; GitHub CI run `35423372553` passed.
- Migration `20260919095000_editorial_metadata` applied and recorded before publication.
- Frontend deployment `937aa087-8320-479a-8174-ae9e351949d8` verified through the live custom domain's deployment header and image responses.
- Deployment-only Lovable operation successfully deployed all 34 names in its actual function deployment call. Its prose incorrectly counted 35. No runtime generation or email was invoked for QA. Cost reported: 0.9 Lovable credits. All 15 pre-existing queue items remained paused.
- The guarded ten-row pilot transaction was applied after image assets became available. Readback matched each reviewed title, body, excerpt, cover/alt, search title/description, and social image. Published states, URLs, and original publication dates were preserved.
- All ten live article URLs returned HTTP 200 with server-rendered article content and the exact reviewed search titles. All 20 cover/social image URLs returned successful image responses.
- Validation: 176 application tests; seven isolated database suites; frontend type checking; all 34 backend entrypoint type checks; lint (zero errors, existing warnings remain); formatting; production build.
- The deployment platform regenerated the Supabase types despite the deployment-only request. Inspection found only formatting and property-order changes; repository formatting was restored before the final documentation commit.

The new model orchestration and image review paths were regression-tested with mocks. Their deployment is confirmed, but no paid end-to-end generation was run as a release test. Ranking improvement cannot yet be measured from this release.
