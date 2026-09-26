# Remaining quality and conversion work

Authorized by Brian on September 25, 2026: complete the remaining defects and polish identified after PR19. Starting source: `7b35d6268b0191c1a9155695dfeedb7e89618749`. Deliver source and backend repairs through GitHub/Lovable preview. Existing public-frontend publication boundary remains unchanged.

## Delivery checklist

- [x] News concurrency protection, including generated updates and preserved local drafts.
- [x] Media deletion accounts for guide/resource history.
- [x] Bounded cancellable product uploads and accessible media dialogs with stale-result protection.
- [x] Unsaved testimonial/speaking notes and edits made during Expert Notes saves survive correctly.
- [x] Generation dispatch errors immediately surface; failed reads preserve known jobs.
- [x] Resource-category error recovery and pagination.
- [x] Readable resources, one shareable contents navigation, clean printed worksheets.
- [x] Consent-aware upsell step measurement and revenue reporting.
- [ ] Verify external checkout provider/account integration options; implement verified callback reconciliation where credentials and provider contracts permit.
- [ ] Design and implement native commerce improvements against actual payment/provider contracts; do not expose unsupported purchase behavior.
- [ ] Review the 104 currently flagged published articles against their supplied sources; preserve evidence and distinguish uncertain checks from proven errors.
- [ ] Resolve historical uncertain access-email outcome through provider evidence; do not blindly resend.
- [ ] Isolated purchase/webhook/email/refund validation, where test credentials and recipients exist.
- [ ] Broader browser/keyboard verification, independent reviews, CI, merge, preview sync and backend deployment.

## Constraints and evidence

- Public giveaway route still redirects to the homepage until frontend publication; the giveaway works in the current preview.
- Latest read-only database check: 104 published posts with contradicted claims; one pending offer email with an uncertain prior attempt.
- Native Stripe secret/webhook credentials and an isolated provider test environment were absent in the preceding release. Available integrations are not evidence of configured credentials.
- No real customer messages, financial transactions or paid generation solely for QA. No blind retry of uncertain side effects.
- Workers own disjoint files and run bounded regression checks. Release completion and any genuine configuration blockers will be recorded here.

## Reviewed implementation

Commits through `803661d` include all eight repair groups above. Independent TypeScript, general code, and PostgreSQL reviews found issues in upload cancellation, dynamic contents links, uncertain note retries, historical follow-up measurement, and old reporting denominators; those issues were fixed and regression-tested. The two SQL migrations are `20260925150000_news_concurrency.sql` and `20260925160000_offer_journey_measurement.sql`.

Local validation: 2,348 tests across 209 files passed; the production build, production-worker smoke check, TypeScript, ESLint (zero errors; 286 existing warnings), all edge-function type checks, and formatting passed. The phone-sized browser check confirmed working resource filters, shareable contents links after filtering, no horizontal overflow, and separate chat/Summit controls after resizing. This is not an assertion that every provider/browser combination was tested.

Backend release targets: `generate-news-article`, `generate-content`, `render-page`, `conversion-events`, `offers-api`, and `offer-stripe-webhook` (shared offer response dependency). Apply both migrations before deploying functions. No public frontend publication, provider transactions, customer messages, or retry cron is part of this release.

External checkout inspection confirmed that the PushTen page uses HighLevel/LeadConnector and Stripe and advertises an annual $997 subscription. Provider account access, webhook subscription, exact product mapping, and a configured isolated Stripe test environment have not been established. Existing verified-export import works without those credentials. One-click charges, recurring billing, and order bumps require their own payment/account contracts and transaction validation before activation; they are not marked delivered by this repair release.

The historical September 20 access email remains uncertain. Automatic approval review blocked private Resend dashboard access because it may expose recipient/message information. A targeted permission question is pending; no resend was attempted.

An item-by-item private editorial review is in progress for the 104 articles/151 flagged claims. Source flags have not been cleared automatically and no published articles have been rewritten by the repair release.
