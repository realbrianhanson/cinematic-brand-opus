-- Durable audience/content snapshots. Provider uncertainty never automatically retries.
alter table public.newsletter_sends
  add column if not exists delivery_template jsonb,
  add column if not exists delivery_lease uuid,
  add column if not exists delivery_lease_until timestamptz;

create table if not exists public.newsletter_deliveries (
  id uuid primary key default gen_random_uuid(),
  send_id uuid not null references public.newsletter_sends(id),
  subscriber_id uuid not null references public.newsletter_subscribers(id),
  email text not null,
  confirm_token uuid not null,
  status text not null default 'pending' check (status in ('pending','attempting','accepted','skipped','failed','uncertain')),
  attempt_id uuid,
  attempted_at timestamptz,
  provider_id text,
  detail text,
  unique (send_id, subscriber_id)
);
alter table public.newsletter_deliveries enable row level security;
revoke all on public.newsletter_deliveries from anon, authenticated;
grant select on public.newsletter_deliveries to authenticated;
grant all on public.newsletter_deliveries to service_role;
create policy "Admins inspect newsletter receipts" on public.newsletter_deliveries for select to authenticated using (public.is_admin(auth.uid()));
create index newsletter_deliveries_pending on public.newsletter_deliveries(send_id,status,id);

create or replace function public.validate_newsletter_send_status()
returns trigger language plpgsql set search_path=public as $$
begin
  if new.status not in ('preview','sending','sent','cancelled','needs_review') then
    raise exception 'Invalid newsletter status: %',new.status;
  end if;
  return new;
end $$;

create or replace function public.newsletter_prepare_delivery(_send_id uuid, _lease uuid, _template jsonb, _expected_updated_at timestamptz)
returns jsonb language plpgsql security definer set search_path=public as $$
declare s public.newsletter_sends; n integer;
begin
  select * into s from public.newsletter_sends where id=_send_id for update;
  if not found then raise exception 'Newsletter not found'; end if;
  if s.status in ('sent','cancelled','needs_review') then return null; end if;
  if s.status='sending' and s.delivery_lease_until>now() then return null; end if;
  -- Legacy sends have no durable record of accepted recipients. Never replay them.
  if (s.status='sending' and s.delivery_template is null)
     or exists(select 1 from public.newsletter_deliveries where send_id=s.id and status in ('attempting','uncertain','failed')) then
    update public.newsletter_sends set status='needs_review' where id=s.id;
    return null;
  end if;
  if s.status='preview' and s.updated_at is distinct from _expected_updated_at then
    raise exception 'Preview changed before delivery; reload';
  end if;
  if s.delivery_template is null then
    if _template is null or coalesce(_template->>'html','')='' or coalesce(_template->>'subject','')='' then
      raise exception 'Missing newsletter snapshot';
    end if;
    insert into public.newsletter_deliveries(send_id,subscriber_id,email,confirm_token)
      select s.id,id,email,confirm_token from public.newsletter_subscribers where status='confirmed';
    get diagnostics n = row_count;
    update public.newsletter_sends set delivery_template=_template,recipient_count=n where id=s.id;
  end if;
  update public.newsletter_sends set status='sending',delivery_lease=_lease,
    delivery_lease_until=now()+interval '5 minutes',claimed_at=now() where id=s.id;
  return jsonb_build_object('id',s.id,'ready',true);
end $$;

create or replace function public.newsletter_next_delivery_batch(_send_id uuid, _lease uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare s public.newsletter_sends; batch uuid:=gen_random_uuid(); recipients jsonb; accepted integer;
begin
  select * into s from public.newsletter_sends where id=_send_id for update;
  if not found or s.status<>'sending' or s.delivery_lease is distinct from _lease or s.delivery_lease_until<=now() then
    raise exception 'Newsletter lease lost';
  end if;
  if exists(select 1 from public.newsletter_deliveries where send_id=s.id and status in ('attempting','failed','uncertain')) then
    raise exception 'Previous delivery requires reconciliation';
  end if;
  -- Recheck suppression and identity immediately before claiming an attempt.
  update public.newsletter_deliveries d set status='skipped',detail='Subscription changed before delivery'
    where d.send_id=s.id and d.status='pending' and not exists(
      select 1 from public.newsletter_subscribers u where u.id=d.subscriber_id
        and u.status='confirmed' and u.email=d.email and u.confirm_token=d.confirm_token);
  with selected as (
    select id from public.newsletter_deliveries where send_id=s.id and status='pending' order by id limit 100
  ), claimed as (
    update public.newsletter_deliveries d set status='attempting',attempt_id=batch,attempted_at=now()
      where d.id in(select id from selected) returning d.id,d.email,d.confirm_token
  ) select jsonb_agg(to_jsonb(claimed) order by id) into recipients from claimed;
  if recipients is null then
    select count(*) into accepted from public.newsletter_deliveries where send_id=s.id and status='accepted';
    update public.newsletter_sends set status='sent',sent_count=accepted,delivery_lease_until=null where id=s.id;
    return null;
  end if;
  update public.newsletter_sends set delivery_lease_until=now()+interval '5 minutes' where id=s.id;
  return jsonb_build_object('attempt_id',batch,'template',s.delivery_template,'recipients',recipients);
end $$;

create or replace function public.newsletter_record_delivery(_send_id uuid,_lease uuid,_attempt_id uuid,_outcome text,_provider_ids jsonb default '[]',_detail text default null)
returns void language plpgsql security definer set search_path=public as $$
declare s public.newsletter_sends; n integer;
begin
  select * into s from public.newsletter_sends where id=_send_id for update;
  if not found or s.delivery_lease is distinct from _lease then raise exception 'Newsletter lease lost'; end if;
  if _outcome not in ('accepted','failed','uncertain') then raise exception 'Invalid outcome'; end if;
  select count(*) into n from public.newsletter_deliveries where send_id=s.id and attempt_id=_attempt_id and status='attempting';
  if n=0 then raise exception 'Attempt already recorded or unknown'; end if;
  if _outcome='accepted' and (jsonb_typeof(_provider_ids)<>'array' or jsonb_array_length(_provider_ids)<>n) then
    raise exception 'Provider receipts do not match audience';
  end if;
  with ordered as (
    select id,row_number() over(order by id)-1 as pos from public.newsletter_deliveries
      where send_id=s.id and attempt_id=_attempt_id and status='attempting'
  ) update public.newsletter_deliveries d set status=_outcome,
      provider_id=case when _outcome='accepted' then _provider_ids->>(ordered.pos::integer) else null end,
      detail=left(_detail,500)
    from ordered where d.id=ordered.id;
  update public.newsletter_sends set
    sent_count=(select count(*) from public.newsletter_deliveries where send_id=s.id and status='accepted'),
    status=case when _outcome='accepted' then 'sending' else 'needs_review' end
    where id=s.id;
end $$;

revoke all on function public.newsletter_prepare_delivery(uuid,uuid,jsonb,timestamptz), public.newsletter_next_delivery_batch(uuid,uuid), public.newsletter_record_delivery(uuid,uuid,uuid,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.newsletter_prepare_delivery(uuid,uuid,jsonb,timestamptz), public.newsletter_next_delivery_batch(uuid,uuid), public.newsletter_record_delivery(uuid,uuid,uuid,text,jsonb,text) to service_role;
