-- Shop inclusion is explicit. Existing campaign offers stay off the catalog.
ALTER TABLE public.offers
  ADD COLUMN show_in_shop boolean NOT NULL DEFAULT false,
  ADD COLUMN shop_category text NOT NULL DEFAULT 'resource',
  ADD COLUMN shop_featured boolean NOT NULL DEFAULT false,
  ADD CONSTRAINT offers_shop_category CHECK (shop_category IN ('training','resource','tool','course')),
  ADD CONSTRAINT offers_shop_excludes_funnel_only CHECK (NOT (show_in_shop AND funnel_only));

-- Keep the existing published-row RLS and private-column restrictions intact.
GRANT SELECT(show_in_shop,shop_category,shop_featured) ON public.offers TO anon;

CREATE INDEX offers_shop_catalog_idx
  ON public.offers(shop_category,shop_featured DESC,updated_at DESC,id)
  WHERE status='published' AND show_in_shop AND NOT funnel_only;
