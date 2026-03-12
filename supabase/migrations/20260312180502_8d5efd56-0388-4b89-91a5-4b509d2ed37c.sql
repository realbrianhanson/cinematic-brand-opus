-- Create og-images storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('og-images', 'og-images', true)
ON CONFLICT (id) DO NOTHING;

-- Allow public read access to og-images bucket
CREATE POLICY "Public can read og-images"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'og-images');

-- Allow authenticated admins to upload/delete
CREATE POLICY "Admins can upload og-images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'og-images' AND public.is_admin(auth.uid()));

CREATE POLICY "Admins can delete og-images"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'og-images' AND public.is_admin(auth.uid()));

CREATE POLICY "Admins can update og-images"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'og-images' AND public.is_admin(auth.uid()));