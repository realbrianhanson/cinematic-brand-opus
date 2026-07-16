DROP POLICY IF EXISTS "Anyone can read seo_metadata" ON public.seo_metadata;
CREATE POLICY "Public can read seo for published posts"
ON public.seo_metadata
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.posts p
    WHERE p.id = seo_metadata.post_id AND p.status = 'published'
  )
);