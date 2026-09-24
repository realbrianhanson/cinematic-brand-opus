-- Admin numbers that tell the truth.
--
-- 1. admin_overview_snapshot(): the Overview used to fire about 19 PostgREST
--    requests (11 HEAD counts, stale pages, recent posts, ...) behind the
--    role check, taking 4-14 s under load. This returns every card, the five
--    most recently updated posts and a prioritised attention list in one
--    admin-only round trip. Card counts use the exact predicates the old
--    queries used, except paid orders (below).
-- 2. Paid orders split by payment mode. The old card counted every fulfilled
--    order with amount_minor > 0, so a Stripe test checkout showed as a sale.
--    Payment mode lives in conversion_order_facts (service-role only), so the
--    split has to happen in a SECURITY DEFINER function. A paid order with no
--    facts row, or mode 'unknown', is reported separately, never as live.
-- 3. Resource views are counted from page_engagement 'view' events. Nothing
--    ever incremented generated_pages.views, so every view figure was 0.
--    admin_performance_snapshot also reports articles (posts) and splits the
--    latest Search Console period by section, because gsc_performance holds
--    /blog URLs that the report ignored.
--
-- Dependencies: offer_access_deliveries (20260919210000), conversion_order_facts
-- (20260919220000), the performance RPCs (20260919092000 / 20260919094000,
-- replaced here). posts.held_reason and posts.contradicted_count come from
-- 20260923130000_post_hold_reasons.sql; they are read only when the columns
-- exist, so this file can apply before or after that one. newsletter_sends
-- .last_error (20260923140000) is read the same way.
--
-- Read-only functions and one index. Writes no rows. Safe to re-run.

create index if not exists page_engagement_page_event_idx
  on public.page_engagement (page_id, event_type);

-- ---------------------------------------------------------------------------
-- Overview snapshot
-- ---------------------------------------------------------------------------
create or replace function public.admin_overview_attention_item(
  _key text, _severity text, _count bigint, _message text, _detail text, _link text)
returns jsonb language sql immutable set search_path = public, pg_temp as $$
  select jsonb_build_object('key', _key, 'severity', _severity, 'count', _count,
    'message', _message, 'detail', _detail, 'link', _link)
$$;
revoke all on function public.admin_overview_attention_item(text, text, bigint, text, text, text)
  from public, anon, authenticated;

