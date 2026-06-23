
-- 1. RLS: replace USING/WITH CHECK (true) for INSERT policies with a non-trivial check
DROP POLICY IF EXISTS "Anyone can insert cta_events" ON public.cta_events;
CREATE POLICY "Anyone can insert cta_events" ON public.cta_events
  FOR INSERT TO anon, authenticated
  WITH CHECK (event_type IS NOT NULL AND page_type IS NOT NULL);

DROP POLICY IF EXISTS "Anyone can insert link_clicks" ON public.link_clicks;
CREATE POLICY "Anyone can insert link_clicks" ON public.link_clicks
  FOR INSERT TO anon, authenticated
  WITH CHECK (internal_link_id IS NOT NULL);

DROP POLICY IF EXISTS "Anyone can insert page_engagement" ON public.page_engagement;
CREATE POLICY "Anyone can insert page_engagement" ON public.page_engagement
  FOR INSERT TO anon, authenticated
  WITH CHECK (event_type IS NOT NULL AND page_id IS NOT NULL);

-- 2. admin_preferences: add missing DELETE policy
CREATE POLICY "Users can delete own preferences" ON public.admin_preferences
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- 3. site_settings: protect report_email / report_enabled from anon (and non-admin authenticated)
REVOKE SELECT ON public.site_settings FROM anon, authenticated;
GRANT SELECT (
  id, site_name, site_url, author_name, author_title, author_bio, author_credentials,
  author_social_links, cta_url, cta_headline, cta_subtext, cta_button_text, cta_social_proof,
  publisher_name, publisher_url, updated_at
) ON public.site_settings TO anon, authenticated;
-- Admin reads of sensitive columns happen via service_role in edge functions / admin client.
GRANT SELECT ON public.site_settings TO service_role;

-- 4. SECURITY DEFINER functions: revoke EXECUTE from anon (and authenticated where not needed)
REVOKE ALL ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.validate_pillar_pages_status() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.validate_keyword_difficulty() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.validate_widget_zone() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.validate_generated_pages_status() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.top_pages_by_views(integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_admin(uuid) FROM anon;
-- is_admin remains executable by authenticated (required by RLS policies that call it)

-- 5. Realtime: restrict generation_jobs channel subscriptions to admins
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins can subscribe to generation_jobs realtime" ON realtime.messages;
CREATE POLICY "Admins can subscribe to generation_jobs realtime"
  ON realtime.messages
  FOR SELECT
  TO authenticated
  USING (public.is_admin((SELECT auth.uid())));

-- 6. Storage: restrict public buckets so listing returns nothing (direct URL access still works via Storage CDN)
DROP POLICY IF EXISTS "Anyone can view blog images" ON storage.objects;
DROP POLICY IF EXISTS "Public can read og-images" ON storage.objects;
-- Replace with admin-only listing via SELECT policy; public file access is served by Storage CDN
-- which doesn't require an objects SELECT policy for buckets marked public.
CREATE POLICY "Admins can list blog images" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'blog-images' AND public.is_admin(auth.uid()));
CREATE POLICY "Admins can list og-images" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'og-images' AND public.is_admin(auth.uid()));
