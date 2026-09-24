-- Public column allowlist for posts, generated_pages and seo_metadata.
--
-- RLS on these tables only filters ROWS (status = 'published'). anon held
-- table-level SELECT, so `GET /rest/v1/posts?select=*` with the publishable key
-- returned every column of every published row: fact_check verdicts,
-- publish_override(_reason/_by/_at), embedding vectors, draft_claim_token,
-- lint_flags, quality/originality scores, editorial_metadata, opportunity_id,
-- and for generated_pages generation_model/cost, target keywords, scores, views.
--
-- Fix: anon gets column-level SELECT on the public columns only (same pattern as
-- 20260917071000_admin_configuration_reads.sql for niches). The column lists
-- mirror src/lib/publicColumns.ts; a unit test asserts they match.
--
-- Checked against production (2026-09-23) before writing this:
--   * RLS policies read by anon reference only posts(id, status) (the
--     seo_metadata policy subquery) and generated_pages(status) - both granted.
--   * Anon-callable SECURITY INVOKER functions: public_resource_counts()
--     (generated_pages content_schema_id, status) and search_public_library()
--     (posts title/excerpt/slug/status; generated_pages title/seo_meta/slug/
--     content_schema_id/status) - all granted. match_posts() (embedding) is not
--     executable by anon. No views select from these tables.
--   * No anon code path writes these tables (RLS already denied it), so the
--     table-level write privileges Supabase grants by default are revoked too.
--
-- `authenticated` keeps full table-level SELECT: the admin UI reads drafts and
-- private columns as `authenticated` under the is_admin() RLS policies, and
-- column privileges cannot depend on is_admin(). Residual surface: any
-- non-admin signed-in account could read private columns of PUBLISHED rows.
-- Today every auth user is an admin and the app has no sign-up flow; keep
-- Supabase Auth sign-ups disabled, or move admin reads to SECURITY DEFINER
-- RPCs before allowing member accounts.
--
-- service_role (edge functions: render-page, rss, llms-txt, generate-sitemap,
-- pipeline) bypasses these grants and is unaffected.

do $$
declare
  t text;
  c record;
begin
  foreach t in array array['posts', 'generated_pages', 'seo_metadata'] loop
    execute format(
      'revoke select, insert, update, delete, truncate, references, trigger on public.%I from public, anon',
      t
    );
    -- Drop any column-level grant left behind so the allowlist below is exact.
    for c in
      select attname
      from pg_attribute
      where attrelid = format('public.%I', t)::regclass
        and attnum > 0
        and not attisdropped
    loop
      execute format(
        'revoke select (%I), insert (%I), update (%I), references (%I) on public.%I from public, anon',
        c.attname, c.attname, c.attname, c.attname, t
      );
    end loop;
  end loop;
end $$;

grant select (id, title, slug, content, excerpt, status, category_id, featured_image, featured_image_alt, reading_time, tldr, key_takeaways, faq_items, source_citations, published_at, created_at, updated_at) on public.posts to anon;

grant select (id, niche_id, content_schema_id, slug, title, content_json, seo_meta, status, published_at, last_refreshed, created_at, updated_at) on public.generated_pages to anon;

grant select (id, post_id, meta_title, meta_description, keywords, og_image, created_at, updated_at) on public.seo_metadata to anon;

-- Admin (authenticated + is_admin RLS) and service_role keep full access.
grant select, insert, update, delete on public.posts, public.generated_pages, public.seo_metadata to authenticated;
grant all on public.posts, public.generated_pages, public.seo_metadata to service_role;
