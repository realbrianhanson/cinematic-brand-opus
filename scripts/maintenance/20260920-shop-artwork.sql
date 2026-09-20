-- Owner-authorized Brian Hanson artwork; not a member schema migration.
-- Publish and verify all three public /shop/*-v1.webp assets before applying.
-- Re-running is safe. Abort rather than overwrite an independently changed cover.
BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '30s';

-- Keep the checked owner identity stable throughout this short transaction.
LOCK TABLE public.site_settings IN SHARE MODE;

DO $$
DECLARE
  target_ids CONSTANT uuid[] := ARRAY[
    '6689db7a-432b-41d9-8b73-2f89c32c67b4'::uuid,
    '696e657e-2856-41e0-ac89-3e433d0f7f67'::uuid,
    'e605661a-8652-4949-b20c-8ec37c4f98d6'::uuid
  ];
  target_slugs CONSTANT text[] := ARRAY[
    'app-building-workshop',
    'pushten',
    'ai-follow-up-starter-kit'
  ];
  cover_prefix CONSTANT text := 'https://brianhanson.com/shop/';
  expected record;
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

  -- Lock each target in ID order, then validate every target before any writes.
  FOR expected IN
    SELECT target.id, target.slug
    FROM unnest(target_ids, target_slugs) AS target(id, slug)
    ORDER BY target.id
  LOOP
    SELECT slug, cover_url INTO current_slug, current_cover
    FROM public.offers
    WHERE id = expected.id
    FOR UPDATE;

    IF NOT FOUND OR current_slug IS DISTINCT FROM expected.slug THEN
      RAISE EXCEPTION 'Expected offer % (%) is missing or has changed slug', expected.id, expected.slug;
    END IF;
    IF current_cover IS NOT NULL
      AND current_cover IS DISTINCT FROM cover_prefix || expected.slug || '-v1.webp' THEN
      RAISE EXCEPTION 'Cover for offer % has changed; inspect it rather than overwriting', expected.slug;
    END IF;
  END LOOP;

  UPDATE public.offers AS offer
  SET cover_url = cover_prefix || target.slug || '-v1.webp'
  FROM unnest(target_ids, target_slugs) AS target(id, slug)
  WHERE offer.id = target.id
    AND offer.slug = target.slug
    AND offer.cover_url IS NULL;

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RAISE NOTICE 'Assigned % new Shop covers; existing matching covers were unchanged', updated_count;
END $$;

-- The existing offers_validate_graph trigger updates updated_at on changed rows.
-- No price, publication status, checkout link, file, or offer content is assigned.
COMMIT;
