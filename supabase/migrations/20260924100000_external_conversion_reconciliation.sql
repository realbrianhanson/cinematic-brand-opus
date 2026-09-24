-- Provider-confirmed operational facts. No browser identity, contact details,
-- session links, or automatic assumption that external clicks converted.
create table public.external_conversion_outcomes (
  provider text not null,
  record_id text not null,
  outcome text not null check (outcome in ('registration','purchase')),
  destination text not null,
  occurred_at timestamptz not null,
  provider_updated_at timestamptz not null,
  status text not null check (status in ('confirmed','cancelled','refunded')),
  mode text not null check (mode in ('live','test','unknown')),
  amount_minor bigint,
  currency text,
  source text,
  medium text,
  campaign text,
  first_imported_at timestamptz not null default clock_timestamp(),
  last_imported_at timestamptz not null default clock_timestamp(),
  imported_by uuid not null,
  primary key(provider,record_id,outcome)
);
create index external_conversion_period_idx on public.external_conversion_outcomes(occurred_at);
create table public.external_conversion_imports (
  id uuid primary key default gen_random_uuid(),
  reference text not null,
  row_count integer not null,
  inserted integer not null,
  updated integer not null,
  unchanged integer not null,
  stale integer not null,
  imported_at timestamptz not null default clock_timestamp(),
  imported_by uuid not null
);
alter table public.external_conversion_outcomes enable row level security;
alter table public.external_conversion_imports enable row level security;
revoke all on public.external_conversion_outcomes, public.external_conversion_imports from public, anon, authenticated;

