
-- Restore Data-API grants so the public News page can read published items.
GRANT SELECT ON public.source_items TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.source_items TO authenticated;
GRANT ALL ON public.source_items TO service_role;

-- content_sources is embedded via the join `content_sources(name)`.
GRANT SELECT ON public.content_sources TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.content_sources TO authenticated;
GRANT ALL ON public.content_sources TO service_role;

-- Ensure anon can read source names for embeds (name only is fine; RLS below stays scoped).
DROP POLICY IF EXISTS "Public can read source names" ON public.content_sources;
CREATE POLICY "Public can read source names"
  ON public.content_sources FOR SELECT
  TO anon, authenticated
  USING (true);
