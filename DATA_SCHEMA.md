# Data schema and access model

Structure only. No personal data, subscriber records, tokens, keys or secret
values appear in this file. Every table lives in the `public` schema of the
project's Lovable Cloud (Postgres) database with row level security enabled.

Roles referenced below:

- `anon` — an unauthenticated visitor of the public site.
- `authenticated` — a signed-in user; admin capability is decided by
  `public.is_admin(auth.uid())`, which reads `user_roles`.
- `service_role` — server-side automation (server functions, edge functions,
  scheduled jobs). Bypasses RLS.

## Public site content

| Table             | Purpose                                                                                                                                                   | Public read                                                                               | Write |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ----- |
| `posts`           | Blog articles: title, slug, content, excerpt, TLDR, key takeaways, FAQ items, quality score, lint flags, fact check, citations, embedding, `published_at` | Published rows only (`status = 'published' OR is_admin(...)`)                             | Admin |
| `seo_metadata`    | Per-post meta title/description, keywords, OG image                                                                                                       | Only for published posts                                                                  | Admin |
| `categories`      | Blog categories                                                                                                                                           | Yes                                                                                       | Admin |
| `generated_pages` | Programmatic SEO pages: niche, schema, slug, content JSON, SEO meta, schema markup, quality score, target keyword, override audit fields                  | Published rows only                                                                       | Admin |
| `pillar_pages`    | Long-form "A.I. Training for [Industry]" hub guides                                                                                                       | Published rows only                                                                       | Admin |
| `niches`          | Industry identity plus private generation context/expert POV                                                                                              | Active rows: only id, name, slug, is_active; admin RPC reads all fields and inactive rows | Admin |
| `content_schemas` | Page templates (definition, title/description templates, renderer)                                                                                        | Yes                                                                                       | Admin |
| `widget_config`   | Sidebar/page/footer widget placement and settings                                                                                                         | Yes                                                                                       | Admin |
| `site_settings`   | Public identity/CTA plus restricted newsletter configuration                                                                                              | Explicit public columns only; complete configuration through admin_read_site_settings()   | Admin |
| `internal_links`  | Source/target page links, type, anchor text, position                                                                                                     | Yes                                                                                       | Admin |
| `media`           | Uploaded asset name, path, public URL, type, size                                                                                                         | Admin                                                                                     | Admin |

## Analytics and engagement

| Table               | Purpose                                                                | Access                                                                          |
| ------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `page_engagement`   | Page view and interaction events                                       | Insert allowed for `anon`/`authenticated`; read admin only; no update or delete |
| `cta_events`        | CTA impression and click events by variant                             | Insert allowed for `anon`/`authenticated`; read admin only; no update or delete |
| `link_clicks`       | Internal link clicks; a trigger validates the referenced link exists   | Insert allowed for `anon`/`authenticated`; read admin only; no update or delete |
| `gsc_performance`   | Search Console clicks, impressions, CTR, position per query and period | Admin read; `service_role` write                                                |
| `topic_performance` | Aggregated topic-lane performance weights                              | Admin read; `service_role` write                                                |
| `indexing_log`      | Index submission and verification per page URL                         | Admin                                                                           |
| `generation_logs`   | Per-generation status, tokens, cost, duration                          | Admin                                                                           |

## Content pipeline (not public)

| Table                   | Purpose                                                                                               | Access                                                                               |
| ----------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `content_sources`       | Operator-configured feeds: name, kind, URL, topic lane, weight                                        | Admin read/write; `service_role`                                                     |
| `source_items`          | Fetched items: URL, title, author, excerpt, embedding, image, pipeline status, engagement score       | Public read is limited to items the pipeline has marked publishable; otherwise admin |
| `content_opportunities` | Clustered angles, scores, SERP snapshot, brief, status, attempts                                      | Admin / `service_role` only                                                          |
| `expert_notes`          | Operator's own first-person notes used for grounded callouts                                          | Admin only; never public                                                             |
| `generation_jobs`       | Batch generation state and result summary                                                             | Admin                                                                                |
| `site_settings_private` | Voice profile, banned phrases, default expert POV, report email, auto-publish enabled/cap/min quality | Admin read/write; no delete                                                          |

## Newsletter