create function public.admin_import_external_conversions(_rows jsonb, _reference text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  item jsonb; incoming public.external_conversion_outcomes; previous public.external_conversion_outcomes;
  n integer := 0; added integer := 0; changed integer := 0; same integer := 0; older integer := 0;
  batch_id uuid; actor uuid := auth.uid();
  metadata text[] := array['first_imported_at','last_imported_at','imported_by'];
begin
  if not coalesce(public.is_admin(actor),false) then raise exception 'Admin access required' using errcode='42501'; end if;
  if _reference is null or _reference !~ '^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,79}$' then raise exception 'Use a short export reference without personal information'; end if;
  if _rows is null or jsonb_typeof(_rows) <> 'array' then raise exception 'Expected an array of outcomes'; end if;
  if jsonb_array_length(_rows) < 1 or jsonb_array_length(_rows) > 500 or octet_length(_rows::text) > 262144 then raise exception 'Import 1 to 500 rows, up to 256 KiB'; end if;
  if exists(select 1 from jsonb_array_elements(_rows) r group by r->>'provider',r->>'record_id',r->>'outcome' having count(*) > 1) then raise exception 'Each provider record and outcome may appear only once per import'; end if;
  -- Serialize the bounded imports so same-version conflicts cannot silently win.
  lock table public.external_conversion_outcomes in share row exclusive mode;
  for item in select value from jsonb_array_elements(_rows) loop
    n := n + 1;
    begin
      if jsonb_typeof(item) <> 'object'
        or item - array['provider','record_id','outcome','destination','occurred_at','provider_updated_at','status','mode','amount_minor','currency','source','medium','campaign'] <> '{}'::jsonb
        or not (item ?& array['provider','record_id','outcome','destination','occurred_at','provider_updated_at','status','mode','amount_minor','currency','source','medium','campaign'])
        or exists(select 1 from jsonb_each(item) e where e.key <> 'amount_minor' and jsonb_typeof(e.value) not in ('string','null'))
        or not (coalesce(item->>'provider','') ~ '^[a-z0-9][a-z0-9_-]{0,63}$')
        or not (coalesce(item->>'record_id','') ~ '^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,127}$')
        or not (coalesce(item->>'destination','') ~ '^[a-z0-9][a-z0-9_-]{0,63}$')
        or coalesce(item->>'outcome','') not in ('registration','purchase')
        or coalesce(item->>'status','') not in ('confirmed','cancelled','refunded')
        or coalesce(item->>'mode','') not in ('live','test','unknown')
        or not (coalesce(item->>'occurred_at','') ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$')
        or not (coalesce(item->>'provider_updated_at','') ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$')
        or exists(select 1 from jsonb_each_text(item) e where e.key in ('source','medium','campaign') and e.value is not null and e.value !~ '^[a-z0-9][a-z0-9_-]{0,63}$')
      then raise exception 'Invalid fields'; end if;
      if item->>'outcome' = 'registration' then
        if item->'amount_minor' <> 'null'::jsonb or item->'currency' <> 'null'::jsonb or item->>'status' = 'refunded' then raise exception 'Invalid registration'; end if;
      else
        if jsonb_typeof(item->'amount_minor') <> 'number' or (item->>'amount_minor') !~ '^[0-9]+$'
          or (item->>'amount_minor')::numeric < 1 or (item->>'amount_minor')::numeric > 9000000000000
          or not (coalesce(item->>'currency','') ~ '^[A-Z]{3}$') then raise exception 'Invalid purchase'; end if;
      end if;
      select * into incoming from jsonb_populate_record(null::public.external_conversion_outcomes,item);
      if incoming.occurred_at < '2000-01-01'::timestamptz or incoming.occurred_at > clock_timestamp() + interval '5 minutes'
        or incoming.provider_updated_at < incoming.occurred_at or incoming.provider_updated_at > clock_timestamp() + interval '5 minutes'
      then raise exception 'Invalid provider timestamps'; end if;
    exception when others then
      raise exception 'Invalid import row %. Check the template, dates, status, currency and amounts; remove personal information.',n;
    end;
    select * into previous from public.external_conversion_outcomes
      where provider=incoming.provider and record_id=incoming.record_id and outcome=incoming.outcome;
    if found then
      if incoming.provider_updated_at < previous.provider_updated_at then older := older + 1; continue; end if;
      if (to_jsonb(incoming) - metadata) = (to_jsonb(previous) - metadata) then same := same + 1; continue; end if;
      if incoming.provider_updated_at = previous.provider_updated_at then
        raise exception 'Row % conflicts with a saved record at the same provider update time. Use a newer verified provider correction.',n;
      end if;
      update public.external_conversion_outcomes set
        destination=incoming.destination,occurred_at=incoming.occurred_at,provider_updated_at=incoming.provider_updated_at,
        status=incoming.status,mode=incoming.mode,amount_minor=incoming.amount_minor,currency=incoming.currency,
        source=incoming.source,medium=incoming.medium,campaign=incoming.campaign,
        last_imported_at=clock_timestamp(),imported_by=actor
      where provider=incoming.provider and record_id=incoming.record_id and outcome=incoming.outcome;
      changed := changed + 1;
    else
      insert into public.external_conversion_outcomes(provider,record_id,outcome,destination,occurred_at,provider_updated_at,status,mode,amount_minor,currency,source,medium,campaign,imported_by)
        values(incoming.provider,incoming.record_id,incoming.outcome,incoming.destination,incoming.occurred_at,incoming.provider_updated_at,incoming.status,incoming.mode,incoming.amount_minor,incoming.currency,incoming.source,incoming.medium,incoming.campaign,actor);
      added := added + 1;
    end if;
  end loop;
  insert into public.external_conversion_imports(reference,row_count,inserted,updated,unchanged,stale,imported_by)
    values(_reference,n,added,changed,same,older,actor) returning id into batch_id;
  return jsonb_build_object('id',batch_id,'inserted',added,'updated',changed,'unchanged',same,'stale',older);
end $$;

create function public.admin_external_conversion_snapshot(_days integer default 30)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare start_time timestamptz; end_time timestamptz; result jsonb;
begin
  if not coalesce(public.is_admin(auth.uid()),false) then raise exception 'Admin access required' using errcode='42501'; end if;
  if _days is null or _days not in (7,30,90) then raise exception 'Choose 7, 30 or 90 days'; end if;
  start_time := date_trunc('day',now() at time zone 'UTC') at time zone 'UTC' - make_interval(days => _days - 1);
  end_time := now();
  with period as materialized (
    select * from public.external_conversion_outcomes where occurred_at >= start_time and occurred_at < end_time
  ), active as materialized (
    select * from period where status='confirmed' and mode='live'
  ), grouped as (
    select provider,destination,source,medium,campaign,
      count(*) filter(where outcome='registration') registrations,
      count(*) filter(where outcome='purchase') purchases
    from active group by provider,destination,source,medium,campaign
  )
  select jsonb_build_object(
    'generated_at',now(),'range',jsonb_build_object('start',start_time,'end',end_time,'timezone','UTC'),
    'registrations',(select count(*) from active where outcome='registration'),
    'purchases',(select count(*) from active where outcome='purchase'),
    'excluded_test_or_unknown',(select count(*) from period where mode<>'live'),
    'cancelled_or_refunded',(select count(*) from period where mode='live' and status<>'confirmed'),
    'without_campaign',(select count(*) from active where campaign is null),
    'revenue_by_currency',coalesce((select jsonb_agg(r order by r.currency) from (select currency,sum(amount_minor) amount_minor from active where outcome='purchase' group by currency) r),'[]'::jsonb),
    'campaigns',coalesce((select jsonb_agg(r) from (select * from grouped order by registrations+purchases desc,provider,destination,source nulls last,medium nulls last,campaign nulls last limit 50) r),'[]'::jsonb),
    'campaign_groups',(select count(*) from grouped),
    'imports',coalesce((select jsonb_agg(r) from (select id,reference,row_count,inserted,updated,unchanged,stale,imported_at from public.external_conversion_imports order by imported_at desc limit 10) r),'[]'::jsonb)
  ) into result;
  return result;
end $$;
revoke all on function public.admin_import_external_conversions(jsonb,text) from public, anon;
revoke all on function public.admin_external_conversion_snapshot(integer) from public, anon;
grant execute on function public.admin_import_external_conversions(jsonb,text) to authenticated;
grant execute on function public.admin_external_conversion_snapshot(integer) to authenticated;
