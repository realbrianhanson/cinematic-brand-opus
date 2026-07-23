
-- ────────── 1. Newsletter preview window ──────────
ALTER TABLE public.newsletter_sends
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'sent',
  ADD COLUMN IF NOT EXISTS intro TEXT,
  ADD COLUMN IF NOT EXISTS post_blurbs JSONB,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE OR REPLACE FUNCTION public.validate_newsletter_send_status()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.status NOT IN ('preview', 'sent', 'cancelled') THEN
    RAISE EXCEPTION 'Invalid newsletter_sends status: %', NEW.status;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_newsletter_send_status ON public.newsletter_sends;
CREATE TRIGGER validate_newsletter_send_status
  BEFORE INSERT OR UPDATE ON public.newsletter_sends
  FOR EACH ROW EXECUTE FUNCTION public.validate_newsletter_send_status();

DROP TRIGGER IF EXISTS update_newsletter_sends_updated_at ON public.newsletter_sends;
CREATE TRIGGER update_newsletter_sends_updated_at
  BEFORE UPDATE ON public.newsletter_sends
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP POLICY IF EXISTS "Admins update newsletter_sends" ON public.newsletter_sends;
CREATE POLICY "Admins update newsletter_sends" ON public.newsletter_sends
  FOR UPDATE TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- ────────── 2. Move strategy config to admin-only private table ──────────
ALTER TABLE public.site_settings_private
  ADD COLUMN IF NOT EXISTS voice_profile TEXT,
  ADD COLUMN IF NOT EXISTS banned_phrases TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS default_expert_pov TEXT,
  ADD COLUMN IF NOT EXISTS auto_publish_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS auto_publish_daily_cap INT NOT NULL DEFAULT 8,
  ADD COLUMN IF NOT EXISTS auto_publish_min_quality INT NOT NULL DEFAULT 85;

DO $$
DECLARE
  pub RECORD;
  priv_id UUID;
BEGIN
  SELECT id, voice_profile, banned_phrases, default_expert_pov,
         auto_publish_enabled, auto_publish_daily_cap, auto_publish_min_quality
    INTO pub
    FROM public.site_settings
    ORDER BY updated_at NULLS LAST
    LIMIT 1;
  IF pub.id IS NULL THEN RETURN; END IF;

  SELECT id INTO priv_id FROM public.site_settings_private LIMIT 1;
  IF priv_id IS NULL THEN
    INSERT INTO public.site_settings_private
      (voice_profile, banned_phrases, default_expert_pov,
       auto_publish_enabled, auto_publish_daily_cap, auto_publish_min_quality)
    VALUES
      (pub.voice_profile,
       COALESCE(pub.banned_phrases, '{}'),
       pub.default_expert_pov,
       COALESCE(pub.auto_publish_enabled, true),
       COALESCE(pub.auto_publish_daily_cap, 8),
       COALESCE(pub.auto_publish_min_quality, 85));
  ELSE
    UPDATE public.site_settings_private SET
      voice_profile            = pub.voice_profile,
      banned_phrases           = COALESCE(pub.banned_phrases, '{}'),
      default_expert_pov       = pub.default_expert_pov,
      auto_publish_enabled     = COALESCE(pub.auto_publish_enabled, true),
      auto_publish_daily_cap   = COALESCE(pub.auto_publish_daily_cap, 8),
      auto_publish_min_quality = COALESCE(pub.auto_publish_min_quality, 85)
    WHERE id = priv_id;
  END IF;
END $$;

-- Drop the strategy columns from the public row so anonymous readers can no longer see them.
ALTER TABLE public.site_settings
  DROP COLUMN IF EXISTS voice_profile,
  DROP COLUMN IF EXISTS banned_phrases,
  DROP COLUMN IF EXISTS default_expert_pov,
  DROP COLUMN IF EXISTS auto_publish_enabled,
  DROP COLUMN IF EXISTS auto_publish_daily_cap,
  DROP COLUMN IF EXISTS auto_publish_min_quality;

-- ────────── 3. Restrict niches public read to active rows only ──────────
DROP POLICY IF EXISTS "Anyone can read niches" ON public.niches;
CREATE POLICY "Public reads active niches" ON public.niches
  FOR SELECT TO public
  USING (is_active = true);

-- ────────── 4. Recompute reading_time for all posts ──────────
UPDATE public.posts SET
  reading_time = GREATEST(1, CEIL(
    CARDINALITY(
      regexp_split_to_array(
        btrim(regexp_replace(COALESCE(content, ''), '<[^>]*>', ' ', 'g')),
        '\s+'
      )
    )::numeric / 200
  )::int)
WHERE content IS NOT NULL AND length(btrim(content)) > 0;

-- ────────── 5. Remove unused BARA test category ──────────
DELETE FROM public.categories WHERE slug = 'bara';