create or replace function public.admin_overview_snapshot()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  p record;          -- posts
  o record;          -- offers
  ord record;        -- offer_orders by payment mode
  subs record;       -- newsletter_subscribers
  opp record;        -- content_opportunities
  access record;     -- offer_access_deliveries
  n_inquiries bigint;
  n_stale_pages bigint;
  indexnow_recent boolean;
  held jsonb;        -- null when posts.held_reason does not exist yet
  contradicted jsonb;
  send record;
  send_error text;
  items jsonb := '[]'::jsonb;
  recent jsonb;
  plural text;
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;

  select count(*) filter (where status = 'published') as published,
         count(*) filter (where status = 'draft') as drafts,
         count(*) filter (where status = 'scheduled') as scheduled,
         count(*) filter (where status = 'scheduled' and scheduled_at < now()) as overdue
    into p from public.posts;

  select count(*) filter (where status = 'published' and show_in_shop and not funnel_only) as shop,
         count(*) filter (where status = 'published' and kind = 'paid' and checkout_mode = 'native') as native_paid
    into o from public.offers;

  select count(*) filter (where o2.amount_minor > 0 and f.payment_mode = 'live') as live_paid,
         count(*) filter (where o2.amount_minor > 0 and f.payment_mode = 'test') as test_paid,
         count(*) filter (where o2.amount_minor > 0
                            and coalesce(f.payment_mode, 'unknown') not in ('live', 'test')) as unknown_paid,
         count(*) filter (where o2.amount_minor = 0) as free_claims
    into ord
    from public.offer_orders o2
    left join public.conversion_order_facts f on f.order_id = o2.id
   where o2.status = 'fulfilled';

  select count(*) filter (where status = 'confirmed') as confirmed,
         count(*) filter (where status = 'pending') as pending,
         count(*) filter (where status = 'pending' and created_at < now() - interval '24 hours') as pending_stale
    into subs from public.newsletter_subscribers;

  select count(*) as queue_errors,
         count(*) filter (where last_error ilike '%AI credits ran out%'
                            and updated_at >= now() - interval '3 days') as credit_stops
    into opp from public.content_opportunities
   where status in ('proposed', 'drafting') and last_error is not null;

  select count(*) filter (where status in ('needs_review', 'failed')) as failed,
         count(*) filter (where status in ('pending', 'sending')
                            and created_at < now() - interval '1 hour') as waiting,
         min(created_at) filter (where status in ('pending', 'sending')
                            and created_at < now() - interval '1 hour') as oldest_waiting
    into access from public.offer_access_deliveries;

  select count(*) into n_inquiries from public.speaking_inquiries where status = 'new';
  select count(*) into n_stale_pages from public.generated_pages
   where performance_trend = 'needs_refresh' and status = 'published';

  select exists(select 1 from public.indexing_log
                 where method = 'indexnow' and status = 'indexnow_submitted'
                   and submitted_at >= now() - interval '7 days')
    into indexnow_recent;

  -- Columns from 20260923130000_post_hold_reasons.sql, read only when present.
  if exists(select 1 from pg_attribute where attrelid = 'public.posts'::regclass
             and attname = 'held_reason' and not attisdropped) then
    execute $q$
      select jsonb_build_object('count', count(*),
        'id', (array_agg(id order by held_at desc nulls last, id))[1],
        'title', (array_agg(title order by held_at desc nulls last, id))[1],
        'reason', (array_agg(held_reason order by held_at desc nulls last, id))[1])
        from public.posts where held_reason is not null and status <> 'published'
    $q$ into held;
  end if;
  if exists(select 1 from pg_attribute where attrelid = 'public.posts'::regclass
             and attname = 'contradicted_count' and not attisdropped) then
    execute $q$
      select jsonb_build_object('count', count(*),
        'id', (array_agg(id order by contradicted_count desc, id))[1])
        from public.posts where status = 'published' and contradicted_count > 0
    $q$ into contradicted;
  end if;

  -- Latest newsletter send that has left preview. Once a later week delivers
  -- in full, an older failure stops being current.
  select s.week_key, s.status, s.recipient_count, s.sent_count,
         to_jsonb(s) ->> 'last_error' as last_error
    into send
    from public.newsletter_sends s
   where s.status not in ('preview', 'cancelled')
   order by s.week_key desc nulls last, s.created_at desc
   limit 1;

  select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'title', r.title,
           'status', r.status, 'updated_at', r.updated_at) order by r.updated_at desc, r.id), '[]'::jsonb)
    into recent
    from (select id, title, status, updated_at from public.posts
           order by updated_at desc, id limit 5) r;

  -- ---- Attention list -----------------------------------------------------
  if send.week_key is not null and (
       send.status in ('failed', 'needs_review')
       or (send.status = 'sent' and send.sent_count < send.recipient_count)) then
    send_error := coalesce(nullif(send.last_error, ''),
      'Check the email provider (sending domain and API key), then retry from the newsletter card.');
    items := items || public.admin_overview_attention_item('newsletter_delivery', 'high',
      greatest(send.recipient_count - send.sent_count, 0),
      case
        when send.sent_count = 0 and send.recipient_count > 0 then
          format('The %s newsletter reached nobody (0 of %s delivered)', send.week_key, send.recipient_count)
        when send.status = 'sent' then
          format('The %s newsletter reached only %s of %s subscribers', send.week_key,
                 send.sent_count, send.recipient_count)
        else format('The %s newsletter needs review (%s of %s delivered)', send.week_key,
                    send.sent_count, send.recipient_count)
      end,
      send_error, '/admin#newsletter');
  end if;

  if (held ->> 'count')::bigint > 0 then
    items := items || public.admin_overview_attention_item('posts_held', 'high',
      (held ->> 'count')::bigint,
      case when (held ->> 'count')::bigint = 1 then '1 article is held and will not publish'
           else format('%s articles are held and will not publish', held ->> 'count') end,
      format('"%s": %s', held ->> 'title', held ->> 'reason'),
      case when (held ->> 'count')::bigint = 1 then format('/admin/posts/%s/edit', held ->> 'id')
           else '/admin/posts' end);
  end if;

  if p.overdue > 0 then
    items := items || public.admin_overview_attention_item('overdue_scheduled', 'high', p.overdue,
      format('%s scheduled %s past %s publish time', p.overdue,
             case when p.overdue = 1 then 'article is' else 'articles are' end,
             case when p.overdue = 1 then 'its' else 'their' end),
      'Open the schedule to see why it has not gone live.', '/admin/posts?status=scheduled');
  end if;

  if (contradicted ->> 'count')::bigint > 0 then
    items := items || public.admin_overview_attention_item('contradicted_live', 'high',
      (contradicted ->> 'count')::bigint,
      format('%s live %s claims the fact-check contradicted', contradicted ->> 'count',
             case when (contradicted ->> 'count')::bigint = 1 then 'article contains' else 'articles contain' end),
      'Readers can see these now. Fix the claims or unpublish the article.',
      case when (contradicted ->> 'count')::bigint = 1 then format('/admin/posts/%s/edit', contradicted ->> 'id')
           else '/admin/posts?status=published' end);
  end if;

  if access.failed > 0 then
    plural := case when access.failed = 1 then 'email' else 'emails' end;
    items := items || public.admin_overview_attention_item('access_email_failed', 'high', access.failed,
      format('%s download %s could not be delivered', access.failed, plural),
      'A buyer or claimant may not have their file. Review the delivery details and resend.',
      '/admin/offers?tab=setup');
  end if;

  if opp.credit_stops > 0 then
    items := items || public.admin_overview_attention_item('ai_credits', 'high', opp.credit_stops,
      'AI drafting stopped because credits ran out',
      format('%s queued %s waiting. Add credits in Lovable, then run the pipeline again.', opp.credit_stops,
             case when opp.credit_stops = 1 then 'idea is' else 'ideas are' end),
      '/admin/queue');
  end if;

  if access.waiting > 0 then
    items := items || public.admin_overview_attention_item('access_email_waiting', 'medium', access.waiting,
      format('%s download %s waiting to send since %s', access.waiting,
             case when access.waiting = 1 then 'email has been' else 'emails have been' end,
             to_char(access.oldest_waiting at time zone 'UTC', 'Mon FMDD')),
      'Check download email setup. Retries run automatically once the provider accepts mail.',
      '/admin/offers?tab=setup');
  end if;

  if subs.pending_stale > 0 then
    items := items || public.admin_overview_attention_item('pending_subscribers', 'medium', subs.pending_stale,
      format('%s newsletter %s never confirmed', subs.pending_stale,
             case when subs.pending_stale = 1 then 'signup' else 'signups' end),
      'They signed up more than a day ago and are not receiving the newsletter. Check that confirmation emails are being delivered, then resend them.',
      '/admin/audience');
  end if;

  if n_inquiries > 0 then
    items := items || public.admin_overview_attention_item('speaking_inquiries', 'medium', n_inquiries,
      format('%s new speaking %s', n_inquiries, case when n_inquiries = 1 then 'inquiry' else 'inquiries' end),
      'Review the event details and follow up with the organizer.', '/admin/inquiries');
  end if;

  if opp.queue_errors - opp.credit_stops > 0 then
    items := items || public.admin_overview_attention_item('pipeline_errors', 'medium',
      opp.queue_errors - opp.credit_stops,
      format('%s active pipeline %s', opp.queue_errors - opp.credit_stops,
             case when opp.queue_errors - opp.credit_stops = 1 then 'issue' else 'issues' end),
      'Review failed attempts and source errors.', '/admin/queue');
  end if;

  if p.published > 0 and not indexnow_recent then
    items := items || public.admin_overview_attention_item('indexnow_idle', 'medium', 0,
      'Search engines were sent no new pages in the last 7 days',
      'IndexNow has not accepted a submission. Check that the IndexNow key is configured.',
      '/admin/site-settings');
  end if;

  if p.drafts > 0 then
    items := items || public.admin_overview_attention_item('drafts', 'low', p.drafts,
      format('%s %s to review', p.drafts, case when p.drafts = 1 then 'draft' else 'drafts' end),
      'Check the hook, sources, and next step for readers.', '/admin/posts?status=draft');
  end if;

  return jsonb_build_object(
    'generated_at', now(),
    'counts', jsonb_build_object(
      'inquiries', n_inquiries,
      'published', p.published,
      'drafts', p.drafts,
      'scheduled', p.scheduled,
      'overdue', p.overdue,
      'subscribers', subs.confirmed,
      'pending_subscribers', subs.pending,
      'shop', o.shop,
      'paid_orders', ord.live_paid,
      'test_paid_orders', ord.test_paid,
      'unknown_paid_orders', ord.unknown_paid,
      'free_claims', ord.free_claims,
      'native_paid_offers', o.native_paid,
      'queue_errors', opp.queue_errors,
      'stale_pages', n_stale_pages,
      'held_posts', held -> 'count',
      'contradicted_live_posts', contradicted -> 'count'),
    'recent_posts', recent,
    'attention', items);
