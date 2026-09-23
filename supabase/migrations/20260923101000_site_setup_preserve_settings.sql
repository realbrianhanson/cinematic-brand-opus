-- Site setup must not silently overwrite Brand & publishing fields.
--
-- Before: save_site_branding always copied the wizard's homepage fields into
-- the article CTA box (cta_headline/cta_subtext/cta_button_text/cta_url) and
-- the byline title (author_title). Applying setup with no edits replaced the
-- live article CTA and byline with homepage copy, and nothing kept the old
-- values.
--
-- After:
--   * Owner mode keeps author_title and cta_* unless the payload carries an
--     explicit non-empty bylineTitle / ctaHeadline / ctaSubtext /
--     ctaButtonText / ctaUrl. An empty authorBio keeps the live bio.
--   * Member mode ("fresh member brand") is unchanged: it rewrites the
--     identity, article CTA and byline, and the first member apply clears
--     credentials and social links.
--   * Every apply first snapshots the prior site_branding row and the
--     site_settings columns it can touch into public.site_setup_history, a
--     private table (no anon/authenticated access). To undo a bad apply, a
--     database owner copies the snapshot back by hand.

CREATE TABLE IF NOT EXISTS public.site_setup_history (
  id bigserial PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  actor uuid,
  mode text,
  branding jsonb,
  settings jsonb NOT NULL
);
ALTER TABLE public.site_setup_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.site_setup_history FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE public.site_setup_history_id_seq FROM PUBLIC, anon, authenticated;
COMMENT ON TABLE public.site_setup_history IS
  'Private snapshots taken by save_site_branding before each Site setup apply. Restore manually by copying settings/branding back.';

CREATE OR REPLACE FUNCTION public.save_site_branding(value jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  reset_identity boolean;
  is_member boolean;
  byline_title text := NULLIF(btrim(value->>'bylineTitle'), '');
  cta_headline_v text := NULLIF(btrim(value->>'ctaHeadline'), '');
  cta_subtext_v text := NULLIF(btrim(value->>'ctaSubtext'), '');
  cta_button_v text := NULLIF(btrim(value->>'ctaButtonText'), '');
  cta_url_v text := NULLIF(btrim(value->>'ctaUrl'), '');
  bio_v text := NULLIF(btrim(value->>'authorBio'), '');
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'Administrator required'; END IF;
  IF value->>'mode' NOT IN ('owner','member') OR COALESCE(length(value->>'name'),0)=0 OR value->>'siteUrl' !~ '^https://[^/[:space:]]+$' OR value->>'accent' !~ '^#[0-9a-fA-F]{6}$' THEN RAISE EXCEPTION 'Invalid site identity'; END IF;
  IF cta_url_v IS NOT NULL AND cta_url_v !~ '^(https://[^[:space:]]+|/([^/[:space:]][^[:space:]]*)?)$' THEN RAISE EXCEPTION 'Invalid call-to-action URL'; END IF;
  IF length(byline_title) > 300 OR length(cta_headline_v) > 300 OR length(cta_subtext_v) > 1000 OR length(cta_button_v) > 80 OR length(cta_url_v) > 2000 THEN RAISE EXCEPTION 'Brand & publishing value too long'; END IF;
  IF (SELECT count(*) FROM public.site_settings) <> 1 THEN RAISE EXCEPTION 'Initialize one site settings record before setup'; END IF;

  is_member := value->>'mode'='member';
  reset_identity := is_member AND NOT EXISTS(SELECT 1 FROM public.site_branding WHERE settings->>'mode'='member');

  INSERT INTO public.site_setup_history(actor, mode, branding, settings)
  SELECT auth.uid(), value->>'mode',
    (SELECT b.settings FROM public.site_branding b WHERE b.id),
    jsonb_build_object(
      'site_name', s.site_name, 'site_url', s.site_url,
      'author_name', s.author_name, 'author_title', s.author_title, 'author_bio', s.author_bio,
      'author_credentials', to_jsonb(s.author_credentials), 'author_social_links', s.author_social_links,
      'publisher_name', s.publisher_name, 'publisher_url', s.publisher_url,
      'cta_headline', s.cta_headline, 'cta_subtext', s.cta_subtext,
      'cta_button_text', s.cta_button_text, 'cta_url', s.cta_url, 'cta_social_proof', s.cta_social_proof,
      'updated_at', s.updated_at)
  FROM public.site_settings s;

  INSERT INTO public.site_branding(id,settings,updated_at) VALUES(true,value,now())
  ON CONFLICT(id) DO UPDATE SET settings=EXCLUDED.settings, updated_at=EXCLUDED.updated_at;

  UPDATE public.site_settings SET
    site_name=value->>'name',
    site_url=value->>'siteUrl',
    author_name=value->>'name',
    publisher_name=value->>'name',
    publisher_url=value->>'siteUrl',
    author_bio=CASE WHEN is_member THEN value->>'authorBio' ELSE COALESCE(bio_v, author_bio) END,
    author_title=CASE WHEN is_member THEN value->>'role' ELSE COALESCE(byline_title, author_title) END,
    cta_headline=CASE WHEN is_member THEN value->>'headline' ELSE COALESCE(cta_headline_v, cta_headline) END,
    cta_subtext=CASE WHEN is_member THEN value->>'description' ELSE COALESCE(cta_subtext_v, cta_subtext) END,
    cta_button_text=CASE WHEN is_member THEN value->>'offerLabel' ELSE COALESCE(cta_button_v, cta_button_text) END,
    cta_url=CASE WHEN is_member THEN value->>'offerUrl' ELSE COALESCE(cta_url_v, cta_url) END,
    cta_social_proof=CASE WHEN is_member THEN NULL ELSE cta_social_proof END,
    author_credentials=CASE WHEN reset_identity THEN ARRAY[]::text[] ELSE author_credentials END,
    author_social_links=CASE WHEN reset_identity THEN '{}'::jsonb ELSE author_social_links END,
    updated_at=now();
END $$;
REVOKE ALL ON FUNCTION public.save_site_branding(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_site_branding(jsonb) TO authenticated;
