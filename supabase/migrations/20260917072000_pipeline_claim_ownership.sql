-- Serialize budget reservations and fence abandoned workers from newer claims.
alter table public.content_opportunities add column if not exists claim_token uuid, add column if not exists claim_started boolean not null default false;
alter table public.posts add column if not exists draft_claim_token uuid, add column if not exists auto_scheduled_at timestamptz;
update public.posts set auto_scheduled_at=updated_at where opportunity_id is not null and status in ('scheduled','published') and auto_scheduled_at is null;

drop function public.content_claim_opportunities(integer,integer,integer,integer);
create function public.content_claim_opportunities(_max integer,_daily_cap integer,_max_attempts integer default 3,_stale_seconds integer default 600)
returns table(id uuid,attempts integer,claim_token uuid)
language plpgsql security definer set search_path=public as $$
declare used integer; budget integer;
begin
  perform pg_advisory_xact_lock(hashtext('content-draft-budget'));
  update public.content_opportunities o set status='proposed',claim_token=null,claim_started=false
    where status='drafting' and (last_attempt_at is null or last_attempt_at<now()-make_interval(secs=>greatest(_stale_seconds,600)));
  select (select count(*) from public.posts p where p.opportunity_id is not null and p.created_at>now()-interval '24 hours')
    + (select count(*) from public.content_opportunities o where o.status='drafting' and not exists(select 1 from public.posts p where p.opportunity_id=o.id)) into used;
  budget:=least(greatest(coalesce(_max,0),0),greatest(coalesce(_daily_cap,0)-used,0));
  if budget=0 then return; end if;
  return query update public.content_opportunities o set status='drafting',attempts=o.attempts+1,last_attempt_at=now(),claim_token=gen_random_uuid(),claim_started=false
    where o.id in(select c.id from public.content_opportunities c where c.status='proposed' and c.attempts<_max_attempts order by c.opportunity_score desc,c.id limit budget for update skip locked)
    returning o.id,o.attempts,o.claim_token;
end $$;

-- A reserved token may be started once. A manual run obtains a fresh reservation.
create function public.content_start_draft(_id uuid,_token uuid default null)
returns table(id uuid,attempts integer,claim_token uuid)
language plpgsql security definer set search_path=public as $$
begin
  perform pg_advisory_xact_lock(hashtext('content-draft-budget'));
  if _token is not null then
    return query update public.content_opportunities o set claim_started=true,last_attempt_at=now()
      where o.id=_id and o.claim_token=_token and not o.claim_started and o.status='drafting' and o.last_attempt_at>now()-interval '10 minutes'
      returning o.id,o.attempts,o.claim_token;
  else
    return query update public.content_opportunities o set status='drafting',attempts=o.attempts+1,claim_token=gen_random_uuid(),claim_started=true,last_attempt_at=now()
      where o.id=_id and o.status='proposed' and o.attempts<3
      returning o.id,o.attempts,o.claim_token;
  end if;
end $$;

create function public.check_draft_claim_owner() returns trigger language plpgsql security definer set search_path=public as $$
declare token uuid; state text;
begin
  if new.opportunity_id is not null then
    select o.claim_token,o.status into token,state from public.content_opportunities o where o.id=new.opportunity_id for update;
    if token is not null and (token is distinct from new.draft_claim_token or state<>'drafting') then raise exception 'Draft claim lost'; end if;
  end if;
  return new;
end $$;
create trigger check_draft_claim_owner before insert on public.posts for each row execute function public.check_draft_claim_owner();

-- Scheduling budget, quality recheck, slot selection and transition are one transaction.
create function public.content_schedule_checked(_post_id uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare p public.posts; cfg public.site_settings_private; used integer; slot timestamptz; fc jsonb;
begin
  perform pg_advisory_xact_lock(hashtext('content-publish-budget'));
  select * into cfg from public.site_settings_private limit 1;
  if not found or cfg.auto_publish_enabled is not true then return jsonb_build_object('decision','skipped','reason','auto-publish disabled'); end if;
  select * into p from public.posts where id=_post_id for update;
  if not found or p.status<>'draft' or p.opportunity_id is null then return jsonb_build_object('decision','skipped','reason','not a pipeline draft'); end if;
  fc:=p.fact_check;
  if p.quality_score is null or p.quality_score<coalesce(cfg.auto_publish_min_quality,85) or p.quality_score>100
    or coalesce(jsonb_typeof(to_jsonb(p.lint_flags)),'null') not in ('null','array')
    or coalesce(nullif(to_jsonb(p.lint_flags),'null'::jsonb),'[]'::jsonb)<>'[]'::jsonb
    or jsonb_typeof(fc->'claims') is distinct from 'array'
    or jsonb_typeof(fc->'verified_count') is distinct from 'number'
    or jsonb_typeof(fc->'unverified_count') is distinct from 'number'
    or jsonb_typeof(fc->'contradicted_count') is distinct from 'number'
  then return jsonb_build_object('decision','queued','reason','quality or fact-check incomplete'); end if;
  if jsonb_array_length(fc->'claims')<2 or (fc->>'verified_count')::numeric<2
    or (fc->>'verified_count')::numeric<>trunc((fc->>'verified_count')::numeric)
    or (fc->>'unverified_count')::numeric<>trunc((fc->>'unverified_count')::numeric)
    or (fc->>'unverified_count')::numeric not between 0 and 2 or (fc->>'contradicted_count')::numeric<>0
  then return jsonb_build_object('decision','queued','reason','fact-check failed'); end if;
  select count(*) into used from public.posts where auto_scheduled_at>now()-interval '24 hours';
  if used>=coalesce(cfg.auto_publish_daily_cap,0) then return jsonb_build_object('decision','queued','reason','daily cap reached'); end if;
  select greatest(now()+interval '10 minutes',coalesce(max(scheduled_at)+interval '90 minutes',now())) into slot from public.posts where status='scheduled';
  update public.posts set status='scheduled',scheduled_at=slot,auto_scheduled_at=now() where id=p.id;
  update public.content_opportunities set status='approved' where id=p.opportunity_id;
  return jsonb_build_object('decision','scheduled','scheduled_at',slot);
end $$;
revoke all on function public.content_claim_opportunities(integer,integer,integer,integer),public.content_start_draft(uuid,uuid),public.content_schedule_checked(uuid) from public,anon,authenticated;
grant execute on function public.content_claim_opportunities(integer,integer,integer,integer),public.content_start_draft(uuid,uuid),public.content_schedule_checked(uuid) to service_role;
