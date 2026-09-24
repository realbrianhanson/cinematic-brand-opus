-- Automatic 404 handling.
--
-- Missing public pages redirect to the home page automatically. Admins can add
-- a specific rule when a better page exists. Visitors (anon) never touch the
-- tables: the site calls two SECURITY DEFINER functions that validate every
-- input, strip query strings, store only a user-agent class (never the full
-- user agent) and cap both counters and table size.
--
-- Path rules mirror supabase/functions/_shared/redirectPaths.ts.

create table if not exists public.redirect_rules (
  id uuid primary key default gen_random_uuid(),
  from_path text not null,
  to_path text not null,
  status_code smallint not null default 301,
  is_active boolean not null default true,
  hits integer not null default 0,
  last_hit_at timestamptz,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint redirect_rules_from_path_key unique (from_path),
  constraint redirect_rules_status_code_check check (status_code in (301, 302)),
  constraint redirect_rules_hits_check check (hits >= 0),
  constraint redirect_rules_note_length check (note is null or length(note) <= 500),
  constraint redirect_rules_from_path_shape check (
    length(from_path) between 2 and 512
    and from_path ~ '^/[^?#]*[^/?#]$'
    and from_path = lower(from_path)
  ),
  -- A site path ("/about", never "//host") or a full https:// address with no
  -- credentials, spaces or backslashes.
  constraint redirect_rules_to_path_shape check (
    (
      length(to_path) <= 512
      and to_path ~ '^/($|[^/])'
      and to_path !~ '[[:space:][:cntrl:]\\]'
    )
    or (
      length(to_path) <= 2048
      and to_path ~* '^https://[a-z0-9.-]+(:[0-9]{1,5})?([/?#][^[:space:][:cntrl:]\\]*)?$'
    )
  )
);

create table if not exists public.not_found_hits (
  path text primary key,
  hits integer not null default 1,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  last_referrer text,
  last_user_agent_class text not null default 'unknown',
  constraint not_found_hits_path_shape check (
    length(path) between 2 and 512 and path ~ '^/[^?#]*$'
  ),
  constraint not_found_hits_hits_check check (hits >= 1),
  constraint not_found_hits_referrer_length check (
    last_referrer is null or length(last_referrer) <= 300
  ),
  constraint not_found_hits_ua_class check (
    last_user_agent_class in ('bot', 'human', 'unknown')
  )
);

create index if not exists not_found_hits_hits_idx
  on public.not_found_hits (hits desc, last_seen desc);

-- ---------- internal helpers (not callable by the API roles) ----------

