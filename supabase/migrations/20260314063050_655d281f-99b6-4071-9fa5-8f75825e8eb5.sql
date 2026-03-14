CREATE POLICY "Anyone can read site_settings"
  ON public.site_settings FOR SELECT TO public
  USING (true);