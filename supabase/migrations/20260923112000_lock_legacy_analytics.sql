-- Lock down the legacy, browser-writable analytics tables.
--
-- 1) cta_events: the browser writer was retired when CTA tracking moved to the
--    origin-checked, rate-limited conversion collector (docs/CONVERSION_MEASUREMENT.md).
--    Nothing in src/ or supabase/functions writes it any more, yet anon could
--    still insert. Close the write path; admin reads of historical rows stay.
DROP POLICY IF EXISTS "Anyone can insert cta_events" ON public.cta_events;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.cta_events FROM anon, authenticated;

-- 2) page_engagement: still written directly by public resource pages
--    (src/pages/GeneratedPage.tsx, src/components/renderers/*Renderer.tsx).
--    Bound what an anonymous insert can contain. NOT VALID: existing rows are
--    not re-checked, only new and updated rows.
ALTER TABLE public.page_engagement
  DROP CONSTRAINT IF EXISTS page_engagement_event_type_chk,
  DROP CONSTRAINT IF EXISTS page_engagement_metadata_size_chk;
ALTER TABLE public.page_engagement
  ADD CONSTRAINT page_engagement_event_type_chk CHECK (
    event_type IN (
      'view',
      'feedback',
      'faq_click',
      'filter_use',
      'copy_click',
      'checkbox_click'
    )
  ) NOT VALID,
  ADD CONSTRAINT page_engagement_metadata_size_chk CHECK (
    metadata IS NULL OR pg_column_size(metadata) <= 1024
  ) NOT VALID;

-- Only events for pages the visitor can actually see (published) are accepted.
DROP POLICY IF EXISTS "Anyone can insert page_engagement" ON public.page_engagement;
DROP POLICY IF EXISTS "Anyone can insert engagement on published pages" ON public.page_engagement;
CREATE POLICY "Anyone can insert engagement on published pages"
  ON public.page_engagement
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    page_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.generated_pages g
      WHERE g.id = page_id AND g.status = 'published'
    )
  );

-- Rows are append-only from the browser.
REVOKE UPDATE, DELETE, TRUNCATE ON public.page_engagement FROM anon, authenticated;
