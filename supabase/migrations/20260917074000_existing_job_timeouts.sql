-- Reproduce the operational timeout repair without copying URLs, credentials,
-- schedules, active flags, or owner jobs into a member's empty installation.
do $$ declare j record; replacement text; begin
  if to_regclass('cron.job') is null then return; end if;
  for j in select jobid,command from cron.job where jobname in (
    'publish-scheduled-posts-15min','check-content-freshness-daily',
    'refresh-stale-content-weekly','submit-indexnow-daily','weekly-report-monday',
    'gsc-sync-weekly','autonomous-content-pipeline-30min','poll-sources-every-4h',
    'send-weekly-newsletter-tuesday','compose-weekly-newsletter-preview'
  ) and command like '%net.http_post(%' loop
    if j.command ~ 'timeout_milliseconds\s*:=' then
      replacement:=regexp_replace(j.command,'timeout_milliseconds\s*:=\s*[0-9]+','timeout_milliseconds := 120000','g');
    else
      replacement:=replace(j.command,'net.http_post(','net.http_post(timeout_milliseconds := 120000, ');
    end if;
    if replacement is distinct from j.command then perform cron.alter_job(j.jobid,command:=replacement); end if;
  end loop;
end $$;
