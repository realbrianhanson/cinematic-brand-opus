-- Publishing holds, fact-check visibility and an override audit trail.
--
-- Why: publish-scheduled-posts and auto-publish-gate used to skip posts that
-- failed the gate and store nothing, so Brian saw drafts and scheduled articles
-- that never went live with no reason, and eventually bulk-published 318 drafts
-- past the gate by SQL (publish_override_by NULL on all of them).
--
--   held_reason          plain-English reasons a post is not going live, e.g.
--                        "Quality score 62, needs 85; 3 claims the fact-checker
--                        couldn't confirm, 2 allowed". Written by
--                        publish-scheduled-posts / auto-publish-gate (via
--                        daily-content-run). Cleared automatically on publish.
--   held_at              when the post was first held (null when not held).
--   schedule_checked_at  set by manual-publish mode 'schedule' when the gate
--   schedule_checked_by  passed or was overridden at scheduling time. A
--                        hand-scheduled post with this stamp publishes on time;
--                        cleared automatically when the post leaves 'scheduled'.
--   contradicted_count   generated: number of fact_check.claims[] whose verdict
--                        is 'contradicted' (fact-check/index.ts writes
--                        {claims:[{verdict, evidence_url, ...}], *_count}).
--   post_publish_overrides  append-only audit of every gate override.
--
-- Privacy: anon must not see any of these. Since
-- 20260923111000_public_column_grants.sql anon holds column-level SELECT on an
-- allowlist only, so new columns are private by default. This migration
-- refuses to run if anon still holds table-level SELECT on posts.
--
-- Apply BEFORE deploying the updated manual-publish, publish-scheduled-posts,
-- auto-publish-gate and daily-content-run functions (they read these columns).

do $$
begin
  if has_table_privilege('anon', 'public.posts', 'SELECT') then
    raise exception 'anon still has table-level SELECT on public.posts. Apply 20260923111000_public_column_grants.sql first so held_reason and contradicted_count stay private';
  end if;
end $$;

alter table public.posts
  add column if not exists held_reason text,
  add column if not exists held_at timestamptz,
  add column if not exists schedule_checked_at timestamptz,
  add column if not exists schedule_checked_by uuid,
  add column if not exists contradicted_count integer generated always as (
    coalesce(
      jsonb_array_length(
        jsonb_path_query_array(
          fact_check,
          '$.claims[*] ? (@.verdict == "contradicted")'
        )
      ),
      0
    )
  ) stored;

alter table public.posts
  drop constraint if exists posts_held_pair,
  add constraint posts_held_pair
    check ((held_reason is null) = (held_at is null)),
  drop constraint if exists posts_held_reason_length,
  add constraint posts_held_reason_length
    check (held_reason is null or char_length(held_reason) <= 2000);

-- "Needs fact review" filter: status + contradicted_count > 0.
create index if not exists posts_contradicted_count_idx
  on public.posts (status, contradicted_count)
  where contradicted_count > 0;
-- "Held" lists on the queue, Articles and Overview.
create index if not exists posts_held_idx
  on public.posts (status, held_at)
  where held_reason is not null;
-- Daily auto-publish cap (evaluateGate and content_schedule_checked()).
create index if not exists posts_auto_scheduled_at_idx
  on public.posts (auto_scheduled_at)
  where auto_scheduled_at is not null;

-- Column privileges: never anon; admins read/write through `authenticated`
-- (which keeps table-level privileges under the is_admin() RLS policies).
revoke select (held_reason, held_at, contradicted_count, schedule_checked_at, schedule_checked_by),
  insert (held_reason, held_at, contradicted_count, schedule_checked_at, schedule_checked_by),
  update (held_reason, held_at, contradicted_count, schedule_checked_at, schedule_checked_by),
  references (held_reason, held_at, contradicted_count, schedule_checked_at, schedule_checked_by)
  on public.posts from public, anon;
