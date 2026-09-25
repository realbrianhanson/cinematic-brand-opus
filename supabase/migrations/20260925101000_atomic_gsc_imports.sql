-- In-progress/failed imports are never visible in the active performance table.
create table public.gsc_imports (
  id uuid primary key default gen_random_uuid(),
  property text not null,
  period_start date not null,
  period_end date not null check(period_end >= period_start),
  status text not null default 'importing' check(status in ('importing','complete','failed')),
  row_count integer check(row_count >= 0),
  started_at timestamptz not null default clock_timestamp(),
  completed_at timestamptz,
  error_message text
);
create index gsc_imports_completed_period on public.gsc_imports(period_end desc,started_at desc) where status='complete';
create table public.gsc_import_rows (
  import_id uuid not null references public.gsc_imports(id) on delete cascade,
  row_number integer not null check(row_number >= 0),
  page_url text not null check(page_url <> ''),
  query text not null check(query <> ''),
  clicks integer not null check(clicks >= 0),
  impressions integer not null check(impressions >= 0),
  ctr numeric not null check(ctr >= 0 and ctr <= 1),
  position numeric not null check(position >= 0),
  primary key(import_id,row_number),
  unique(import_id,page_url,query)
);
alter table public.gsc_imports enable row level security;
alter table public.gsc_import_rows enable row level security;
revoke all on public.gsc_imports,public.gsc_import_rows from public,anon,authenticated;
grant select on public.gsc_imports to authenticated;
grant all on public.gsc_imports,public.gsc_import_rows to service_role;
create policy "Admins read import status" on public.gsc_imports for select to authenticated using(public.is_admin(auth.uid()));
create policy "Service role manages imports" on public.gsc_imports for all to service_role using(true) with check(true);
create policy "Service role stages imports" on public.gsc_import_rows for all to service_role using(true) with check(true);

create or replace function public.gsc_finish_import(_import_id uuid,_expected_rows integer)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare job public.gsc_imports; staged_count integer;
begin
  perform pg_advisory_xact_lock(hashtext('gsc-active-import'));
  select * into job from public.gsc_imports where id=_import_id for update;
  if job.id is null then raise exception 'Import not found'; end if;
  if job.status='complete' then return jsonb_build_object('saved',true,'rows',job.row_count); end if;
  if job.status <> 'importing' then raise exception 'Import is not active'; end if;
  if exists(select 1 from public.gsc_imports where status='complete' and period_start=job.period_start and period_end=job.period_end and started_at > job.started_at) then
    raise exception 'A newer import already completed';
  end if;
  select count(*) into staged_count from public.gsc_import_rows where import_id=_import_id;
  if _expected_rows is null or _expected_rows < 0 or staged_count <> _expected_rows then raise exception 'Incomplete import'; end if;
  delete from public.gsc_performance where period_start=job.period_start and period_end=job.period_end;
  insert into public.gsc_performance(page_url,query,clicks,impressions,ctr,position,period_start,period_end,fetched_at)
    select page_url,query,clicks,impressions,ctr,position,job.period_start,job.period_end,clock_timestamp()
      from public.gsc_import_rows where import_id=_import_id order by row_number;
  update public.gsc_imports set status='complete',row_count=staged_count,completed_at=clock_timestamp(),error_message=null where id=_import_id;
  delete from public.gsc_import_rows where import_id=_import_id;
  return jsonb_build_object('saved',true,'rows',staged_count);
end $$;
revoke all on function public.gsc_finish_import(uuid,integer) from public,anon,authenticated;
grant execute on function public.gsc_finish_import(uuid,integer) to service_role;

create or replace function public.admin_performance_snapshot(days integer default 30)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  result jsonb;
  latest date;
  imported public.gsc_imports;