| Table                    | Purpose                                                                                                                            | Access                                                                                                                                                                      |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `newsletter_subscribers` | Email, status (pending/confirmed/unsubscribed/bounced/complained), confirmation token, source, timestamps, confirmation send count | No `anon` or `authenticated` policy at all: reads and writes go only through `service_role` and the security-definer subscribe RPC. Tokens are never exposed to the client. |
| `newsletter_sends`       | Weekly digest: week key, subject, intro, post IDs and blurbs, status, idempotency key, claim timestamp                             | Admin read; `service_role` write; no insert or delete by clients                                                                                                            |
| `newsletter_rate_limits` | Sliding-window counters keyed by an opaque bucket key                                                                              | Sealed: no policy for any client role; only the security-definer limiter RPC touches it                                                                                     |

Security-definer RPCs, all with `EXECUTE` restricted (the newsletter ones to
`service_role` / the server layer, never `anon`):

- `newsletter_public_subscribe(email, source, cooldown_seconds)` — one
  statement handles new, pending, confirmed, unsubscribed and suppressed
  addresses; bounced and complained addresses are never reactivated.
- `newsletter_rate_limit_hit(key, limit, window_seconds)` — atomic counter.
- `newsletter_prepare_delivery(send_id, lease, template, expected_updated_at)` freezes
  the confirmed audience and exact email template while taking a bounded lease.
- `newsletter_next_delivery_batch(send_id, lease)` rechecks suppressions and claims
  at most 100 deliveries; `newsletter_record_delivery(...)` persists provider receipts.
  Ambiguous attempts enter `needs_review` and are not automatically replayed.
- `newsletter_claim_send` remains for compatibility; new delivery uses the receipt RPCs.
- `content_claim_opportunities(...)` serializes the draft budget, including in-flight
  reservations. `content_start_draft(id, token)` starts a reservation once. A post
  insert trigger fences workers whose claim was replaced.
- `content_schedule_checked(post_id)` atomically rechecks quality, reserves the rolling
  daily publishing budget and selects the next slot. `posts.auto_scheduled_at` records
  budget use independently of later edits.
- `admin_read_niches()` and `admin_read_site_settings()` require a verified admin role
  and return private configuration without granting private columns to ordinary users.
- `is_admin(uuid)` — must stay executable by `anon`, because public read
  policies call it. Do not revoke it.
- `match_posts`, `match_source_items` — vector similarity helpers.
- `top_pages_by_views(limit_count)` — admin dashboard aggregate.

## Access control

| Table               | Purpose                                                                                         | Access                                                     |
| ------------------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `user_roles`        | `user_id` plus `app_role` enum (`admin`, `user`); roles are stored here, never on a profile row | Users read their own rows; changes are `service_role` only |
| `admin_preferences` | Per-admin theme and timezone                                                                    | Owner only                                                 |

## Storage buckets

| Bucket        | Public     | Contents                            | Write                                |
| ------------- | ---------- | ----------------------------------- | ------------------------------------ |
| `blog-images` | Yes (read) | Editorial and article images        | Admin / `service_role`               |
| `og-images`   | Yes (read) | Generated 1200x630 PNG social cards | `service_role` (generation pipeline) |

Both buckets are public for reading because their URLs are embedded in pages
and social metadata. Uploads are never accepted from unauthenticated visitors.

## Conventions

- Timestamps are `timestamptz`; `updated_at` is maintained by the
  `update_updated_at_column()` trigger.
- Status values are validated by triggers rather than CHECK constraints, so
  time-dependent rules stay restore-safe.
- `generated_pages` and `posts` enforce the publish quality gate in a trigger:
  publishing requires a quality score of 75 or more unless
  `publish_override` is set, and an override records its reason, time and
  actor.

## September 17 reliability additions

`newsletter_deliveries` contains the frozen audience, per-recipient status, attempt ID,
provider ID and diagnostic detail. It is sealed from anonymous/nonadmin users;
administrators can read receipts and only the service role writes them. Its email and
confirmation tokens must never appear in public exports or member presets.

`newsletter_sends` adds the frozen template and delivery lease. States are `preview`,
`sending`, `sent`, `cancelled`, and `needs_review`; sent totals count accepted receipts.
A unique index on `seo_metadata.post_id` supports retry-safe SEO upserts. The migration
refuses duplicate existing rows instead of deleting them.

Column grants on `niches` expose only `id`, `name`, `slug`, and `is_active` to public
clients. Public `site_settings` reads likewise select explicit identity fields; admin
settings are loaded through the role-checked RPC. Site setting defaults on new rows
leave paid image generation and automatic publishing off.
