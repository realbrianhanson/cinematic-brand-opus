-- Brian wants the Grok hero video to open on his smile at 0:00. The 2-second
-- poster caught him mid-word, so the poster is dropped and the #t fragment
-- makes browsers (iOS Safari too) show the very first frame.
DO $$
DECLARE f public.call_funnels; cfg jsonb; v integer;
BEGIN
  SELECT * INTO f FROM public.call_funnels WHERE slug = 'grok-bot-setup';
  IF f.id IS NULL THEN RETURN; END IF;
  cfg := jsonb_set(f.draft_config, '{invitation,video}', jsonb_build_object(
    'url', 'https://brianhanson.com/videos/grok-bot-setup.mp4#t=0.001',
    'poster', '',
    'transcript', ''));
  IF cfg = f.draft_config THEN RETURN; END IF;
  PERFORM public.call_funnel_config_validate(cfg, true);
  v := f.version + 1;
  UPDATE public.call_funnels SET draft_config = cfg, version = v, published_version = v, updated_at = now() WHERE id = f.id;
  INSERT INTO public.call_funnel_revisions(funnel_id, version, slug, title, config, published) VALUES (f.id, v, f.slug, f.title, cfg, true);
END $$;
