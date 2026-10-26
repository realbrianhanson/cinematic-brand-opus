-- Unfinished call funnel applications. Contact details come first, so a
-- visitor who stops partway is still a lead: the owner gets an alert and the
-- visitor gets one reminder to finish. Only the service role touches this table.
create table if not exists public.call_funnel_partials (
  id uuid primary key default gen_random_uuid(),
  funnel_id uuid not null references public.call_funnels(id) on delete cascade,
  revision integer not null,
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  contact jsonb not null,
  answers jsonb not null default '{}'::jsonb,
  marketing_consent boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  owner_alerted_at timestamptz,
  reminder_sent_at timestamptz
);
alter table public.call_funnel_partials enable row level security;
create index if not exists call_partials_pending_idx
  on public.call_funnel_partials(updated_at)
  where owner_alerted_at is null or reminder_sent_at is null;

-- Saves (or updates) an unfinished application. Answers may be partial but
-- must belong to the published revision's questions.
create or replace function public.call_funnel_capture(_slug text,_revision integer,_token_hash text,_contact jsonb,_answers jsonb,_marketing boolean) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare f call_funnels; r call_funnel_revisions; q jsonb; answer jsonb; k text;
begin
 if coalesce(_token_hash,'') !~ '^[a-f0-9]{64}$' or _revision is null or _revision<1 then raise exception 'Invalid application request'; end if;
 perform pg_advisory_xact_lock(hashtextextended(_token_hash,24));
 select * into f from call_funnels where slug=_slug and active;
 if not found then raise exception 'Call funnel unavailable'; end if;
 select * into r from call_funnel_revisions where funnel_id=f.id and version=_revision and published;
 if not found then raise exception 'Published revision unavailable'; end if;
 if not call_funnel_shape(_contact,array['name','email']) or not call_funnel_text(_contact->'name',160,true) or not call_funnel_text(_contact->'email',254,true) or coalesce(_contact->>'email','') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or jsonb_typeof(_answers) is distinct from 'object' or (select count(*) from jsonb_object_keys(_answers))>15 then raise exception 'Invalid application details'; end if;
 for k in select jsonb_object_keys(_answers) loop
  select value into q from jsonb_array_elements(r.config->'questions') where value->>'id'=k;
  if q is null then raise exception 'Unexpected application answer'; end if;
  answer:=_answers->k;
  if not call_funnel_text(answer,2000,false) then raise exception 'Invalid application answer'; end if;
  if q->>'type'='single' and answer<>'""'::jsonb and not exists(select 1 from jsonb_array_elements(q->'options') where value->>'id'=answer#>>'{}') then raise exception 'Invalid application choice'; end if;
 end loop;
 insert into call_funnel_partials(funnel_id,revision,token_hash,contact,answers,marketing_consent)
  values(f.id,r.version,_token_hash,_contact,_answers,coalesce(_marketing,false))
 on conflict(token_hash) do update set revision=excluded.revision,contact=excluded.contact,answers=excluded.answers,marketing_consent=excluded.marketing_consent,updated_at=now()
  where call_funnel_partials.funnel_id=excluded.funnel_id;
 return jsonb_build_object('saved',true);
end $$;
revoke execute on function public.call_funnel_capture(text,integer,text,jsonb,jsonb,boolean) from public, anon, authenticated;
grant execute on function public.call_funnel_capture(text,integer,text,jsonb,jsonb,boolean) to service_role;

-- Unfinished applications are kept for 30 days.
DO $$
BEGIN
  IF to_regclass('cron.job') IS NULL THEN RETURN; END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'call-funnel-partials-retention') THEN
    PERFORM cron.unschedule('call-funnel-partials-retention');
  END IF;
  PERFORM cron.schedule('call-funnel-partials-retention', '53 4 * * *',
    $cmd$ DELETE FROM public.call_funnel_partials WHERE updated_at < now() - interval '30 days' $cmd$);
END $$;
