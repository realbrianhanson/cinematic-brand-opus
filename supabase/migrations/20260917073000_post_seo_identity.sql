-- A post owns at most one SEO record, including after a lost save response.
-- Abort on existing duplicates rather than deleting operator data.
create unique index if not exists seo_metadata_post_id_unique on public.seo_metadata(post_id);