end $$;

revoke all on function public.admin_overview_snapshot() from public, anon;
grant execute on function public.admin_overview_snapshot() to authenticated;

-- ---------------------------------------------------------------------------
-- Resource views from page_engagement
-- ---------------------------------------------------------------------------
create or replace function public.admin_page_view_counts()
returns table(page_id uuid, views bigint)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'Administrator required' using errcode = '42501';
  end if;
  return query
    select pe.page_id, count(*)::bigint
      from public.page_engagement pe
     where pe.event_type = 'view' and pe.page_id is not null
     group by pe.page_id;
end $$;
revoke all on function public.admin_page_view_counts() from public, anon;
grant execute on function public.admin_page_view_counts() to authenticated;

create or replace function public.admin_performance_snapshot(days integer default 30)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  result jsonb;
  latest date;
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'Administrator required' using errcode = '42501';
  end if;
  if days not in (7, 30, 90) then raise exception 'Invalid date range'; end if;
  select max(period_end) into latest from public.gsc_performance;

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
      'period_start', (select min(period_start) from latest_rows),
      'fetched_at', (select max(fetched_at) from latest_rows),
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

create or replace function public.admin_content_breakdown()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'Administrator required' using errcode = '42501';
  end if;
  return (
    with views as (
      select page_id, count(*)::int as views from public.page_engagement
       where event_type = 'view' group by page_id
    )
    select jsonb_build_object(
      'formats', coalesce((select jsonb_agg(x) from (
          select coalesce(s.name, 'Uncategorized') as name, count(*) as pages,
                 coalesce(sum(v.views), 0) as views
            from public.generated_pages gp
            left join views v on v.page_id = gp.id
            left join public.content_schemas s on s.id = gp.content_schema_id
           where gp.status = 'published'
           group by s.name
           order by coalesce(sum(v.views), 0) desc, s.name) x), '[]'::jsonb),
      'niches', coalesce((select jsonb_agg(x) from (
          select coalesce(n.name, 'Unassigned') as name, count(*) as pages,
                 coalesce(sum(v.views), 0) as views, coalesce(sum(c.clicks), 0) as clicks
            from public.generated_pages gp
            left join views v on v.page_id = gp.id
            left join public.niches n on n.id = gp.niche_id
            left join (select page_id, count(*) as clicks from public.cta_events
                        where event_type = 'click' group by page_id) c on c.page_id = gp.id
           where gp.status = 'published'
           group by n.name
           order by coalesce(sum(v.views), 0) desc, n.name limit 20) x), '[]'::jsonb)));
end $$;
revoke all on function public.admin_content_breakdown() from public, anon;
grant execute on function public.admin_content_breakdown() to authenticated;
