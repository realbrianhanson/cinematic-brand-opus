-- Hourly schedule for the Jev shadow pilot. Kept separate from the table
-- migration so it can be switched on deliberately. The function itself
-- no-ops after 2026-09-28; unschedule with:
--   SELECT cron.unschedule('jev-shadow-score-hourly');
DO $$
BEGIN
  IF to_regclass('cron.job') IS NULL THEN RETURN; END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'jev-shadow-score-hourly') THEN
    PERFORM cron.unschedule('jev-shadow-score-hourly');
  END IF;
  PERFORM cron.schedule(
    'jev-shadow-score-hourly',
    '17 * * * *',
    $cmd$
  SELECT net.http_post(timeout_milliseconds := 120000,
    url := 'https://pwjdotliwsulqktavyxf.supabase.co/functions/v1/jev-shadow-score',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'CRON_INVOCATION_SECRET' LIMIT 1)
    ),
    body := '{}'::jsonb
  );
  $cmd$
  );
END $$;
