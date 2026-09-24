-- Run only in the intended project's SQL editor after deploying its worker.
-- Replace this placeholder with THAT project's trusted Supabase URL.
-- The script refuses to run with the placeholder or a non-Supabase destination.
DO $$
DECLARE
  project_url text := 'https://YOUR_PROJECT_REF.supabase.co';
BEGIN
  IF project_url !~ '^https://[a-z0-9]{20}\.supabase\.co$' THEN
    RAISE EXCEPTION 'Set project_url to this project''s trusted Supabase URL first';
  END IF;
  IF to_regclass('cron.job') IS NULL OR to_regclass('vault.decrypted_secrets') IS NULL THEN
    RAISE EXCEPTION 'Configure pg_cron, pg_net and Vault before installing the worker schedule';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='net' AND p.proname='http_post') THEN
    RAISE EXCEPTION 'Configure pg_net before installing the worker schedule';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM vault.decrypted_secrets WHERE name='CRON_INVOCATION_SECRET') THEN
    RAISE EXCEPTION 'Configure this project''s CRON_INVOCATION_SECRET in Vault first';
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname='speaking-notifications-15min') THEN
    PERFORM cron.unschedule('speaking-notifications-15min');
  END IF;
  PERFORM cron.schedule('speaking-notifications-15min', '*/15 * * * *', format($cmd$
    SELECT net.http_post(timeout_milliseconds := 120000,
      url := %L,
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret',
        (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='CRON_INVOCATION_SECRET' LIMIT 1)),
      body := '{}'::jsonb)
    WHERE coalesce((SELECT speaking_notifications_enabled FROM public.site_settings_private ORDER BY id LIMIT 1), false);
  $cmd$, project_url || '/functions/v1/process-speaking-notifications'));
END $$;