begin
  if public.is_admin(auth.uid()) is not true then
    raise exception 'Administrator required' using errcode = '42501';
  end if;
  if days not in (7, 30, 90) then raise exception 'Invalid date range'; end if;
  select * into imported from public.gsc_imports where status='complete' order by period_end desc,started_at desc limit 1;
  select greatest(imported.period_end,max(period_end)) into latest from public.gsc_performance;

  with views as (
    select page_id, count(*)::int as views from public.page_engagement
     where event_type = 'view' group by page_id
  ),
  latest_rows as (
    select g.*,
           split_part(split_part(regexp_replace(g.page_url, '^https?://[^/]+', ''), '#', 1), '?', 1) as path
      from public.gsc_performance g where g.period_end = latest
  ),
  sections as (
    select case when path ~ '^/blog/.+' then 'articles'
                when path ~ '^/resources/' then 'resources'
                when path ~ '^/guides/' then 'guides'
                else 'other' end as section, path, clicks, impressions, position
      from latest_rows
  )
  select jsonb_build_object(
    'generated_at', now(),
    'published_resources', (select count(*) from public.generated_pages where status = 'published'),
    'resource_views_all_time', (select count(*) from public.page_engagement pe
                                  join public.generated_pages gp on gp.id = pe.page_id
                                 where pe.event_type = 'view' and gp.status = 'published'),
    'published_articles', (select count(*) from public.posts where status = 'published'),
    'cta_clicks', (select count(*) from public.cta_events
                    where event_type = 'click' and created_at >= now() - make_interval(days => days)),
    'review_needed', (select count(*) from public.generated_pages
                       where status = 'published' and performance_trend = 'needs_refresh'),
    'top_pages', coalesce((select jsonb_agg(x) from (
        select gp.id, gp.title, gp.slug, coalesce(v.views, 0) as views, s.slug as content_type
          from public.generated_pages gp
          left join views v on v.page_id = gp.id
          left join public.content_schemas s on s.id = gp.content_schema_id
         where gp.status = 'published'
         order by coalesce(v.views, 0) desc, gp.id limit 10) x), '[]'::jsonb),
    'daily_views', coalesce((select jsonb_agg(x order by x.day) from (
        select date_trunc('day', created_at at time zone 'UTC')::date as day, count(*) as views
          from public.page_engagement
         where event_type = 'view' and created_at >= now() - make_interval(days => days)
         group by 1) x), '[]'::jsonb),
    'search', jsonb_build_object(
      'period_end', latest,
      'period_start', coalesce((select min(period_start) from latest_rows),case when imported.period_end=latest then imported.period_start end),
      'fetched_at', coalesce((select max(fetched_at) from latest_rows),case when imported.period_end=latest then imported.completed_at end),
      'property', case when imported.period_end=latest then imported.property end,
      'latest_import', (select jsonb_build_object('status',status,'started_at',started_at,'error_message',error_message) from public.gsc_imports order by started_at desc limit 1),
      'rows', (select count(*) from latest_rows),
      'clicks', (select coalesce(sum(clicks), 0) from latest_rows),
      'impressions', (select coalesce(sum(impressions), 0) from latest_rows),
      'sections', coalesce((select jsonb_agg(x order by x.impressions desc, x.section) from (
          select section, count(distinct path) as pages, coalesce(sum(clicks), 0) as clicks,
                 coalesce(sum(impressions), 0) as impressions
            from sections group by section) x), '[]'::jsonb)),
    'top_articles', coalesce((select jsonb_agg(x order by x.impressions desc, x.clicks desc, x.path) from (
        select a.path, coalesce(po.title, a.path) as title, po.id as post_id,
               a.clicks, a.impressions, a.position
          from (select path, sum(clicks)::int as clicks, sum(impressions)::int as impressions,
                       round(sum(position * impressions) / nullif(sum(impressions), 0), 1) as position
                  from sections where section = 'articles' group by path) a
          left join public.posts po on po.slug = substring(a.path from '^/blog/([^/]+)')
         order by a.impressions desc, a.clicks desc, a.path limit 10) x), '[]'::jsonb),
    'queries', coalesce((select jsonb_agg(x) from (
        select page_url, query, clicks, impressions, ctr, position from latest_rows
         where impressions > 0 order by impressions desc, page_url, query limit 20) x), '[]'::jsonb),
    'jobs', coalesce((select jsonb_agg(x) from (
        select id, status, total_combinations, completed_count, success_count, failed_count,
               skipped_count, error_message, updated_at
          from public.generation_jobs order by updated_at desc limit 5) x), '[]'::jsonb)
  ) into result;
  return result;
end $$;
revoke all on function public.admin_performance_snapshot(integer) from public, anon;
grant execute on function public.admin_performance_snapshot(integer) to authenticated;

