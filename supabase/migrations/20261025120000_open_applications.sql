-- Every applicant books a call; sales screens them on the call instead of a budget cap.
DO $$
DECLARE f public.call_funnels; cfg jsonb; v integer;
BEGIN
  SELECT * INTO f FROM public.call_funnels WHERE slug = 'work-with-brian';
  IF f.id IS NULL OR jsonb_array_length(coalesce(f.draft_config->'qualificationRules','[]')) = 0 THEN RETURN; END IF;
  cfg := jsonb_set(f.draft_config, '{qualificationRules}', '[]'::jsonb);
  PERFORM public.call_funnel_config_validate(cfg, true);
  v := f.version + 1;
  UPDATE public.call_funnels SET draft_config = cfg, version = v, published_version = v, updated_at = now() WHERE id = f.id;
  INSERT INTO public.call_funnel_revisions(funnel_id, version, slug, title, config, published) VALUES (f.id, v, f.slug, f.title, cfg, true);
END $$;
