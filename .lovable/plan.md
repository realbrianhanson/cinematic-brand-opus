## Defaults I'm locking in (you skipped the questions)

- **Cadence:** 1 candidate/day, published ~3-5/week. Every post lands in an **approval queue** — nothing auto-publishes. Score ≥85 gets a "one-click publish" badge; 75-84 goes to "needs edit"; <75 auto-rejected.
- **Topic lanes:** AI tools & model news, AI for SMB marketing/sales, AI training/enablement, and industry AI use-cases (feeds your 12 active niches).
- **Sources:** Perplexity (recency=day) + Firecrawl SERP/PAA (already connected) + a small curated RSS layer I'll seed with ~10 feeds.
- **Voice grounding:** existing `expert_pov` fields + a new lightweight **"Brian's Notes" inbox** in admin (drop 1-3 sentences whenever; writer weaves the freshest matching note into the callout — nothing fabricated when the inbox is empty).

## What already exists (I'm reusing, not rebuilding)

`generate-blog-post`, `_shared/voice.ts` (critique/revise + lint + banned phrases), `scorePost` quality gate (≥75 DB trigger), `render-page` crawler HTML, `generate-og-image` (PNG), pg_cron scheduler, GSC feedback loop, Perplexity + Firecrawl connectors, silo linking, IndexNow. **No stack change. No new CMS.**

## New pieces I'll add

### 1. Data model (one migration)

- `content_sources` — id, name, kind (`rss` | `perplexity_topic` | `manual`), url, topic_lane, active, last_polled_at
- `source_items` — id, source_id, url UNIQUE, title, author, published_at, raw_excerpt, topic_lane, embedding vector(1536) nullable, status (`new` | `used` | `skipped` | `stale`), fetched_at
- `content_opportunities` — id, cluster_of source_item_ids[], angle, target_keyword, topic_lane, opportunity_score int, rationale, serp_snapshot jsonb, gap_reason text, created_at, status (`proposed` | `drafting` | `queued` | `approved` | `rejected` | `published`)
- `expert_notes` — id, note text, topic_hint, used_in_post_id nullable, created_at (the "Brian's Notes" inbox)
- Add `posts.opportunity_id` FK, `posts.source_citations jsonb`, `posts.originality_score int`, `posts.freshness_hours int`
- All tables: GRANTs, RLS (admin-only write, service_role full), triggers

### 2. Seven-stage agent pipeline (edge functions)

Each is a focused function, chained by a job runner. All use `MAIN_MODEL` from `_shared/models.ts` except where noted.

```text
daily-content-run (cron 05:30 ET)
  └─► poll-sources          ── RSS + Perplexity daily digest → source_items
  └─► cluster-opportunities ── dedupe by embedding (cosine >0.85), score by
                                lane fit + search demand + gap vs existing
                                posts/pages, pick top 1-2
  └─► build-brief           ── for each opportunity: SERP + PAA via Firecrawl,
                                internal link candidates, target keyword,
                                angle Brian would actually take
  └─► draft-article         ── existing generate-blog-post path, seeded with
                                brief + freshest matching expert_note
  └─► editor-pass           ── voice critique/revise (already built) + a new
                                "de-slop" pass: strips hedging, generic intros,
                                enforces first-person where a note exists
  └─► fact-check            ── extract every numeric/named claim, verify each
                                against cited sources via Perplexity with
                                citations=required; flag unverified as
                                lint_flags, drop if >2 unverified
  └─► seo-finalize          ── metadata, internal links (existing silo
                                builder), OG PNG, schema hints, queue
```

Failure at any stage marks the opportunity `rejected` with a reason — no silent retries.

### 3. Anti-slop guardrails (hard gates, not soft prompts)

- **Originality:** embed the draft, cosine-compare against every source item and every existing post; reject if max similarity >0.82.
- **Freshness:** reject if newest source is >72h old unless topic is flagged evergreen.
- **Fabrication:** fact-check stage drops the post if any numeric claim lacks a citation URL that Perplexity can re-verify.
- **AI-slop lint:** extend `voice.ts` with patterns for "In today's fast-paced world", "It's important to note", "In conclusion", "Whether you're a…", em-dashes, and negation-correction ("not just X, but Y") — already partially there, I'll harden.
- **Perspective check:** reject if the post contains zero first-person markers AND an expert_note existed for the topic.

### 4. Approval queue UI

New admin route `/admin/queue`:
- Card per queued post: title, angle, quality score, originality score, freshness hours, source citation count, "Brian's Note used" badge
- Actions: **Publish now** (score ≥85), **Edit** (opens existing PostEditor), **Reject with reason** (feeds back into strategy)
- One-click **"Rewrite in my voice"** button that re-runs editor-pass with the reject reason as extra context

### 5. Brian's Notes inbox

Small admin widget on the dashboard: textarea + optional topic hint + save. That's it. Notes stay in the pool for 14 days, then archive. The drafting stage picks the freshest note whose topic_hint matches the opportunity's lane; if none, callout falls back to `niche.expert_pov` or `site_settings.default_expert_pov` (existing behavior).

### 6. Automation schedule (pg_cron additions)

- `poll-sources` — every 4h
- `daily-content-run` — 05:30 ET daily
- `content-performance-scorer` — daily 22:00, updates `posts.performance_grade` from GSC + `page_engagement` to feed strategy scoring
- Existing crons untouched

### 7. Learning loop

After 21 days, each published post gets a grade (A/B/C/D) from GSC impressions + clicks + `page_engagement`. Strategy scorer weights future opportunity selection toward lanes/formats grading A/B and downweights D. No ML — just weighted moving averages stored on `content_sources` and a new `topic_performance` table.

## Technical details

- **Stack (unchanged):** React SPA + Supabase edge functions + pg_cron + Perplexity + Firecrawl + Lovable AI gateway. No WordPress, no external CMS.
- **Embeddings:** `text-embedding-3-small` via Lovable AI gateway. Store in Postgres `vector` column (enable pgvector in the migration).
- **Secrets:** everything needed is already set. No new API keys.
- **Security:** all new tables RLS-locked to admin; cron functions use existing `cronAuth`; `is_admin` anon grant preserved.
- **Costs:** ~1 daily run × (Perplexity ~$0.03 + Firecrawl SERP ~$0.02 + Gemini generation ~$0.05 + embeddings ~$0.01) ≈ **$0.11/day, ~$3.30/month** on top of current usage.

## MVP rollout (what I'll actually build, in order)

1. Migration: new tables + pgvector + posts columns + GRANTs/RLS
2. `_shared/embeddings.ts` helper + originality scorer
3. `poll-sources` edge function + seed 10 RSS feeds + Perplexity daily digest
4. `cluster-opportunities` + `build-brief`
5. Extend `generate-blog-post` to accept a brief + opportunity_id (keep manual mode working)
6. `fact-check` edge function
7. `daily-content-run` orchestrator + pg_cron schedule
8. Admin `/admin/queue` page + Brian's Notes widget on dashboard
9. `content-performance-scorer` + strategy feedback

Each step ships independently; you can pause after any of them and still have working value.

## Out of scope (explicitly not doing)

- No auto-publish. Everything queues for you.
- No image AI beyond the existing featured-image + OG PNG flow.
- No social media auto-posting.
- No new CMS or migration off the current stack.

Approve and I'll start with step 1 (the migration).