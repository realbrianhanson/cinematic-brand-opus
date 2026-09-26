-- Opaque server versions protect new admin saves and long-running generation.
-- Legacy clients may continue their existing writes; every write invalidates a
-- previously read version. Deploy this before the guarded function/frontend.
ALTER TABLE public.source_items ADD COLUMN edit_version uuid NOT NULL DEFAULT gen_random_uuid();
CREATE FUNCTION public.touch_news_edit_version() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  -- Ignore caller-supplied versions, including attempts to reuse an old token.
  NEW.edit_version := gen_random_uuid();
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.touch_news_edit_version() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER source_items_edit_version BEFORE INSERT OR UPDATE ON public.source_items
FOR EACH ROW EXECUTE FUNCTION public.touch_news_edit_version();
COMMENT ON COLUMN public.source_items.edit_version IS 'Opaque database-generated concurrency token, refreshed on every write.';
