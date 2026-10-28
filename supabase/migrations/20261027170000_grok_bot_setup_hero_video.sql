-- Brian's intro video for the Grok Bot setup page hero. The file ships in
-- public/videos, so this runs after the frontend that serves it is published.
DO $$
DECLARE f public.call_funnels; cfg jsonb; v integer;
BEGIN
  SELECT * INTO f FROM public.call_funnels WHERE slug = 'grok-bot-setup';
  IF f.id IS NULL THEN RETURN; END IF;
  cfg := jsonb_set(f.draft_config, '{invitation,video}', jsonb_build_object(
    'url', 'https://brianhanson.com/videos/grok-bot-setup.mp4',
    'poster', '/videos/grok-bot-setup-poster.jpg',
    'transcript', ''));
  cfg := jsonb_set(cfg, '{invitation,watchPrompt}', to_jsonb('Watch Brian explain it in under 4 minutes'::text));
  IF cfg = f.draft_config THEN RETURN; END IF;
  PERFORM public.call_funnel_config_validate(cfg, true);
  v := f.version + 1;
  UPDATE public.call_funnels SET draft_config = cfg, version = v, published_version = v, updated_at = now() WHERE id = f.id;
  INSERT INTO public.call_funnel_revisions(funnel_id, version, slug, title, config, published) VALUES (f.id, v, f.slug, f.title, cfg, true);
END $$;
