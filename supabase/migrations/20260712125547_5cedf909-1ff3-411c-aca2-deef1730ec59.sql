GRANT SELECT ON public.source_items TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.source_items TO authenticated;
GRANT ALL ON public.source_items TO service_role;