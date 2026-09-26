-- Separate operational Stripe ledger. No customer details, browser attribution,
-- native orders, or manual-import facts are copied into these tables.
-- Forward-only migration: rollback by disabling the adapter and revoking its RPC
-- grants. Retain the ledger; dropping it would discard payment reconciliation.
create table public.external_payment_events (
  provider text not null check (provider = 'stripe'),
  account_id text not null check (account_id ~ '^acct_[A-Za-z0-9]{1,120}$'),
  event_id text not null check (event_id ~ '^evt_[A-Za-z0-9]{1,120}$'),
  mode text not null check (mode in ('live','test')),
  payload_hash text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  event_type text not null check (event_type in (
    'checkout.session.completed','checkout.session.async_payment_succeeded',
    'invoice.payment_succeeded','charge.refunded','refund.created','refund.updated','refund.failed'
  )),
  resolution text not null check (resolution in ('applied','unmapped','unsupported','not_paid')),
  provider_created_at timestamptz not null,
  observed_at timestamptz not null,
  received_at timestamptz not null default clock_timestamp(),
  processed_at timestamptz not null default clock_timestamp(),
  payment_count integer not null check (payment_count between 0 and 20),
  inserted integer not null default 0 check (inserted between 0 and 20),
  updated integer not null default 0 check (updated between 0 and 20),
  unchanged integer not null default 0 check (unchanged between 0 and 20),
  refund_decreases integer not null default 0 check (refund_decreases between 0 and updated),
  primary key (provider,account_id,event_id),
  check ((resolution = 'applied' and payment_count > 0) or (resolution <> 'applied' and payment_count = 0))
);
create index external_payment_events_received_idx
  on public.external_payment_events (received_at desc,provider,account_id,event_id);

