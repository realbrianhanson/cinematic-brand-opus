/**
 * Column allowlists for anonymous (publishable-key) reads of editorial tables.
 *
 * `anon` holds column-level SELECT on exactly these columns (migration
 * 20260923111000_public_column_grants.sql), so any public reader that asks for
 * `*` or for another column fails with "permission denied". Admin screens read
 * as `authenticated` and keep full column access; they do not use these.
 *
 * Adding a column here without adding it to a new grant migration breaks the
 * public site, and the reverse re-exposes it. The unit test
 * src/lib/__tests__/publicColumns.test.ts keeps the two in step.
 *
 * Deliberately excluded (internal editorial/pipeline state): fact_check,
 * fact_checked_at, embedding, publish_override*, draft_claim_token, lint_flags,
 * quality_score, originality_score, editorial_metadata, opportunity_id,
 * performance_grade, freshness_hours, scheduled_at, auto_scheduled_at,
 * generation_model, generation_cost, target_keyword, keyword_difficulty, views,
 * refresh_count, performance_trend, human_edited, schema_markup, silo_niche_id.
 */

/** posts columns rendered on /blog, /blog/$slug, feeds, widgets and search. */
export const PUBLIC_POST_COLUMNS =
  "id, title, slug, content, excerpt, status, category_id, featured_image, featured_image_alt, reading_time, tldr, key_takeaways, faq_items, source_citations, published_at, created_at, updated_at" as const;

/** generated_pages columns rendered on /resources/* and related widgets. */
export const PUBLIC_GENERATED_PAGE_COLUMNS =
  "id, niche_id, content_schema_id, slug, title, content_json, seo_meta, status, published_at, last_refreshed, created_at, updated_at" as const;

/** seo_metadata holds only public page metadata; granted in full. */
export const PUBLIC_SEO_METADATA_COLUMNS =
  "id, post_id, meta_title, meta_description, keywords, og_image, created_at, updated_at" as const;

export const PUBLIC_POST_COLUMN_LIST = PUBLIC_POST_COLUMNS.split(", ");
export const PUBLIC_GENERATED_PAGE_COLUMN_LIST =
  PUBLIC_GENERATED_PAGE_COLUMNS.split(", ");
export const PUBLIC_SEO_METADATA_COLUMN_LIST =
  PUBLIC_SEO_METADATA_COLUMNS.split(", ");

/** Article detail: public post columns plus its category. */
export const PUBLIC_POST_SELECT =
  `${PUBLIC_POST_COLUMNS}, categories(name, slug)` as const;

/** Resource detail: public page columns plus its (primary) niche. */
export const PUBLIC_GENERATED_PAGE_SELECT =
  `${PUBLIC_GENERATED_PAGE_COLUMNS}, niches!generated_pages_niche_id_fkey(id, name, slug)` as const;

/** Resource listing cards: no page bodies, just what the list renders. */
export const PUBLIC_GENERATED_PAGE_LIST_SELECT =
  "id, niche_id, content_schema_id, slug, title, niches!generated_pages_niche_id_fkey(name, slug)" as const;

/** Per-post SEO fields used by article <head> and cross-link matching. */
export const PUBLIC_POST_SEO_SELECT =
  "meta_title,meta_description,og_image,keywords" as const;
