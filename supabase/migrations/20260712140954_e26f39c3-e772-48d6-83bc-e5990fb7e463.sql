
CREATE TABLE IF NOT EXISTS public.site_settings_private (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_email text DEFAULT '',
  report_enabled boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.site_settings_private TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.site_settings_private TO authenticated;

ALTER TABLE public.site_settings_private ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read private settings"
  ON public.site_settings_private
  FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins can insert private settings"
  ON public.site_settings_private
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins can update private settings"
  ON public.site_settings_private
  FOR UPDATE TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

INSERT INTO public.site_settings_private (report_email, report_enabled)
SELECT COALESCE(report_email, ''), COALESCE(report_enabled, false)
FROM public.site_settings
LIMIT 1;

REVOKE SELECT ON public.site_settings FROM anon, authenticated;
ALTER TABLE public.site_settings DROP COLUMN IF EXISTS report_email;
ALTER TABLE public.site_settings DROP COLUMN IF EXISTS report_enabled;

GRANT SELECT (
  id, site_name, site_url, author_name, author_title, author_bio, author_credentials,
  author_social_links, cta_url, cta_headline, cta_subtext, cta_button_text, cta_social_proof,
  publisher_name, publisher_url, voice_profile, banned_phrases, default_expert_pov,
  image_generation_enabled, updated_at
) ON public.site_settings TO anon, authenticated;
GRANT SELECT ON public.site_settings TO service_role;

CREATE TRIGGER update_site_settings_private_updated_at
  BEFORE UPDATE ON public.site_settings_private
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