create table public.external_payments (
  provider text not null check (provider = 'stripe'),
  account_id text not null check (account_id ~ '^acct_[A-Za-z0-9]{1,120}$'),
  payment_id text not null check (payment_id ~ '^(pi|ch)_[A-Za-z0-9]{1,120}$'),
  charge_id text not null check (charge_id ~ '^ch_[A-Za-z0-9]{1,120}$'),
  mode text not null check (mode in ('live','test')),
  destination text not null check (destination ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
  amount_minor bigint not null check (amount_minor between 1 and 9000000000000),
  refunded_minor bigint not null check (refunded_minor between 0 and amount_minor),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  occurred_at timestamptz not null,
  price_ids text[] not null check (cardinality(price_ids) between 1 and 100),
  first_observed_at timestamptz not null,
  last_observed_at timestamptz not null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  primary key (provider,account_id,payment_id),
  unique (provider,account_id,charge_id),
  check (payment_id not like 'ch_%' or payment_id = charge_id),
  check (first_observed_at <= last_observed_at)
);
create index external_payments_period_idx on public.external_payments (occurred_at,mode);

-- The lease is acquired BEFORE canonical Stripe reads. Its generation survives
-- expiry and release: never delete these rows or reset fences. Observation times
-- and event.created are informational, not a substitute for refresh ordering.
create table public.external_payment_refreshes (
  provider text not null check (provider = 'stripe'),
  account_id text not null check (account_id ~ '^acct_[A-Za-z0-9]{1,120}$'),
  payment_id text not null check (payment_id ~ '^(pi|ch)_[A-Za-z0-9]{1,120}$'),
  mode text not null check (mode in ('live','test')),
  fence bigint not null check (fence > 0),
  lease_until timestamptz,
  primary key (provider,account_id,payment_id)
);

alter table public.external_payment_events enable row level security;
alter table public.external_payments enable row level security;
alter table public.external_payment_refreshes enable row level security;
-- No direct table grants, including to the service role. The bounded definer
-- functions below are the only application interfaces.
revoke all on public.external_payment_events,public.external_payments,public.external_payment_refreshes from public,anon,authenticated,service_role;

create function public.external_payment_acquire_refresh(
  _provider text,_account_id text,_mode text,_payment_id text
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare saved public.external_payment_refreshes;
begin
  if _provider is distinct from 'stripe'
    or not coalesce(_account_id ~ '^acct_[A-Za-z0-9]{1,120}$',false)
    or _mode is null or _mode not in ('live','test')
    or not coalesce(_payment_id ~ '^(pi|ch)_[A-Za-z0-9]{1,120}$',false)
  then raise exception 'Invalid external payment refresh identity' using errcode = '22023'; end if;
  insert into public.external_payment_refreshes(provider,account_id,payment_id,mode,fence,lease_until)
    values (_provider,_account_id,_payment_id,_mode,1,clock_timestamp() + interval '60 seconds')
    on conflict (provider,account_id,payment_id) do nothing;
  if found then return jsonb_build_object('status','acquired','fence','1'); end if;
  -- The insert and row lock serialize simultaneous acquisitions. Busy readers
  -- never get a token and must retry before fetching canonical payment facts.
  select r.* into saved from public.external_payment_refreshes r
    where r.provider = _provider and r.account_id = _account_id and r.payment_id = _payment_id for update;
  if saved.mode <> _mode then raise exception 'External payment refresh mode conflicts with saved mode' using errcode = '23505'; end if;
  if saved.lease_until is not null and saved.lease_until > clock_timestamp() then
    return jsonb_build_object('status','busy');
  end if;
  update public.external_payment_refreshes set fence = saved.fence + 1,lease_until = clock_timestamp() + interval '60 seconds'
    where provider = _provider and account_id = _account_id and payment_id = _payment_id
    returning fence into saved.fence;
  return jsonb_build_object('status','acquired','fence',saved.fence::text);
end $$;

create function public.external_payment_release_refresh(
  _provider text,_account_id text,_mode text,_payment_id text,_fence text
)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if _provider is distinct from 'stripe'
    or not coalesce(_account_id ~ '^acct_[A-Za-z0-9]{1,120}$',false)
    or _mode is null or _mode not in ('live','test')
    or not coalesce(_payment_id ~ '^(pi|ch)_[A-Za-z0-9]{1,120}$',false)
    or not coalesce(_fence ~ '^[1-9][0-9]{0,18}$',false)
  then raise exception 'Invalid external payment refresh identity or fence' using errcode = '22023'; end if;
  if _fence::numeric > 9223372036854775807 then
    raise exception 'Invalid external payment refresh fence' using errcode = '22023';
  end if;
  update public.external_payment_refreshes set lease_until = null
    where provider = _provider and account_id = _account_id and payment_id = _payment_id
      and mode = _mode and fence = _fence::bigint and lease_until is not null;
  return found;
end $$;

create function public.external_payment_event_status(
  _provider text,_account_id text,_mode text,_event_id text,_payload_hash text
)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare saved public.external_payment_events;
begin
  if _provider is distinct from 'stripe'
    or not coalesce(_account_id ~ '^acct_[A-Za-z0-9]{1,120}$',false)
    or _mode is null or _mode not in ('live','test')
    or not coalesce(_event_id ~ '^evt_[A-Za-z0-9]{1,120}$',false)
    or not coalesce(_payload_hash ~ '^[0-9a-f]{64}$',false)
  then raise exception 'Invalid external payment event identity' using errcode = '22023'; end if;
  select e.* into saved from public.external_payment_events e
    where e.provider = _provider and e.account_id = _account_id and e.event_id = _event_id;
  if not found then return jsonb_build_object('status','missing'); end if;
  if saved.mode <> _mode or saved.payload_hash <> _payload_hash then
    return jsonb_build_object('status','conflict');
  end if;
  return jsonb_build_object('status','processed','resolution',saved.resolution,'payment_count',saved.payment_count);
end $$;

create function public.external_payment_apply_event(_event jsonb,_payments jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  incoming_event public.external_payment_events;
  saved_event public.external_payment_events;
  incoming public.external_payments;
  saved public.external_payments;
  refresh public.external_payment_refreshes;
  refresh_fence bigint;
  item jsonb;
  added integer := 0;
  changed integer := 0;
  same integer := 0;
  decreases integer := 0;
  event_inserted boolean;
  payment_inserted boolean;
begin
  -- The adapter verifies signatures, its exact account/mode/price allowlist, and
  -- canonical Stripe objects before this call. SQL validates the minimized shape.
  if _event is null or jsonb_typeof(_event) <> 'object' or octet_length(_event::text) > 4096
    or _event - array['provider','account_id','mode','event_id','payload_hash','event_type','resolution','provider_created_at','observed_at'] <> '{}'::jsonb
    or not (_event ?& array['provider','account_id','mode','event_id','payload_hash','event_type','resolution','provider_created_at','observed_at'])
    or exists (select 1 from jsonb_each(_event) e where jsonb_typeof(e.value) <> 'string')
    or _event->>'provider' <> 'stripe'
    or not ((_event->>'account_id') ~ '^acct_[A-Za-z0-9]{1,120}$')
    or _event->>'mode' not in ('live','test')
    or not ((_event->>'event_id') ~ '^evt_[A-Za-z0-9]{1,120}$')
    or not ((_event->>'payload_hash') ~ '^[0-9a-f]{64}$')
    or _event->>'event_type' not in ('checkout.session.completed','checkout.session.async_payment_succeeded','invoice.payment_succeeded','charge.refunded','refund.created','refund.updated','refund.failed')
    or _event->>'resolution' not in ('applied','unmapped','unsupported','not_paid')
    or not ((_event->>'provider_created_at') ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$')
    or not ((_event->>'observed_at') ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$')
  then raise exception 'Invalid external payment event' using errcode = '22023'; end if;
  begin
    select e.* into incoming_event from jsonb_populate_record(null::public.external_payment_events,_event) e;
    if incoming_event.provider_created_at < '2000-01-01T00:00:00Z'::timestamptz
      or incoming_event.provider_created_at > clock_timestamp() + interval '5 minutes'
      or incoming_event.observed_at < incoming_event.provider_created_at
      or incoming_event.observed_at > clock_timestamp() + interval '5 minutes'
    then raise exception 'Invalid timestamps'; end if;
  exception when others then
    raise exception 'Invalid external payment event timestamps' using errcode = '22023';
  end;
  if _payments is null or jsonb_typeof(_payments) <> 'array' then
    raise exception 'External payments must be an array' using errcode = '22023';
  end if;
  if jsonb_array_length(_payments) > 20 or octet_length(_payments::text) > 262144
    or (incoming_event.resolution = 'applied' and jsonb_array_length(_payments) = 0)
    or (incoming_event.resolution <> 'applied' and jsonb_array_length(_payments) <> 0)
  then raise exception 'External payment resolution requires 1 to 20 applied payments or zero unapplied payments' using errcode = '22023'; end if;
  if exists (select 1 from jsonb_array_elements(_payments) p group by p->>'payment_id' having count(*) > 1)
    or exists (select 1 from jsonb_array_elements(_payments) p group by p->>'charge_id' having count(*) > 1)
  then raise exception 'Each external payment and charge may appear only once' using errcode = '22023'; end if;

  -- The unique event insert blocks concurrent retries until the first transaction
  -- commits or rolls back. Failed processing leaves neither an inbox row nor facts.
  insert into public.external_payment_events (
    provider,account_id,event_id,mode,payload_hash,event_type,resolution,provider_created_at,observed_at,payment_count
  ) values (
    incoming_event.provider,incoming_event.account_id,incoming_event.event_id,incoming_event.mode,
    incoming_event.payload_hash,incoming_event.event_type,incoming_event.resolution,
    incoming_event.provider_created_at,incoming_event.observed_at,jsonb_array_length(_payments)
  ) on conflict (provider,account_id,event_id) do nothing;
  event_inserted := found;
  if not event_inserted then
    select e.* into saved_event from public.external_payment_events e
      where e.provider = incoming_event.provider and e.account_id = incoming_event.account_id and e.event_id = incoming_event.event_id;
    if saved_event.payload_hash <> incoming_event.payload_hash or saved_event.mode <> incoming_event.mode
      or saved_event.event_type <> incoming_event.event_type or saved_event.provider_created_at <> incoming_event.provider_created_at
    then raise exception 'External payment event conflicts with a processed event' using errcode = '23505'; end if;
    return jsonb_build_object('status','duplicate','resolution',saved_event.resolution,
      'payment_count',saved_event.payment_count,'inserted',0,'updated',0,'unchanged',0,'refund_decreases',0);
  end if;

  -- A maximum of 20 rows, locked in canonical identity order. No network requests
  -- run inside this transaction, and unrelated accounts/payments remain writable.
  for item in select p.value from jsonb_array_elements(_payments) p order by p.value->>'payment_id' loop
    begin
      if jsonb_typeof(item) <> 'object'
        or item - array['payment_id','charge_id','destination','amount_minor','refunded_minor','currency','occurred_at','price_ids','refresh_fence'] <> '{}'::jsonb
        or not (item ?& array['payment_id','charge_id','destination','amount_minor','refunded_minor','currency','occurred_at','price_ids','refresh_fence'])
        or exists (select 1 from jsonb_each(item) e where e.key not in ('amount_minor','refunded_minor','price_ids') and jsonb_typeof(e.value) <> 'string')
        or not ((item->>'payment_id') ~ '^(pi|ch)_[A-Za-z0-9]{1,120}$')
        or not ((item->>'charge_id') ~ '^ch_[A-Za-z0-9]{1,120}$')
        or not ((item->>'refresh_fence') ~ '^[1-9][0-9]{0,18}$')
        or ((item->>'payment_id') like 'ch_%' and item->>'payment_id' <> item->>'charge_id')
        or not ((item->>'destination') ~ '^[a-z0-9][a-z0-9_-]{0,63}$')
        or jsonb_typeof(item->'amount_minor') <> 'number'
        or jsonb_typeof(item->'refunded_minor') <> 'number'
        or not ((item->>'amount_minor') ~ '^[0-9]+$')
        or not ((item->>'refunded_minor') ~ '^[0-9]+$')
        or (item->>'amount_minor')::numeric not between 1 and 9000000000000
        or (item->>'refunded_minor')::numeric not between 0 and (item->>'amount_minor')::numeric
        or not ((item->>'currency') ~ '^[A-Z]{3}$')
        or not ((item->>'occurred_at') ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$')
        or jsonb_typeof(item->'price_ids') <> 'array'
      then raise exception 'Invalid fields'; end if;
      if jsonb_array_length(item->'price_ids') not between 1 and 100
        or exists (select 1 from jsonb_array_elements(item->'price_ids') p where jsonb_typeof(p) <> 'string' or not (p #>> '{}' ~ '^price_[A-Za-z0-9]{1,120}$'))
        or exists (select 1 from jsonb_array_elements(item->'price_ids') p group by p having count(*) > 1)
      then raise exception 'Invalid price mapping'; end if;
      select p.* into incoming from jsonb_populate_record(null::public.external_payments,item) p;
      refresh_fence := (item->>'refresh_fence')::bigint;
      select array_agg(p order by p) into incoming.price_ids from jsonb_array_elements_text(item->'price_ids') p;
      if incoming.occurred_at < '2000-01-01T00:00:00Z'::timestamptz or incoming.occurred_at > incoming_event.observed_at then
        raise exception 'Invalid payment timestamp';
      end if;
    exception when others then
      raise exception 'Invalid external payment fields, dates, price mapping or amounts' using errcode = '22023';
    end;
    -- Keep this row locked through the payment mutation and lease release. A new
    -- owner cannot acquire/fetch until this transaction commits, even if the
    -- wall-clock lease expires while its bounded SQL batch is being processed.
    select r.* into refresh from public.external_payment_refreshes r
      where r.provider = incoming_event.provider and r.account_id = incoming_event.account_id and r.payment_id = incoming.payment_id
      for update;
    if not found or refresh.mode <> incoming_event.mode or refresh.fence <> refresh_fence
      or refresh.lease_until is null or refresh.lease_until <= clock_timestamp()
    then raise exception 'External payment refresh lease is missing, expired or stale' using errcode = '55000'; end if;
    begin
      insert into public.external_payments (
        provider,account_id,payment_id,charge_id,mode,destination,amount_minor,refunded_minor,
        currency,occurred_at,price_ids,first_observed_at,last_observed_at
      ) values (
        incoming_event.provider,incoming_event.account_id,incoming.payment_id,incoming.charge_id,
        incoming_event.mode,incoming.destination,incoming.amount_minor,incoming.refunded_minor,
        incoming.currency,incoming.occurred_at,incoming.price_ids,incoming_event.observed_at,incoming_event.observed_at
      ) on conflict (provider,account_id,payment_id) do nothing;
      payment_inserted := found;
    exception when unique_violation then
      raise exception 'External payment charge conflicts with an existing canonical payment identity' using errcode = '23505';
    end;
    if payment_inserted then added := added + 1; continue; end if;
    select p.* into saved from public.external_payments p
      where p.provider = incoming_event.provider and p.account_id = incoming_event.account_id and p.payment_id = incoming.payment_id
      for update;
    if saved.mode <> incoming_event.mode or saved.charge_id <> incoming.charge_id
      or saved.destination <> incoming.destination or saved.amount_minor <> incoming.amount_minor
      or saved.currency <> incoming.currency or saved.occurred_at <> incoming.occurred_at
      or saved.price_ids <> incoming.price_ids
    then raise exception 'External payment conflicts with saved payment facts or mapping' using errcode = '23505'; end if;
    if incoming.refunded_minor <> saved.refunded_minor then
      changed := changed + 1;
      if incoming.refunded_minor < saved.refunded_minor then decreases := decreases + 1; end if;
    else
      same := same + 1;
    end if;
    update public.external_payments set
      -- Succeeded refunds can later fail or require action. Only the holder of
      -- the current refresh fence may replace the verified total, either way.
      refunded_minor = incoming.refunded_minor,
      first_observed_at = least(saved.first_observed_at,incoming_event.observed_at),
      last_observed_at = greatest(saved.last_observed_at,incoming_event.observed_at),
      updated_at = clock_timestamp()
    where provider = incoming_event.provider and account_id = incoming_event.account_id and payment_id = incoming.payment_id;
  end loop;
  update public.external_payment_refreshes r set lease_until = null
    from jsonb_array_elements(_payments) p
    where r.provider = incoming_event.provider and r.account_id = incoming_event.account_id
      and r.payment_id = p->>'payment_id' and r.fence = (p->>'refresh_fence')::bigint;
  update public.external_payment_events set inserted = added,updated = changed,unchanged = same,refund_decreases = decreases,processed_at = clock_timestamp()
    where provider = incoming_event.provider and account_id = incoming_event.account_id and event_id = incoming_event.event_id;
  return jsonb_build_object('status','processed','resolution',incoming_event.resolution,
    'payment_count',jsonb_array_length(_payments),'inserted',added,'updated',changed,'unchanged',same,'refund_decreases',decreases);
end $$;

create function public.admin_external_payment_snapshot(_days integer default 30)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare start_time timestamptz; end_time timestamptz; result jsonb;
begin
  if not coalesce(public.is_admin(auth.uid()),false) then raise exception 'Admin access required' using errcode = '42501'; end if;
  if _days is null or _days not in (7,30,90) then raise exception 'Choose 7, 30 or 90 days' using errcode = '22023'; end if;
  start_time := date_trunc('day',now() at time zone 'UTC') at time zone 'UTC' - make_interval(days => _days - 1);
  end_time := now();
  with period as materialized (
    select provider,account_id,mode,destination,amount_minor,refunded_minor,currency
    from public.external_payments where occurred_at >= start_time and occurred_at <= end_time
  ), receipts as materialized (
    select event_type,mode,resolution from public.external_payment_events
    where received_at >= start_time and received_at <= end_time
  ), all_time as materialized (
    -- Exact all-time counts inherently visit the inbox; calculate all global
    -- statistics in that one pass instead of rescanning for each timestamp.
    select count(*) accepted_event_count,max(received_at) last_received_at,max(processed_at) last_processed_at
    from public.external_payment_events
  ), mode_totals as (
    select m.mode,jsonb_build_object(
      'payments',count(p.mode),
      'unrefunded_payments',count(p.mode) filter (where p.refunded_minor = 0),
      'partial_refund_payments',count(p.mode) filter (where p.refunded_minor > 0 and p.refunded_minor < p.amount_minor),
      'full_refund_payments',count(p.mode) filter (where p.refunded_minor = p.amount_minor),
      'revenue_by_currency',coalesce((select jsonb_agg(c order by c.currency) from (
        select currency,sum(amount_minor)::text gross_minor,sum(refunded_minor)::text refunded_minor,
          sum(amount_minor - refunded_minor)::text net_minor from period where mode = m.mode group by currency
      ) c),'[]'::jsonb)
    ) summary from (values ('live'),('test')) m(mode) left join period p on p.mode = m.mode group by m.mode
  ), destinations as (
    select provider,account_id,mode,destination,currency,count(*) payments,
      sum(amount_minor)::text gross_minor,sum(refunded_minor)::text refunded_minor,sum(amount_minor-refunded_minor)::text net_minor
    from period group by provider,account_id,mode,destination,currency
  )
  select jsonb_build_object(
    'generated_at',now(),
    'range',jsonb_build_object('start',start_time,'end',end_time,'timezone','UTC'),
    'coverage',jsonb_build_object('scope','verified_callbacks_only','complete',false,'historical_backfill',false,'browser_attribution',false),
    'live',(select summary from mode_totals where mode = 'live'),
    'test',(select summary from mode_totals where mode = 'test'),
    'destinations',coalesce((select jsonb_agg(d order by d.mode,d.provider,d.account_id,d.destination,d.currency) from (
      select provider,account_id,mode,destination,currency,payments,gross_minor,refunded_minor,net_minor from destinations
      order by mode,provider,account_id,destination,currency limit 100
    ) d),'[]'::jsonb),
    'destination_group_count',(select count(*) from destinations),
    'accepted_event_count',(select accepted_event_count from all_time),
    'accepted_event_count_in_range',(select count(*) from receipts),
    'last_received_at',(select last_received_at from all_time),
    'last_processed_at',(select last_processed_at from all_time),
    'resolution_counts',(select jsonb_build_object(
      'applied',count(*) filter (where resolution = 'applied'),
      'unmapped',count(*) filter (where resolution = 'unmapped'),
      'unsupported',count(*) filter (where resolution = 'unsupported'),
      'not_paid',count(*) filter (where resolution = 'not_paid')
    ) from receipts),
    'event_types',coalesce((select jsonb_agg(e order by e.event_type,e.mode,e.resolution) from (
      select event_type,mode,resolution,count(*) events from receipts group by event_type,mode,resolution
    ) e),'[]'::jsonb),
    'latest_events',coalesce((select jsonb_agg(e order by e.received_at desc,e.provider,e.account_id,e.event_type) from (
      select provider,account_id,mode,event_type,resolution,provider_created_at,observed_at,received_at,processed_at,
        payment_count,inserted,updated,unchanged,refund_decreases
      from public.external_payment_events order by received_at desc,provider,account_id,event_id limit 20
    ) e),'[]'::jsonb)
  ) into result;
  return result;
end $$;

revoke all on function public.external_payment_event_status(text,text,text,text,text),public.external_payment_apply_event(jsonb,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.external_payment_event_status(text,text,text,text,text),public.external_payment_apply_event(jsonb,jsonb) to service_role;
revoke all on function public.external_payment_acquire_refresh(text,text,text,text),public.external_payment_release_refresh(text,text,text,text,text) from public,anon,authenticated,service_role;
grant execute on function public.external_payment_acquire_refresh(text,text,text,text),public.external_payment_release_refresh(text,text,text,text,text) to service_role;
revoke all on function public.admin_external_payment_snapshot(integer) from public,anon,authenticated,service_role;
grant execute on function public.admin_external_payment_snapshot(integer) to authenticated;
