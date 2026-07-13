
-- 1. source_items: restrict public SELECT to published rows only
DROP POLICY IF EXISTS "Public can read source_items" ON public.source_items;
DROP POLICY IF EXISTS "Public read source_items" ON public.source_items;
DROP POLICY IF EXISTS "Anyone can read source_items" ON public.source_items;
DROP POLICY IF EXISTS "source_items_public_read" ON public.source_items;
DROP POLICY IF EXISTS "Public can view source_items" ON public.source_items;

CREATE POLICY "Public can view published source_items"
  ON public.source_items
  FOR SELECT
  USING (status = 'published' OR public.is_admin(auth.uid()));

-- 2. link_clicks: validate internal_link_id references a real internal_links row
CREATE OR REPLACE FUNCTION public.validate_link_click()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.internal_link_id IS NULL THEN
    RAISE EXCEPTION 'internal_link_id is required';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.internal_links WHERE id = NEW.internal_link_id
  ) THEN
    RAISE EXCEPTION 'internal_link_id % does not reference a valid internal_links row', NEW.internal_link_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_link_click_trigger ON public.link_clicks;
CREATE TRIGGER validate_link_click_trigger
  BEFORE INSERT ON public.link_clicks
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_link_click();
