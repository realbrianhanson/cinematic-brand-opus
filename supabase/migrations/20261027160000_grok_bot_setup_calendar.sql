-- Brian's team made a GHL calendar for the Grok Bot applications. Its
-- description stays broad, so it reads "Agency & Consulting Application".
DO $$
DECLARE f public.call_funnels; cfg jsonb; v integer;
BEGIN
  SELECT * INTO f FROM public.call_funnels WHERE slug = 'grok-bot-setup';
  IF f.id IS NULL THEN RETURN; END IF;
  cfg := jsonb_set(f.draft_config, '{booking,url}', to_jsonb('https://api.aiforbusiness.com/widget/booking/57itwlvELUyimNvnCqLa'::text));
  IF cfg = f.draft_config THEN RETURN; END IF;
  PERFORM public.call_funnel_config_validate(cfg, true);
  v := f.version + 1;
  UPDATE public.call_funnels SET draft_config = cfg, version = v, published_version = v, updated_at = now() WHERE id = f.id;
  INSERT INTO public.call_funnel_revisions(funnel_id, version, slug, title, config, published) VALUES (f.id, v, f.slug, f.title, cfg, true);
END $$;
