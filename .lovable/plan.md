# Content Engine v2 — as built (July 16, 2026)

Pipeline (all live, cron every 30 min via autonomous-content-pipeline-30min):
poll-sources (RSS + Perplexity + Reddit + Hacker News, engagement_score stored, pipeline_status='new')
→ cluster-opportunities (cosine 0.82 dedupe, engagement-weighted scoring, editorial LLM pick, reads pipeline_status='new', marks 'used' without touching News visibility)
→ draft-from-opportunity (voice critique/lint, expert_note injection; SEO fields go to seo_metadata, embedding stored on post)
→ fact-check (claims extracted via MAIN_MODEL, verified via Perplexity sonar; >2 unverified/contradicted flags lint_flags and blocks one-click publish)
→ /admin/queue approval (nothing auto-publishes; DB trigger requires quality >= 75 or publish_override)

Hard gates in draft-from-opportunity:
- Freshness: reject if newest source > 96h (FRESHNESS_MAX_HOURS) unless brief.evergreen
- Originality: reject if max cosine similarity > 0.82 vs own cluster sources, 14-day source corpus (match_source_items RPC), or existing posts (match_posts RPC); reject_reason names the corpus
- Quality: reject if scorePost < 75

Key columns: source_items.pipeline_status ('new'|'used'|'stale' — pipeline lifecycle, separate from News-page status), source_items.engagement_score, posts.embedding, posts.fact_check, posts.fact_checked_at.

Cron auth: x-cron-secret header checked against CRON_INVOCATION_SECRET or PIPELINE_CRON_SECRET env; vault secret CRON_INVOCATION_SECRET feeds pg_cron jobs. Jobs: autonomous-content-pipeline-30min (*/30), poll-sources-every-4h (15 */4), plus pre-existing publish/freshness/indexnow/report/gsc crons.

Utility: backfill-post-embeddings (admin/cron auth) embeds posts where embedding is null, returns {processed, remaining}.

Deferred: perspective hard gate (first-person check when expert_note existed), content-performance-scorer learning loop (topic_performance table exists, build ~3 weeks after launch), X/TikTok signals, Claude scheduled deep-angle briefs.
