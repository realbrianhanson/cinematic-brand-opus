-- Newsletter delivery truth.
--  * A send is 'sent' only when every eligible recipient was accepted by the
--    provider. Nobody reached -> 'failed'. Some reached -> 'needs_review'.
--  * The provider HTTP status and a short error body are kept per send and per
--    delivery so the admin can say why a send failed.
--  * Admins can retry recipients the provider definitively rejected (4xx).
--    Uncertain attempts (timeouts, 5xx, missing receipts) are never replayed.
--  * Admins read the audience through a token-free SECURITY DEFINER RPC.
--  * One-time correction of 2026-W34..W38, which were recorded as 'sent'
--    while zero (or too few) recipients were delivered.
-- Safe to re-run.

alter table public.newsletter_sends
  add column if not exists last_error text,
  add column if not exists last_error_status integer,
  add column if not exists last_error_at timestamptz;
alter table public.newsletter_deliveries
  add column if not exists provider_status integer;

create or replace function public.validate_newsletter_send_status()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.status not in ('preview','sending','sent','failed','cancelled','needs_review') then
    raise exception 'Invalid newsletter status: %', new.status;
  end if;
  return new;
end $$;

-- Final state once no deliveries are pending. Internal: called only by the
-- delivery RPCs below, never exposed to API roles.
create or replace function public.newsletter_settle_send(_send_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  accepted integer;
  skipped integer;
  total integer;
  final text;
  message text;
begin
  select count(*) filter (where status = 'accepted'),
         count(*) filter (where status = 'skipped'),
         count(*)
    into accepted, skipped, total
    from public.newsletter_deliveries where send_id = _send_id;
  if accepted = 0 then
    final := 'failed';
    message := case when total = 0
      then 'No confirmed subscribers when delivery started; nobody was emailed.'
      else 'Every recipient unsubscribed or changed before delivery; nobody was emailed.' end;
  elsif accepted < total - skipped then
    final := 'needs_review';
    message := format('The provider accepted %s of %s eligible recipients.', accepted, total - skipped);
  else
    final := 'sent';
  end if;
  update public.newsletter_sends set
    status = final,
    sent_count = accepted,
    delivery_lease_until = null,
    last_error = case when final = 'sent' then null else message end,
    last_error_status = null,
    last_error_at = case when final = 'sent' then null else now() end
  where id = _send_id;
  return final;
end $$;

create or replace function public.newsletter_prepare_delivery(_send_id uuid, _lease uuid, _template jsonb, _expected_updated_at timestamptz)
returns jsonb language plpgsql security definer set search_path = public as $$
declare s public.newsletter_sends; n integer;
begin
  select * into s from public.newsletter_sends where id = _send_id for update;
  if not found then raise exception 'Newsletter not found'; end if;
  if s.status in ('sent','failed','cancelled','needs_review') then return null; end if;
  if s.status = 'sending' and s.delivery_lease_until > now() then return null; end if;
  -- Legacy sends have no durable record of accepted recipients. Never replay them.
  if (s.status = 'sending' and s.delivery_template is null)
     or exists(select 1 from public.newsletter_deliveries where send_id = s.id and status in ('attempting','uncertain','failed')) then
    update public.newsletter_sends set status = 'needs_review' where id = s.id;
    return null;
  end if;
  if s.status = 'preview' and s.updated_at is distinct from _expected_updated_at then
    raise exception 'Preview changed before delivery; reload';
  end if;
  if s.delivery_template is null then
    if _template is null or coalesce(_template->>'html','') = '' or coalesce(_template->>'subject','') = '' then
      raise exception 'Missing newsletter snapshot';
    end if;
    insert into public.newsletter_deliveries(send_id, subscriber_id, email, confirm_token)
      select s.id, id, email, confirm_token from public.newsletter_subscribers where status = 'confirmed';
    get diagnostics n = row_count;
    update public.newsletter_sends set delivery_template = _template, recipient_count = n where id = s.id;
  end if;
  update public.newsletter_sends set status = 'sending', delivery_lease = _lease,
    delivery_lease_until = now() + interval '5 minutes', claimed_at = now() where id = s.id;
  return jsonb_build_object('id', s.id, 'ready', true);
end $$;

create or replace function public.newsletter_next_delivery_batch(_send_id uuid, _lease uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare s public.newsletter_sends; batch uuid := gen_random_uuid(); recipients jsonb;
begin
  select * into s from public.newsletter_sends where id = _send_id for update;
  if not found or s.status <> 'sending' or s.delivery_lease is distinct from _lease or s.delivery_lease_until <= now() then
    raise exception 'Newsletter lease lost';
  end if;
  if exists(select 1 from public.newsletter_deliveries where send_id = s.id and status in ('attempting','failed','uncertain')) then
    raise exception 'Previous delivery requires reconciliation';
  end if;
  -- Recheck suppression and identity immediately before claiming an attempt.
  update public.newsletter_deliveries d set status = 'skipped', detail = 'Subscription changed before delivery'
    where d.send_id = s.id and d.status = 'pending' and not exists(
      select 1 from public.newsletter_subscribers u where u.id = d.subscriber_id
        and u.status = 'confirmed' and u.email = d.email and u.confirm_token = d.confirm_token);
  with selected as (
    select id from public.newsletter_deliveries where send_id = s.id and status = 'pending' order by id limit 100
  ), claimed as (
    update public.newsletter_deliveries d set status = 'attempting', attempt_id = batch, attempted_at = now()
      where d.id in (select id from selected) returning d.id, d.email, d.confirm_token
  ) select jsonb_agg(to_jsonb(claimed) order by id) into recipients from claimed;
  if recipients is null then
    perform public.newsletter_settle_send(s.id);
    return null;
  end if;
  update public.newsletter_sends set delivery_lease_until = now() + interval '5 minutes' where id = s.id;
  return jsonb_build_object('attempt_id', batch, 'template', s.delivery_template, 'recipients', recipients);
end $$;

-- Adds _provider_status. Old 6-argument callers keep working through the default.
drop function if exists public.newsletter_record_delivery(uuid, uuid, uuid, text, jsonb, text);
create or replace function public.newsletter_record_delivery(
  _send_id uuid, _lease uuid, _attempt_id uuid, _outcome text,
  _provider_ids jsonb default '[]', _detail text default null, _provider_status integer default null)
returns void language plpgsql security definer set search_path = public as $$
declare s public.newsletter_sends; n integer; accepted integer; final text;
begin
  select * into s from public.newsletter_sends where id = _send_id for update;
  if not found or s.delivery_lease is distinct from _lease then raise exception 'Newsletter lease lost'; end if;
  if _outcome not in ('accepted','failed','uncertain') then raise exception 'Invalid outcome'; end if;
  if _provider_status is not null and (_provider_status < 100 or _provider_status > 599) then
    raise exception 'Invalid provider status';
  end if;
  select count(*) into n from public.newsletter_deliveries where send_id = s.id and attempt_id = _attempt_id and status = 'attempting';
  if n = 0 then raise exception 'Attempt already recorded or unknown'; end if;
  if _outcome = 'accepted' and (jsonb_typeof(_provider_ids) <> 'array' or jsonb_array_length(_provider_ids) <> n) then
    raise exception 'Provider receipts do not match audience';
  end if;
  with ordered as (
    select id, row_number() over (order by id) - 1 as pos from public.newsletter_deliveries
      where send_id = s.id and attempt_id = _attempt_id and status = 'attempting'
  ) update public.newsletter_deliveries d set status = _outcome,
      provider_id = case when _outcome = 'accepted' then _provider_ids->>(ordered.pos::integer) else null end,
      provider_status = case when _outcome = 'accepted' then null else _provider_status end,
      detail = left(_detail, 500)
    from ordered where d.id = ordered.id;
  select count(*) into accepted from public.newsletter_deliveries where send_id = s.id and status = 'accepted';
  if _outcome = 'accepted' then
    update public.newsletter_sends set sent_count = accepted, status = 'sending' where id = s.id;
    return;
  end if;
  -- A definite rejection that reached nobody failed; anything else needs a human.
  final := case when _outcome = 'failed' and accepted = 0 and not exists(
      select 1 from public.newsletter_deliveries where send_id = s.id and status in ('uncertain','attempting'))
    then 'failed' else 'needs_review' end;
  update public.newsletter_sends set
    sent_count = accepted,
    status = final,
    delivery_lease_until = null,
    last_error = left(coalesce(_detail, 'Delivery stopped without a provider message.'), 500),
    last_error_status = _provider_status,
    last_error_at = now()
  where id = s.id;
end $$;

-- Admin retry of recipients the provider definitively rejected. Idempotent:
-- a second call while the retry is queued or running changes nothing.
create or replace function public.newsletter_retry_failed_delivery(_send_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare s public.newsletter_sends; blocked integer; failed integer;
begin
  if not coalesce(public.is_admin(auth.uid()), false) then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  select * into s from public.newsletter_sends where id = _send_id for update;
  if not found then raise exception 'Newsletter not found' using errcode = 'P0002'; end if;
  if s.status = 'sending' then
    return jsonb_build_object('ok', true, 'state', 'sending', 'reset', 0);
  end if;
  if s.status not in ('needs_review','failed') then
    return jsonb_build_object('ok', false, 'state', s.status, 'reason', 'not_retryable', 'reset', 0);
  end if;
  if s.delivery_template is null then
    return jsonb_build_object('ok', false, 'state', s.status, 'reason', 'no_receipts', 'reset', 0);
  end if;
  select count(*) filter (where status in ('attempting','uncertain')),
         count(*) filter (where status = 'failed')
    into blocked, failed
    from public.newsletter_deliveries where send_id = s.id;
  if blocked > 0 then
    return jsonb_build_object('ok', false, 'state', s.status, 'reason', 'uncertain_attempts', 'reset', 0, 'uncertain', blocked);
  end if;
  if failed = 0 then
    return jsonb_build_object('ok', false, 'state', s.status, 'reason', 'nothing_to_retry', 'reset', 0);
  end if;
  update public.newsletter_deliveries set status = 'pending', attempt_id = null, attempted_at = null,
      provider_id = null, provider_status = null,
      detail = left('Retry requested after: ' || coalesce(detail, 'provider rejection'), 500)
    where send_id = s.id and status = 'failed';
  -- 'sending' with no lease: newsletter_prepare_delivery takes a fresh lease and
  -- reuses the frozen template, so the audience and content do not change.
  update public.newsletter_sends set status = 'sending', delivery_lease = null, delivery_lease_until = null
    where id = s.id;
  return jsonb_build_object('ok', true, 'state', 'sending', 'reset', failed);
end $$;

-- Admin audience read. Never returns confirm tokens.
create or replace function public.admin_newsletter_audience(
  _search text default null, _status text default null, _limit integer default 50, _offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare term text; pattern text; lim integer; off integer; result jsonb;
begin
  if not coalesce(public.is_admin(auth.uid()), false) then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  if _status is not null and _status not in ('pending','confirmed','unsubscribed','bounced','complained') then
    raise exception 'Unknown subscriber status' using errcode = '22023';
  end if;
  term := nullif(btrim(coalesce(_search, '')), '');
  if term is not null and length(term) > 254 then
    raise exception 'Search is too long' using errcode = '22023';
  end if;
  pattern := '%' || replace(replace(replace(coalesce(term, ''), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  lim := least(greatest(coalesce(_limit, 50), 1), 200);
  off := greatest(coalesce(_offset, 0), 0);
  with filtered as (
    select u.* from public.newsletter_subscribers u
     where (_status is null or u.status = _status)
       and (term is null or u.email ilike pattern or coalesce(u.source, '') ilike pattern)
  ), page as (
    select * from filtered order by created_at desc, id limit lim offset off
  )
  select jsonb_build_object(
    'counts', (select jsonb_build_object(
        'total', count(*),
        'confirmed', count(*) filter (where status = 'confirmed'),
        'pending', count(*) filter (where status = 'pending'),
        'unsubscribed', count(*) filter (where status = 'unsubscribed'),
        'bounced', count(*) filter (where status = 'bounced'),
        'complained', count(*) filter (where status = 'complained'),
        'pending_not_emailed', count(*) filter (where status = 'pending' and last_confirmation_sent_at is null))
      from public.newsletter_subscribers),
    'matching', (select count(*) from filtered),
    'rows', coalesce((select jsonb_agg(jsonb_build_object(
        'id', id, 'email', email, 'status', status, 'source', source,
        'created_at', created_at, 'confirmed_at', confirmed_at,
        'unsubscribed_at', unsubscribed_at,
        'last_confirmation_sent_at', last_confirmation_sent_at,
        'confirmation_send_count', confirmation_send_count)
      order by created_at desc, id) from page), '[]'::jsonb)
  ) into result;
  return result;
end $$;

revoke all on function public.newsletter_settle_send(uuid) from public, anon, authenticated;
revoke all on function public.newsletter_record_delivery(uuid, uuid, uuid, text, jsonb, text, integer) from public, anon, authenticated;
revoke all on function public.newsletter_retry_failed_delivery(uuid) from public, anon;
revoke all on function public.admin_newsletter_audience(text, text, integer, integer) from public, anon;
grant execute on function public.newsletter_settle_send(uuid) to service_role;
grant execute on function public.newsletter_record_delivery(uuid, uuid, uuid, text, jsonb, text, integer) to service_role;
grant execute on function public.newsletter_retry_failed_delivery(uuid) to authenticated, service_role;
grant execute on function public.admin_newsletter_audience(text, text, integer, integer) to authenticated, service_role;

-- Backfill: provider status for existing rejected deliveries and their sends.
update public.newsletter_deliveries
   set provider_status = substring(detail from 'HTTP ([0-9]{3})')::integer
 where status in ('failed','uncertain') and provider_status is null and detail ~ 'HTTP [0-9]{3}';
update public.newsletter_sends s
   set last_error = left(d.detail, 500),
       last_error_status = d.provider_status,
       last_error_at = coalesce(d.attempted_at, now())
  from (select distinct on (send_id) send_id, detail, provider_status, attempted_at
          from public.newsletter_deliveries
         where status in ('failed','uncertain') and detail is not null
         order by send_id, attempted_at desc nulls last) d
 where d.send_id = s.id and s.status = 'needs_review' and s.last_error is null;

-- One-time history correction: 2026-W34..W38 were recorded 'sent' while the
-- provider delivered fewer recipients than the snapshot (0 of 1 in production).
update public.newsletter_sends
   set status = case when sent_count = 0 then 'failed' else 'needs_review' end,
       last_error = format('Recorded as sent, but only %s of %s recipients were delivered. Status corrected by migration 20260923140000.', sent_count, recipient_count),
       last_error_at = now()
 where week_key in ('2026-W34','2026-W35','2026-W36','2026-W37','2026-W38')
   and status = 'sent'
   and recipient_count > 0
   and sent_count >= 0
   and sent_count < recipient_count;
