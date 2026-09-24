# Deploy runbook: admin audit fixes (PRs #3–#11)

PRs #3–#11 are merged to `main`; the growth/redirects/testimonials PR adds the last three migrations below. Nothing below is live until these steps run, in this order.

## 1. Database changes (before publishing)

Apply these migrations from `supabase/migrations/` in order:

| Migration                                     | What it does                                                      |
| --------------------------------------------- | ----------------------------------------------------------------- |
| `20260923100000_pillar_body_guard`            | Blocks wiping a live topic guide (**already applied 2026-09-23**) |
| `20260923101000_site_setup_preserve_settings` | Site setup keeps your CTA + byline, saves history                 |
| `20260923112000_lock_legacy_analytics`        | Stops fake analytics inserts                                      |
| `20260923120000_jev_shadow_scores`            | Jev trial table                                                   |
| `20260923140000_newsletter_truth`             | Honest newsletter status, Audience page, W34–W38 history fix      |
| `20260923141000_offer_access_retry_cron`      | Download-email retry every 15 minutes                             |
| `20260923150000_admin_overview_truth`         | Fast Overview + attention list                                    |
| `20260923151000_indexnow_and_settings_checks` | IndexNow key, settings validation                                 |
| `20260923152000_resources_and_guides`         | Resources/guides fixes, generation limits                         |
| `20260923160000_redirects`                    | 404 → home redirects, Redirects admin page, seeded rules          |
| `20260923170000_site_copy_voice`              | Article-end Summit box copy in Brian's voice                      |
| `20260923171000_measure_about_page`           | Counts /about in first-party measurement                          |

## 2. Deploy edge functions

`manual-publish`, `publish-scheduled-posts`, `auto-publish-gate`, `daily-content-run`, `send-weekly-newsletter`, `compose-weekly-newsletter-preview`, `newsletter-subscribe`, `newsletter-unsubscribe`, `weekly-report`, `offers-api`, `offer-stripe-webhook`, `conversion-events`, `submit-indexnow`, `poll-sources`, `cluster-opportunities`, `draft-from-opportunity`, `generate-blog-post`, `generate-content`, `refresh-stale-content`, `score-content-quality`, `generate-pillar`, `jev-shadow-score`, `render-page`

## 3. Publish the site

## 4. Right after publishing (order matters)

1. `20260923111000_public_column_grants`: hides private article data from the public API. **Must come after the publish**, or article pages break.
2. `20260923130000_post_hold_reasons`: publishing hold reasons and "Needs fact review" flags. **Needs step 4.1 first.**

## 5. Jev trial (optional, free until Sun 9/27)

Ask Lovable for the exact Jev endpoint and model id on its AI Gateway, set `JEV_ENDPOINT` / `JEV_MODEL` in `supabase/functions/jev-shadow-score/index.ts`, redeploy it, run it once, then apply `20260923120100_jev_shadow_cron`.

## 6. Your checklist after deploy

- Verify `m.brianhanson.com` in Resend (GoDaddy DNS), then: Newsletter card → Retry W39; Audience → Resend confirmation to pending; Offers → Requeue
- Admin → Account security → Sign out all other devices
- Brand & publishing → Report Email; IndexNow → Send unsent pages now
- Supabase Auth: redirect URL `https://brianhanson.com/admin/reset-password`, min password 12, leaked-password protection, session timeout
- Remove admin role from ceasar@aiforbusiness.com (Lovable Cloud → Users)
- Confirm permission from each person quoted in the new testimonials (list in docs/TESTIMONIALS.md) before publishing

## Paste-ready Lovable prompt (if you deploy through Lovable)

```
Deployment only. Do not edit, regenerate or refactor any code.

1. Apply these migrations from supabase/migrations exactly as written, in order, and record each in migration history: 20260923101000_site_setup_preserve_settings, 20260923112000_lock_legacy_analytics, 20260923120000_jev_shadow_scores, 20260923140000_newsletter_truth, 20260923141000_offer_access_retry_cron, 20260923150000_admin_overview_truth, 20260923151000_indexnow_and_settings_checks, 20260923152000_resources_and_guides, 20260923160000_redirects, 20260923170000_site_copy_voice, 20260923171000_measure_about_page. Skip any already in migration history.
2. Deploy these edge functions from the current main: manual-publish, publish-scheduled-posts, auto-publish-gate, daily-content-run, send-weekly-newsletter, compose-weekly-newsletter-preview, newsletter-subscribe, newsletter-unsubscribe, weekly-report, offers-api, offer-stripe-webhook, conversion-events, submit-indexnow, poll-sources, cluster-opportunities, draft-from-opportunity, generate-blog-post, generate-content, refresh-stale-content, score-content-quality, generate-pillar, jev-shadow-score, render-page.
3. Do NOT apply 20260923111000_public_column_grants, 20260923130000_post_hold_reasons or 20260923120100_jev_shadow_cron yet.
4. Tell me the exact Jev endpoint URL and model id on the Lovable AI Gateway.

Report which migrations and functions succeeded or failed.
```

After Lovable finishes: publish the site, then send:

```
Deployment only, no code changes. Apply 20260923111000_public_column_grants, then 20260923130000_post_hold_reasons, exactly as written, and record them in migration history. Report success or failure.
```
