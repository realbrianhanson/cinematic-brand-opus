-- Editorial offer assignments. No rules are seeded: existing CTAs keep their
-- current behavior until an editor assigns a published offer.
CREATE TABLE public.content_offer_routes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope text NOT NULL CHECK (scope IN ('page','content_type','niche','default')),
  match_key text NOT NULL,
  label text NOT NULL CHECK (length(btrim(label)) BETWEEN 1 AND 250),
  offer_id uuid NOT NULL REFERENCES public.offers(id) ON DELETE CASCADE,
  headline text NOT NULL DEFAULT '' CHECK (length(headline) <= 200),
  subtext text NOT NULL DEFAULT '' CHECK (length(subtext) <= 1000),
  button_text text NOT NULL DEFAULT '' CHECK (length(button_text) <= 80),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(scope,match_key),
  CHECK (
    (scope='default' AND match_key='*') OR
    (scope='page' AND match_key ~ '^(post|generated|pillar):[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$') OR
    (scope IN ('content_type','niche') AND match_key ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length(match_key)<=160)
  )
);
CREATE INDEX content_offer_routes_offer_id_idx ON public.content_offer_routes(offer_id);
ALTER TABLE public.content_offer_routes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.content_offer_routes FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.content_offer_routes TO authenticated;
GRANT ALL ON public.content_offer_routes TO service_role;
CREATE POLICY content_offer_routes_admin ON public.content_offer_routes
  FOR ALL TO authenticated USING(public.is_admin(auth.uid())) WITH CHECK(public.is_admin(auth.uid()));

CREATE FUNCTION public.content_offer_route_validate() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.offers WHERE id=NEW.offer_id AND status='published' AND NOT funnel_only) THEN
    RAISE EXCEPTION 'Choose a published offer that is available outside a purchase funnel';
  END IF;
  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.content_offer_route_validate() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER content_offer_route_validate BEFORE INSERT OR UPDATE ON public.content_offer_routes
FOR EACH ROW EXECUTE FUNCTION public.content_offer_route_validate();

-- The only public surface returns a single eligible recommendation. It does
-- not expose the route registry, private offer fields, or unpublished offers.
CREATE FUNCTION public.resolve_content_offer(
  _page_key text DEFAULT NULL,
  _content_type_slug text DEFAULT NULL,
  _niche_slug text DEFAULT NULL
) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT jsonb_build_object(
    'route_id',r.id,'scope',r.scope,'offer_id',o.id,'slug',o.slug,
    'title',o.title,'summary',o.summary,'kind',o.kind,
    'headline',r.headline,'subtext',r.subtext,'button_text',r.button_text
  )
  FROM public.content_offer_routes r JOIN public.offers o ON o.id=r.offer_id
  WHERE o.status='published' AND NOT o.funnel_only AND (
    (r.scope='page' AND r.match_key=_page_key) OR
    (r.scope='content_type' AND r.match_key=_content_type_slug) OR
    (r.scope='niche' AND r.match_key=_niche_slug) OR
    r.scope='default'
  )
  ORDER BY CASE r.scope WHEN 'page' THEN 1 WHEN 'content_type' THEN 2 WHEN 'niche' THEN 3 ELSE 4 END
  LIMIT 1
$$;
REVOKE ALL ON FUNCTION public.resolve_content_offer(text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_content_offer(text,text,text) TO anon,authenticated,service_role;
