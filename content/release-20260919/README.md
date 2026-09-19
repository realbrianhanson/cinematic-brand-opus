# Editorial release — September 19, 2026

Ten reviewed article revisions and three topic guides. Existing article URLs are preserved. These are proposed implementation workflows, not firsthand product tests or promises of measured business results. Product descriptions and cited facts were checked against the primary sources linked in each article. Unsupported claims, invented experience, misleading percentage interpretations, and broken nested offer links were removed. The site-wide configured CTA supplies the next step.

The JSON files are reviewable source artifacts. They are not imported automatically, are not part of member bootstrap, and must never be replayed against a member installation. The deployment transaction checks each existing article's exact `updated_at` before editing and refuses collisions on guide slugs. Database revision history preserves before-images. The original full published snapshots were also saved locally before editing.

Old automated fact-check results are cleared because they describe superseded text; this release does not fabricate machine scores. The next scheduled quality review can assess the new text. Existing publication dates, slugs, images, and status remain intact.

Sources: Shopify help for Sidekick/Flow; Google Gemini Live help; Formas Cartesian; Capsule; WebLLM; Salesforce content-marketing guidance; Anthropic's small-business announcement and sales-workflow session; Google Search documentation; Walmart's Q4 FY26 earnings transcript. Links and precise revised claims are recorded in `articles.json` and `guides.json`.