create or replace function public.normalize_redirect_path(p_path text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v text;
begin
  if p_path is null or length(p_path) > 4096 then
    return null;
  end if;
  v := btrim(p_path, E' \t\r\n');
  v := split_part(split_part(v, '#', 1), '?', 1);
  if left(v, 1) is distinct from '/' or length(v) > 512 then
    return null;
  end if;
  if v ~ '[[:space:][:cntrl:]\\]' then
    return null;
  end if;
  v := lower(regexp_replace(v, '/{2,}', '/', 'g'));
  if v ~ '(^|/)\.{1,2}(/|$)' then
    return null;
  end if;
  if length(v) > 1 then
    v := regexp_replace(v, '/+$', '');
    if v = '' then
      v := '/';
    end if;
  end if;
  return v;
end;
$$;

-- Missing pages that keep their real 404: home, app internals, files, probes.
create or replace function public.redirect_path_eligible(p_path text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_path is not null
    and p_path <> '/'
    and p_path !~ '^/(admin|api|assets|wordpress|cgi-bin|xmlrpc|phpmyadmin)(/|$)'
    and p_path !~ '^/(_|wp-)'
    and p_path !~ '/\.'
    and p_path !~* '\.[a-z0-9]{1,10}$'
$$;

-- Normalizes the old address and refuses self-redirects and chains, so a
-- visitor is never bounced between two missing pages.
create or replace function public.redirect_rules_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_target text;
begin
  new.from_path := public.normalize_redirect_path(new.from_path);
  if new.from_path is null then
    raise exception 'Enter the old address as a site path like /old-page'
      using errcode = '22023';
  end if;
  if not public.redirect_path_eligible(new.from_path) then
    raise exception 'That address can''t be redirected'
      using errcode = '22023';
  end if;
  new.to_path := btrim(new.to_path);
  new.note := nullif(btrim(new.note), '');
  v_target := case
    when left(new.to_path, 1) = '/' then public.normalize_redirect_path(new.to_path)
  end;
  if v_target = new.from_path then
    raise exception 'A page can''t redirect to itself' using errcode = '22023';
  end if;
  if new.is_active then
    if v_target is not null and exists (
      select 1 from public.redirect_rules r
      where r.from_path = v_target and r.is_active and r.id <> new.id
    ) then
      raise exception 'That page already redirects somewhere else, so point this rule at the final page instead'
        using errcode = '22023';
    end if;
    if exists (
      select 1 from public.redirect_rules r
      where r.is_active and r.id <> new.id
        and left(r.to_path, 1) = '/'
        and public.normalize_redirect_path(r.to_path) = new.from_path
    ) then
      raise exception 'Another rule sends visitors to this address, so change that rule first'
        using errcode = '22023';
    end if;
    -- The missing page now has a destination.
    delete from public.not_found_hits where path = new.from_path;
  end if;
  if tg_op = 'UPDATE' then
    new.updated_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists redirect_rules_before_write on public.redirect_rules;
create trigger redirect_rules_before_write
  before insert or update of from_path, to_path, status_code, is_active, note
  on public.redirect_rules
  for each row execute function public.redirect_rules_before_write();

-- ---------- public entry points (anon) ----------

create or replace function public.resolve_redirect(p_path text)
returns table (to_path text, status_code smallint)
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_path text := public.normalize_redirect_path(p_path);
begin
  if v_path is null or v_path = '/' then
    return;
  end if;
  return query
    update public.redirect_rules as r
       set hits = least(r.hits::bigint + 1, 2147483647)::integer,
           last_hit_at = now()
     where r.from_path = v_path and r.is_active
    returning r.to_path, r.status_code;
end;
$$;

create or replace function public.record_not_found(
  p_path text,
  p_referrer text default null,
  p_ua_class text default 'unknown'
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_path text := public.normalize_redirect_path(p_path);
  v_referrer text;
  v_ua text := case
    when p_ua_class in ('bot', 'human', 'unknown') then p_ua_class
    else 'unknown'
  end;
  v_capacity constant integer := 5000;
begin
  if not coalesce(public.redirect_path_eligible(v_path), false) then
    return false;
  end if;
  -- A path with an active rule is not missing.
  if exists (
    select 1 from public.redirect_rules r
    where r.from_path = v_path and r.is_active
  ) then
    return false;
  end if;
  -- Web referrers only, origin + path, no credentials, no query string.
  if length(p_referrer) <= 4096
    and p_referrer ~* '^https?://[^/@[:space:][:cntrl:]]+(/[^[:space:][:cntrl:]]*)?$' then
    v_referrer := left(split_part(split_part(p_referrer, '#', 1), '?', 1), 300);
  end if;

  update public.not_found_hits
     set hits = least(hits::bigint + 1, 2147483647)::integer,
         last_seen = now(),
         last_referrer = coalesce(v_referrer, last_referrer),
         last_user_agent_class = v_ua
   where path = v_path;
  if found then
    return true;
  end if;

  -- Bounded table: random-path spam cannot grow it forever. Stale one-off
  -- entries make room; otherwise new paths are simply not recorded.
  if (select count(*) from public.not_found_hits) >= v_capacity then
    delete from public.not_found_hits
     where path in (
       select h.path from public.not_found_hits h
        where h.hits = 1 and h.last_seen < now() - interval '7 days'
        order by h.last_seen
        limit 100
     );
    if (select count(*) from public.not_found_hits) >= v_capacity then
      return false;
    end if;
  end if;

  insert into public.not_found_hits (path, last_referrer, last_user_agent_class)
  values (v_path, v_referrer, v_ua)
  on conflict (path) do update
    set hits = least(public.not_found_hits.hits::bigint + 1, 2147483647)::integer,
        last_seen = now(),
        last_referrer = coalesce(excluded.last_referrer, public.not_found_hits.last_referrer),
        last_user_agent_class = excluded.last_user_agent_class;
  return true;
end;
$$;

-- ---------- privileges ----------

alter table public.redirect_rules enable row level security;
alter table public.not_found_hits enable row level security;

revoke all on table public.redirect_rules, public.not_found_hits
  from public, anon, authenticated;
grant select, insert, update, delete on table public.redirect_rules to authenticated;
grant select, delete on table public.not_found_hits to authenticated;
grant all on table public.redirect_rules, public.not_found_hits to service_role;

drop policy if exists redirect_rules_admin_all on public.redirect_rules;
create policy redirect_rules_admin_all on public.redirect_rules
  for all to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

drop policy if exists not_found_hits_admin_read on public.not_found_hits;
create policy not_found_hits_admin_read on public.not_found_hits
  for select to authenticated
  using (public.is_admin(auth.uid()));

drop policy if exists not_found_hits_admin_delete on public.not_found_hits;
create policy not_found_hits_admin_delete on public.not_found_hits
  for delete to authenticated
  using (public.is_admin(auth.uid()));

revoke all on function public.normalize_redirect_path(text) from public, anon, authenticated;
revoke all on function public.redirect_path_eligible(text) from public, anon, authenticated;
revoke all on function public.redirect_rules_before_write() from public, anon, authenticated;
grant execute on function public.normalize_redirect_path(text) to service_role;
grant execute on function public.redirect_path_eligible(text) to service_role;

revoke all on function public.resolve_redirect(text) from public;
revoke all on function public.record_not_found(text, text, text) from public;
grant execute on function public.resolve_redirect(text) to anon, authenticated, service_role;
grant execute on function public.record_not_found(text, text, text) to anon, authenticated, service_role;

-- ---------- seed rules (links that are getting traffic today) ----------

insert into public.redirect_rules (from_path, to_path, status_code, note)
values
  ('/my-story', '/about', 301, 'Old story page, now the About page'),
  ('/contact', '/speaking', 301, 'Contact requests go to speaking inquiries'),
  ('/newsletter', '/', 302, 'No newsletter page yet')
on conflict (from_path) do nothing;
