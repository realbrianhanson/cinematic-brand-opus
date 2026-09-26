# Remaining quality and conversion work

Authorized by Brian on September 25, 2026: complete the remaining defects and polish identified after PR19. Starting source: `7b35d6268b0191c1a9155695dfeedb7e89618749`. Deliver source and backend repairs through GitHub/Lovable preview. Existing public-frontend publication boundary remains unchanged.

## Delivery checklist

- [ ] News concurrency protection, including generated updates and preserved local drafts.
- [ ] Media deletion accounts for guide/resource history.
- [ ] Bounded cancellable product uploads and accessible media dialogs with stale-result protection.
- [ ] Unsaved testimonial/speaking notes and edits made during Expert Notes saves survive correctly.
- [ ] Generation dispatch errors immediately surface; failed reads preserve known jobs.
- [ ] Resource-category error recovery and pagination.
- [ ] Readable resources, one shareable contents navigation, clean printed worksheets.
- [ ] Consent-aware upsell step measurement and revenue reporting.
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
