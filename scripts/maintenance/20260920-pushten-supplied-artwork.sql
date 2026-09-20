-- Owner-supplied PushTen promotional artwork; not a member schema migration.
-- Publish and verify /shop/pushten-ai-business-launch-v2.webp before applying.
-- Re-running is safe. Abort rather than replace an unexpected current cover.
BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '30s';

LOCK TABLE public.site_settings IN SHARE MODE;

DO $$
DECLARE
  target_id CONSTANT uuid := '696e657e-2856-41e0-ac89-3e433d0f7f67'::uuid;
  target_slug CONSTANT text := 'pushten';
  previous_cover CONSTANT text := 'https://brianhanson.com/shop/pushten-v1.webp';
  intended_cover CONSTANT text := 'https://brianhanson.com/shop/pushten-ai-business-launch-v2.webp';
  current_slug text;
  current_cover text;
  updated_count integer;
BEGIN
  IF (SELECT count(*) FROM public.site_settings) <> 1 OR NOT EXISTS (
    SELECT 1
    FROM public.site_settings
    WHERE site_url = 'https://brianhanson.com'
      AND author_name = 'Brian Hanson'
      AND site_name = 'Brian Hanson'
  ) THEN
    RAISE EXCEPTION 'This artwork belongs only to the Brian Hanson owner site';
  END IF;

  SELECT slug, cover_url INTO current_slug, current_cover
  FROM public.offers
  WHERE id = target_id
  FOR UPDATE;

  IF NOT FOUND OR current_slug IS DISTINCT FROM target_slug THEN
    RAISE EXCEPTION 'Expected PushTen offer is missing or has changed slug';
  END IF;
  IF current_cover IS DISTINCT FROM previous_cover
    AND current_cover IS DISTINCT FROM intended_cover THEN
    RAISE EXCEPTION 'PushTen cover has changed; inspect it rather than overwriting';
  END IF;

  UPDATE public.offers
  SET cover_url = intended_cover
  WHERE id = target_id
    AND slug = target_slug
    AND cover_url = previous_cover;

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RAISE NOTICE 'Updated % PushTen cover; an existing matching cover was unchanged', updated_count;
END $$;

-- The existing offers_validate_graph trigger updates updated_at on a changed row.
-- No price, publication status, checkout link, file, or offer content is assigned.
COMMIT;