grant select (held_reason, held_at, contradicted_count, schedule_checked_at, schedule_checked_by)
  on public.posts to authenticated;
grant update (held_reason, held_at) on public.posts to authenticated;
grant all on public.posts to service_role;

-- Publish bookkeeping and the override rule, enforced for every writer
-- (edge functions, the admin UI and ad-hoc SQL alike).
create or replace function public.posts_publish_audit_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- An override must name who, when and why. This blocks out-of-band bulk
  -- overrides like the 318 posts published with publish_override_by NULL.
  -- Rows already overridden stay editable while the override is untouched.
  if new.publish_override is true and (
    tg_op = 'INSERT'
    or old.publish_override is distinct from true
    or new.publish_override_reason is distinct from old.publish_override_reason
  ) then
    if new.publish_override_by is null
      or new.publish_override_at is null
      or char_length(btrim(coalesce(new.publish_override_reason, ''))) < 10
    then
      raise exception 'A publish override needs publish_override_by, publish_override_at and a reason of at least 10 characters. Use manual-publish, one post at a time'
        using errcode = 'check_violation';
    end if;
  end if;

  if tg_op = 'UPDATE' then
    if new.status = 'published' and old.status is distinct from 'published' then
      new.held_reason := null;
      new.held_at := null;
      new.published_at := coalesce(new.published_at, now());
    end if;
    if old.status = 'scheduled' and new.status is distinct from 'scheduled' then
      new.schedule_checked_at := null;
      new.schedule_checked_by := null;
    end if;
  elsif new.status = 'published' then
    new.published_at := coalesce(new.published_at, now());
  end if;
  return new;
end $$;

drop trigger if exists posts_publish_audit_guard on public.posts;
create trigger posts_publish_audit_guard
  before insert or update on public.posts
  for each row execute function public.posts_publish_audit_guard();

-- Append-only audit of gate overrides, one row per overridden post. Written by
-- manual-publish (service role) before the post is changed.
create table if not exists public.post_publish_overrides (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  mode text not null check (mode in ('publish', 'schedule')),
  reason text not null check (char_length(btrim(reason)) between 10 and 1000),
  failures jsonb not null default '[]'::jsonb
    check (jsonb_typeof(failures) = 'array'),
  overridden_by uuid not null,
  created_at timestamptz not null default now()
);
create index if not exists post_publish_overrides_post_idx
  on public.post_publish_overrides (post_id, created_at desc);

alter table public.post_publish_overrides enable row level security;
drop policy if exists "Admins can read publish overrides" on public.post_publish_overrides;
create policy "Admins can read publish overrides"
  on public.post_publish_overrides
  for select to authenticated
  using (public.is_admin(auth.uid()));

revoke all on public.post_publish_overrides from public, anon, authenticated;
grant select on public.post_publish_overrides to authenticated;
grant all on public.post_publish_overrides to service_role;

-- Auto-publish slots follow other AUTO-scheduled posts only. Before this, a
-- post Brian hand-scheduled weeks ahead pushed every auto-publish slot after
-- it (slot = max(scheduled_at of any scheduled post) + 90 minutes). Body is
-- otherwise identical to 20260917072000_pipeline_claim_ownership.sql.
create or replace function public.content_schedule_checked(_post_id uuid) returns jsonb
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
  select greatest(now()+interval '10 minutes',coalesce(max(scheduled_at)+interval '90 minutes',now())) into slot
    from public.posts where status='scheduled' and auto_scheduled_at is not null;
  update public.posts set status='scheduled',scheduled_at=slot,auto_scheduled_at=now() where id=p.id;
  update public.content_opportunities set status='approved' where id=p.opportunity_id;
  return jsonb_build_object('decision','scheduled','scheduled_at',slot);
end $$;
revoke all on function public.content_schedule_checked(uuid) from public, anon, authenticated;
grant execute on function public.content_schedule_checked(uuid) to service_role;
