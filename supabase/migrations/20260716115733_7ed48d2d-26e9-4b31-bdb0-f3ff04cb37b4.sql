
-- 1. Denormalize source name onto source_items so public pages don't need to join content_sources
ALTER TABLE public.source_items ADD COLUMN IF NOT EXISTS source_name TEXT;

UPDATE public.source_items si
SET source_name = cs.name
FROM public.content_sources cs
WHERE si.source_id = cs.id AND si.source_name IS NULL;

CREATE OR REPLACE FUNCTION public.sync_source_items_source_name()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.source_id IS NOT NULL AND (NEW.source_name IS NULL OR NEW.source_name = '') THEN
    SELECT name INTO NEW.source_name FROM public.content_sources WHERE id = NEW.source_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_source_items_sync_source_name ON public.source_items;
CREATE TRIGGER trg_source_items_sync_source_name
  BEFORE INSERT OR UPDATE OF source_id ON public.source_items
  FOR EACH ROW EXECUTE FUNCTION public.sync_source_items_source_name();

-- Keep source_name up to date when a content source is renamed
CREATE OR REPLACE FUNCTION public.propagate_content_source_name()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.name IS DISTINCT FROM OLD.name THEN
    UPDATE public.source_items SET source_name = NEW.name WHERE source_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_content_sources_propagate_name ON public.content_sources;
CREATE TRIGGER trg_content_sources_propagate_name
  AFTER UPDATE OF name ON public.content_sources
  FOR EACH ROW EXECUTE FUNCTION public.propagate_content_source_name();

-- 2. Lock down content_sources: admins only, no public read
DROP POLICY IF EXISTS "Public can read source names" ON public.content_sources;
REVOKE SELECT ON public.content_sources FROM anon, authenticated;
GRANT SELECT ON public.content_sources TO authenticated; -- RLS still restricts to admins
GRANT ALL ON public.content_sources TO service_role;

-- 3. Realtime: explicit admin-only topic policies for private/broadcast channels
DROP POLICY IF EXISTS "Admins can subscribe to posts realtime" ON realtime.messages;
CREATE POLICY "Admins can subscribe to posts realtime"
  ON realtime.messages FOR SELECT TO authenticated
  USING (
    realtime.topic() LIKE 'posts%'
    AND public.is_admin((SELECT auth.uid()))
  );

DROP POLICY IF EXISTS "Admins can subscribe to source_items realtime" ON realtime.messages;
CREATE POLICY "Admins can subscribe to source_items realtime"
  ON realtime.messages FOR SELECT TO authenticated
  USING (
    realtime.topic() LIKE 'source_items%'
    AND public.is_admin((SELECT auth.uid()))
  );

DROP POLICY IF EXISTS "Admins can subscribe to content_opportunities realtime" ON realtime.messages;
CREATE POLICY "Admins can subscribe to content_opportunities realtime"
  ON realtime.messages FOR SELECT TO authenticated
  USING (
    realtime.topic() LIKE 'content_opportunities%'
    AND public.is_admin((SELECT auth.uid()))
  );
