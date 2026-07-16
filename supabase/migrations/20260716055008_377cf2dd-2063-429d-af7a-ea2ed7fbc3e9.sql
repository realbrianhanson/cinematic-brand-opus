
-- content_sources: restrict public read to only id + name columns
REVOKE SELECT ON public.content_sources FROM anon, authenticated;
GRANT SELECT (id, name) ON public.content_sources TO anon, authenticated;
GRANT ALL ON public.content_sources TO service_role;

-- link_clicks: tighten INSERT policy to require internal_link_id references a real row
DROP POLICY IF EXISTS "Anyone can insert link_clicks" ON public.link_clicks;
CREATE POLICY "Anyone can insert valid link_clicks"
ON public.link_clicks
FOR INSERT
TO anon, authenticated
WITH CHECK (
  internal_link_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM public.internal_links il WHERE il.id = internal_link_id)
);
