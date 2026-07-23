
-- #1: Cron secret accessor
CREATE OR REPLACE FUNCTION public.get_cron_invocation_secret()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'CRON_INVOCATION_SECRET' LIMIT 1
$$;

REVOKE EXECUTE ON FUNCTION public.get_cron_invocation_secret() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_cron_invocation_secret() FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_cron_invocation_secret() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_cron_invocation_secret() TO service_role;

-- #3: Lock down niches column exposure to anon
REVOKE SELECT ON public.niches FROM anon;
GRANT SELECT (id, name, slug, is_active) ON public.niches TO anon;
