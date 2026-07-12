CREATE POLICY "Public can read source items" ON public.source_items FOR SELECT USING (true);
GRANT SELECT ON public.source_items TO anon;
GRANT SELECT ON public.source_items TO authenticated;