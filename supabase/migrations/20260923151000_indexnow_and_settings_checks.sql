-- IndexNow key + Brand & publishing format checks.
--
-- Audit (2026-09-23): indexing_log had 0 rows with method='indexnow'. The
-- submit-indexnow function returned 409 "no key" before logging anything, the
-- daily cron still showed "succeeded", and the admin card displayed a
-- hard-coded placeholder key. Brand & publishing also saved any URL or email.
--
-- 1. site_settings.indexnow_key: a real key, generated here when absent.
--    IndexNow keys are public by design (they are served at /<key>.txt), but
--    anon gets no column grant: the site reads it only through the exact-match
--    lookup indexnow_key_file(candidate), and the admin through RPCs.
-- 2. admin_indexnow_status(): key + receipt/error summary from indexing_log.
-- 3. NOT VALID CHECK constraints on site_url, publisher_url, cta_url, sender,
--    reply-to and report email. Each is then VALIDATED only when every
--    existing row passes (production values were checked read-only on
--    2026-09-23 and all pass); otherwise it stays NOT VALID and still guards
--    new writes. Patterns match save_site_branding() and the admin form.

alter table public.site_settings add column if not exists indexnow_key text;
alter table public.site_settings
  alter column indexnow_key set default replace(gen_random_uuid()::text, '-', '');
update public.site_settings
set indexnow_key = replace(gen_random_uuid()::text, '-', '')
where indexnow_key is null or indexnow_key !~ '^[A-Za-z0-9-]{8,128}$';

-- Keep the key column out of anon's column allowlist (no-op when not granted).
revoke select (indexnow_key) on public.site_settings from public, anon;

create or replace function public.indexnow_key_file(candidate text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select s.indexnow_key
  from public.site_settings s
  where candidate ~ '^[A-Za-z0-9-]{8,128}$'
    and s.indexnow_key = candidate
  order by s.id
  limit 1
$$;
revoke all on function public.indexnow_key_file(text) from public;
grant execute on function public.indexnow_key_file(text) to anon, authenticated, service_role;

create or replace function public.admin_indexnow_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  last_at timestamptz;
  err record;
begin
  if not coalesce(public.is_admin(auth.uid()), false) then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  -- submit-indexnow stamps every row of one run with the same submitted_at.
  select max(submitted_at) into last_at
  from public.indexing_log
  where method = 'indexnow' and status in ('indexnow_submitted', 'indexnow_pending');
  select submitted_at, error_message into err
  from public.indexing_log
  where method = 'indexnow' and status = 'error'
  order by submitted_at desc nulls last
  limit 1;
  return jsonb_build_object(
    'key', (select indexnow_key from public.site_settings order by id limit 1),
    'received_total', (
      select count(*) from public.indexing_log
      where method = 'indexnow' and status in ('indexnow_submitted', 'indexnow_pending')
    ),
    'last_submission_at', last_at,
    'last_submission_count', (
      select count(*) from public.indexing_log
      where method = 'indexnow'
        and status in ('indexnow_submitted', 'indexnow_pending')
        and submitted_at = last_at
    ),
    'last_error_at', err.submitted_at,
    'last_error', err.error_message
  );
end
$$;
revoke all on function public.admin_indexnow_status() from public, anon;
grant execute on function public.admin_indexnow_status() to authenticated;

create index if not exists indexing_log_method_status_submitted_idx
  on public.indexing_log (method, status, submitted_at desc);

-- Format checks. Drop-then-add keeps the migration re-runnable.
alter table public.site_settings
  drop constraint if exists site_settings_indexnow_key_format,
  drop constraint if exists site_settings_site_url_https,
  drop constraint if exists site_settings_publisher_url_https,
  drop constraint if exists site_settings_cta_url_format,
  drop constraint if exists site_settings_newsletter_from_format,
  drop constraint if exists site_settings_newsletter_reply_to_format;
alter table public.site_settings_private
  drop constraint if exists site_settings_private_report_email_format;

alter table public.site_settings
  add constraint site_settings_indexnow_key_format
    check (indexnow_key is null or indexnow_key ~ '^[A-Za-z0-9-]{8,128}$') not valid,
  add constraint site_settings_site_url_https
    check (site_url ~ '^https://[^/[:space:]]+$') not valid,
  add constraint site_settings_publisher_url_https
    check (publisher_url is null or publisher_url = ''
      or publisher_url ~ '^https://[^/[:space:]]+(/[^[:space:]]*)?$') not valid,
  add constraint site_settings_cta_url_format
    check (cta_url is null or cta_url = ''
      or cta_url ~ '^(https://[^[:space:]]+|/([^/[:space:]][^[:space:]]*)?)$') not valid,
  add constraint site_settings_newsletter_from_format
    check (newsletter_from_address is null or newsletter_from_address ~
      '^[[:space:]]*([^<>]{1,80}<[[:space:]]*[^[:space:]@<>]+@[^[:space:]@<>]+\.[^[:space:]@<>]+[[:space:]]*>|[^[:space:]@<>]+@[^[:space:]@<>]+\.[^[:space:]@<>]+)[[:space:]]*$') not valid,
  add constraint site_settings_newsletter_reply_to_format
    check (newsletter_reply_to is null or (length(newsletter_reply_to) <= 254
      and newsletter_reply_to ~ '^[^[:space:]@<>]+@[^[:space:]@<>]+\.[^[:space:]@<>]+$')) not valid;

alter table public.site_settings_private
  add constraint site_settings_private_report_email_format
    check (report_email is null or report_email = '' or (length(report_email) <= 254
      and report_email ~ '^[^[:space:]@<>]+@[^[:space:]@<>]+\.[^[:space:]@<>]+$')) not valid;

-- Validate each check only when existing rows already pass it.
do $$
declare
  c record;
begin
  for c in
    select conrelid::regclass as tbl, conname
    from pg_constraint
    where contype = 'c'
      and not convalidated
      and conname in (
        'site_settings_indexnow_key_format',
        'site_settings_site_url_https',
        'site_settings_publisher_url_https',
        'site_settings_cta_url_format',
        'site_settings_newsletter_from_format',
        'site_settings_newsletter_reply_to_format',
        'site_settings_private_report_email_format'
      )
  loop
    begin
      execute format('alter table %s validate constraint %I', c.tbl, c.conname);
    exception when check_violation then
      raise notice 'Left % NOT VALID: existing rows need fixing in Brand & publishing', c.conname;
    end;
  end loop;
end
$$;
