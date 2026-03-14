CREATE POLICY "Anyone can read seo_metadata"
  ON public.seo_metadata FOR SELECT TO public
  USING (true);