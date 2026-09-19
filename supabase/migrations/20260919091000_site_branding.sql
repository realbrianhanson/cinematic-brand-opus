CREATE TABLE public.site_branding (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  settings jsonb NOT NULL CHECK (jsonb_typeof(settings)='object' AND octet_length(settings::text) <= 30000),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.site_branding ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public branding read" ON public.site_branding FOR SELECT TO anon,authenticated USING (true);
REVOKE ALL ON public.site_branding FROM anon,authenticated;
GRANT SELECT ON public.site_branding TO anon,authenticated;
-- Setup writes are atomic with public author / publishing identity. Private integration fields are untouched.
CREATE OR REPLACE FUNCTION public.save_site_branding(value jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE reset_identity boolean;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'Administrator required'; END IF;
  IF value->>'mode' NOT IN ('owner','member') OR COALESCE(length(value->>'name'),0)=0 OR value->>'siteUrl' !~ '^https://[^/[:space:]]+$' OR value->>'accent' !~ '^#[0-9a-fA-F]{6}$' THEN RAISE EXCEPTION 'Invalid site identity'; END IF;
  IF (SELECT count(*) FROM public.site_settings) <> 1 THEN RAISE EXCEPTION 'Initialize one site settings record before setup'; END IF;
  reset_identity := value->>'mode'='member' AND NOT EXISTS(SELECT 1 FROM public.site_branding WHERE settings->>'mode'='member');
  INSERT INTO public.site_branding(id,settings,updated_at) VALUES(true,value,now()) ON CONFLICT(id) DO UPDATE SET settings=EXCLUDED.settings,updated_at=EXCLUDED.updated_at;
  UPDATE public.site_settings SET site_name=value->>'name', site_url=value->>'siteUrl', author_name=value->>'name', author_title=value->>'role', publisher_name=value->>'name', publisher_url=value->>'siteUrl', author_credentials=CASE WHEN reset_identity THEN ARRAY[]::text[] ELSE author_credentials END, author_social_links=CASE WHEN reset_identity THEN '{}'::jsonb ELSE author_social_links END, author_bio=value->>'authorBio', cta_button_text=value->>'offerLabel', cta_url=value->>'offerUrl', cta_headline=value->>'headline', cta_subtext=value->>'description', cta_social_proof=CASE WHEN value->>'mode'='member' THEN NULL ELSE cta_social_proof END, updated_at=now();
END $$;
REVOKE ALL ON FUNCTION public.save_site_branding(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_site_branding(jsonb) TO authenticated;
