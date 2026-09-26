-- New clients carry the versions they actually edited. Keep the old branding
-- RPC available for the deployed frontend, including its validation/history.
CREATE OR REPLACE FUNCTION public.admin_save_site_branding(
  _value jsonb,
  _expected_branding_updated_at timestamptz,
  _expected_settings_updated_at timestamptz
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE branding_version timestamptz; settings_version timestamptz;
BEGIN
  IF NOT coalesce(public.is_admin(auth.uid()),false) THEN
    RAISE EXCEPTION 'Administrator access required' USING ERRCODE='42501';
  END IF;
  -- Table locks also protect the absent singleton and legacy writes. The
  -- ordering matches the legacy function's branding-then-settings writes.
  LOCK TABLE public.site_branding IN SHARE ROW EXCLUSIVE MODE;
  LOCK TABLE public.site_settings IN SHARE ROW EXCLUSIVE MODE;
  IF (SELECT count(*) FROM public.site_settings) <> 1 THEN
    RAISE EXCEPTION 'Initialize one site settings record before setup';
  END IF;
  SELECT updated_at INTO branding_version FROM public.site_branding WHERE id;
  SELECT updated_at INTO settings_version FROM public.site_settings;
  IF branding_version IS DISTINCT FROM _expected_branding_updated_at
     OR settings_version IS DISTINCT FROM _expected_settings_updated_at THEN
    RAISE EXCEPTION 'Site settings changed in another session. Your draft is still here. Reload the saved version before applying changes.' USING ERRCODE='40001';
  END IF;
  PERFORM public.save_site_branding(_value);
  RETURN jsonb_build_object('saved',true,
    'branding_updated_at',(SELECT updated_at FROM public.site_branding WHERE id),
    'settings_updated_at',(SELECT updated_at FROM public.site_settings));
END $$;
REVOKE ALL ON FUNCTION public.admin_save_site_branding(jsonb,timestamptz,timestamptz) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_save_site_branding(jsonb,timestamptz,timestamptz) TO authenticated;

-- Ensure a successful write always advances its token, even twice in one
-- transaction. Redirect usage counters intentionally do not change the edit
-- token: traffic must not conflict with configuration edits.
CREATE OR REPLACE FUNCTION public.admin_configuration_version() RETURNS trigger
LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
  NEW.updated_at := greatest(clock_timestamp(),coalesce(OLD.updated_at,'-infinity'::timestamptz)+interval '1 microsecond');
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.admin_configuration_version() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER zz_admin_widget_version BEFORE UPDATE ON public.widget_config
FOR EACH ROW EXECUTE FUNCTION public.admin_configuration_version();
CREATE TRIGGER zz_admin_branding_version BEFORE UPDATE ON public.site_branding
FOR EACH ROW EXECUTE FUNCTION public.admin_configuration_version();
CREATE TRIGGER zz_admin_settings_version BEFORE UPDATE ON public.site_settings
FOR EACH ROW EXECUTE FUNCTION public.admin_configuration_version();
CREATE TRIGGER zz_admin_content_offer_version BEFORE UPDATE ON public.content_offer_routes
FOR EACH ROW EXECUTE FUNCTION public.admin_configuration_version();
CREATE TRIGGER zz_admin_redirect_version BEFORE UPDATE OF from_path,to_path,status_code,is_active,note ON public.redirect_rules
FOR EACH ROW EXECUTE FUNCTION public.admin_configuration_version();
