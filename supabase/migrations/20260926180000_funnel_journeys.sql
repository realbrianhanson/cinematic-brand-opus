-- Standalone qualification journeys. Published snapshots and sessions never expose drafts.
create table public.funnel_journeys (
 id uuid primary key, slug text not null unique check(slug ~ '^[a-z][a-z0-9-]{0,79}$'), title text not null check(length(title) between 1 and 160),
 draft_graph jsonb not null, version integer not null default 1, published_version integer, active boolean not null default false,
 updated_at timestamptz not null default now()
);
create table public.funnel_journey_revisions (
 journey_id uuid not null references public.funnel_journeys(id), version integer not null,
 slug text not null, title text not null, graph jsonb not null, published boolean not null, created_at timestamptz not null default now(),
 primary key(journey_id,version)
);
create table public.funnel_journey_requests (
 request_id uuid primary key, input jsonb not null, result jsonb not null, created_at timestamptz not null default now()
);
create table public.funnel_journey_sessions (
 token_hash text primary key check(token_hash ~ '^[a-f0-9]{64}$'), journey_id uuid not null,
 revision integer not null, current_step text not null, visited jsonb not null default '[]', answers jsonb not null default '{}', version integer not null default 0,
 expires_at timestamptz not null default (now()+interval '7 days'), foreign key(journey_id,revision) references public.funnel_journey_revisions(journey_id,version)
);
create table public.funnel_journey_transitions (
 token_hash text not null references public.funnel_journey_sessions(token_hash) on delete cascade, request_id uuid not null, input jsonb not null, result jsonb not null,
 primary key(token_hash,request_id)
);
alter table public.funnel_journeys enable row level security;
alter table public.funnel_journey_revisions enable row level security;
alter table public.funnel_journey_requests enable row level security;
alter table public.funnel_journey_sessions enable row level security;
alter table public.funnel_journey_transitions enable row level security;
revoke all on public.funnel_journeys,public.funnel_journey_revisions,public.funnel_journey_requests,public.funnel_journey_sessions,public.funnel_journey_transitions from public,anon,authenticated;
grant select on public.funnel_journeys,public.funnel_journey_revisions to authenticated;
create policy admin_journeys_read on public.funnel_journeys for select to authenticated using(public.is_admin(auth.uid()));
create policy admin_journey_revisions_read on public.funnel_journey_revisions for select to authenticated using(public.is_admin(auth.uid()));
grant all on public.funnel_journeys,public.funnel_journey_revisions,public.funnel_journey_requests,public.funnel_journey_sessions,public.funnel_journey_transitions to service_role;

create function public.funnel_graph_validate(g jsonb, publishing boolean default false) returns void language plpgsql set search_path=public,pg_temp as $$
declare s jsonb; o jsonb; branch record; ids text[] := '{}'; opts text[]; target text; targets text[]; k text; allowed text[]; reached text[]; cycle_found boolean;
begin
 if jsonb_typeof(g) is distinct from 'object' or g->'version' is distinct from '1'::jsonb or jsonb_typeof(g->'steps') is distinct from 'array' then raise exception 'Invalid journey graph'; end if;
 if exists(select 1 from jsonb_object_keys(g) key where key not in ('version','entryStepId','steps')) or jsonb_array_length(g->'steps') not between 1 and 30 then raise exception 'Invalid journey graph'; end if;
 for s in select value from jsonb_array_elements(g->'steps') loop
  if jsonb_typeof(s) is distinct from 'object' then raise exception 'Invalid step'; end if;
  k := s->>'kind';
  if coalesce(s->>'id','') !~ '^[a-z][a-z0-9-]{0,47}$' or s->>'id'=any(ids) or k is null or k not in ('content','choice','offer','provider','end') or jsonb_typeof(s->'title') is distinct from 'string' or length(trim(s->>'title')) not between 1 and 160 or jsonb_typeof(s->'body') is distinct from 'string' or length(s->>'body')>6000 then raise exception 'Invalid step'; end if;
  ids := array_append(ids,s->>'id'); allowed := array['id','kind','title','body'];
  if k='choice' then allowed := allowed||array['options','branches','defaultStepId'];
  elsif k='offer' then allowed := allowed||array['offerId','nextStepId'];
  elsif k='provider' then allowed := allowed||array['url','nextStepId'];
  elsif k='content' then allowed := allowed||array['nextStepId']; end if;
  if exists(select 1 from jsonb_object_keys(s) key where not key=any(allowed)) then raise exception 'Unsupported step field'; end if;
  if k in ('content','offer','provider') and coalesce(s->>'nextStepId','') !~ '^[a-z][a-z0-9-]{0,47}$' then raise exception 'Missing next step'; end if;
  if k='offer' then
   if coalesce(s->>'offerId','') !~* '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' then raise exception 'Invalid offer'; end if;
   if publishing and not exists(select 1 from offers where id=(s->>'offerId')::uuid and status='published' and not funnel_only) then raise exception 'Offer target must be publicly available'; end if;
  end if;
  if k='provider' and (jsonb_typeof(s->'url') is distinct from 'string' or length(s->>'url')>2048 or coalesce(s->>'url','') !~ '^https://[A-Za-z0-9][^[:space:]\\]*$' or s->>'url' ~ '^https://[^/]*@') then raise exception 'Invalid provider URL'; end if;
  if k='choice' then
   if jsonb_typeof(s->'options') is distinct from 'array' or jsonb_typeof(s->'branches') is distinct from 'object' or coalesce(s->>'defaultStepId','') !~ '^[a-z][a-z0-9-]{0,47}$' then raise exception 'Invalid question'; end if;
   if jsonb_array_length(s->'options') not between 2 and 8 then raise exception 'Invalid choices'; end if;
   opts := '{}';
   for o in select value from jsonb_array_elements(s->'options') loop
    if jsonb_typeof(o) is distinct from 'object' then raise exception 'Invalid choice'; end if;
    if exists(select 1 from jsonb_object_keys(o) key where key not in ('id','label')) or coalesce(o->>'id','') !~ '^[a-z][a-z0-9-]{0,47}$' or o->>'id'=any(opts) or jsonb_typeof(o->'label') is distinct from 'string' or length(trim(o->>'label')) not between 1 and 200 then raise exception 'Invalid choice'; end if;
    opts := array_append(opts,o->>'id');
   end loop;
   for branch in select * from jsonb_each(s->'branches') loop
    if not branch.key=any(opts) or jsonb_typeof(branch.value) is distinct from 'string' then raise exception 'Invalid choice branch'; end if;
   end loop;
  end if;
 end loop;
 if not coalesce(g->>'entryStepId','')=any(ids) then raise exception 'Missing entry step'; end if;
 for s in select value from jsonb_array_elements(g->'steps') loop
  targets := '{}';
  if s->>'kind'='choice' then
   select array_agg(value) into targets from jsonb_each_text(s->'branches'); targets := array_append(coalesce(targets,'{}'),s->>'defaultStepId');
  elsif s ? 'nextStepId' then targets := array[s->>'nextStepId']; end if;
  foreach target in array targets loop if not target=any(ids) then raise exception 'Missing destination'; end if; end loop;
 end loop;
 with recursive edges as (
  select node->>'id' source, node->>'nextStepId' target from jsonb_array_elements(g->'steps') node where node ? 'nextStepId'
  union select node->>'id', node->>'defaultStepId' from jsonb_array_elements(g->'steps') node where node->>'kind'='choice'
  union select node->>'id',b.value from jsonb_array_elements(g->'steps') node cross join lateral jsonb_each_text(coalesce(node->'branches','{}')) b
 ), closure(source,target) as (
  select e.source,e.target from edges e
  union select c.source,e.target from closure c join edges e on e.source=c.target
 ) select array(select distinct c.target from closure c where c.source=g->>'entryStepId' union select g->>'entryStepId'),exists(select 1 from closure c where c.source=c.target) into reached,cycle_found;
 if cycle_found then raise exception 'Journey cycle'; end if;
 if cardinality(reached)<>cardinality(ids) then raise exception 'Unreachable step'; end if;
 if not exists(select 1 from jsonb_array_elements(g->'steps') node where node->>'kind'='end') then raise exception 'Missing end step'; end if;
end $$;

-- Called with the signed-in administrator JWT, not the service role.
create function public.funnel_journey_save(_id uuid,_slug text,_title text,_graph jsonb,_expected_version integer,_publish boolean,_active boolean,_request_id uuid) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare j funnel_journeys; previous funnel_journey_requests; payload jsonb; result jsonb; next_version integer;
begin
 if not coalesce(public.is_admin(auth.uid()),false) then raise exception 'Admins only'; end if;
 if _id is null or _request_id is null or _expected_version is null or _expected_version<0 or _publish is null or _active is null then raise exception 'Missing request fields'; end if;
 payload := jsonb_build_object('id',_id,'slug',_slug,'title',_title,'graph',_graph,'expectedVersion',_expected_version,'publish',_publish,'active',_active);
 perform pg_advisory_xact_lock(hashtextextended(_request_id::text,0));
 select * into previous from funnel_journey_requests where request_id=_request_id;
 if found then if previous.input<>payload then raise exception 'Request replay mismatch'; end if; return previous.result; end if;
 perform pg_advisory_xact_lock(hashtextextended(_id::text,1));
 select * into j from funnel_journeys where id=_id for update;
 if coalesce(j.version,0)<>_expected_version then raise exception 'Journey revision conflict'; end if;
 if j.id is not null and j.slug<>_slug then raise exception 'Saved journey addresses are stable'; end if;
 if coalesce(_slug,'') !~ '^[a-z][a-z0-9-]{0,79}$' or length(trim(coalesce(_title,''))) not between 1 and 160 then raise exception 'Invalid journey details'; end if;
 perform funnel_graph_validate(_graph,_publish);
 next_version := coalesce(j.version,0)+1;
 insert into funnel_journeys(id,slug,title,draft_graph,version,published_version,active) values(_id,_slug,_title,_graph,next_version,case when _publish then next_version end,_publish and _active)
 on conflict(id) do update set slug=excluded.slug,title=excluded.title,draft_graph=excluded.draft_graph,version=excluded.version,published_version=case when _publish then next_version else j.published_version end,active=case when _publish then _active when not _active then false else j.active end,updated_at=now();
 insert into funnel_journey_revisions(journey_id,version,slug,title,graph,published) values(_id,next_version,_slug,_title,_graph,_publish);
 select to_jsonb(f) into result from funnel_journeys f where id=_id;
 insert into funnel_journey_requests(request_id,input,result) values(_request_id,payload,result);
 return result;
end $$;

create function public.funnel_public_journey(_slug text) returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
 select jsonb_build_object('slug',r.slug,'title',r.title,'revision',r.version)
 from funnel_journeys j join funnel_journey_revisions r on r.journey_id=j.id and r.version=j.published_version
 where j.active and r.published and r.slug=_slug limit 1
$$;
create function public.funnel_session_view(_token_hash text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare s funnel_journey_sessions; r funnel_journey_revisions; step jsonb; target_offer jsonb;
begin
 select * into s from funnel_journey_sessions where token_hash=_token_hash and expires_at>now();
 if not found then raise exception 'Session expired'; end if;
 if not exists(select 1 from funnel_journeys where id=s.journey_id and active) then raise exception 'Journey unavailable'; end if;
 select * into r from funnel_journey_revisions where journey_id=s.journey_id and version=s.revision and published;
 select value into step from jsonb_array_elements(r.graph->'steps') where value->>'id'=s.current_step;
 if step->>'kind'='offer' then select jsonb_build_object('id',id,'slug',slug,'title',title,'checkout_mode',checkout_mode) into target_offer from offers where id=(step->>'offerId')::uuid and status='published' and not funnel_only; end if;
 return jsonb_build_object('title',r.title,'revision',r.version,'version',s.version,'step',step-'branches'-'defaultStepId'-'nextStepId','visited',s.visited,'offer',target_offer);
end $$;
create function public.funnel_session_start(_slug text,_token_hash text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare j funnel_journeys; r funnel_journey_revisions; prior funnel_journey_sessions;
begin
 perform pg_advisory_xact_lock(hashtextextended(_token_hash,2));
 select * into j from funnel_journeys where active and id in(select journey_id from funnel_journey_revisions where slug=_slug and published and version=funnel_journeys.published_version);
 if not found then raise exception 'Journey unavailable'; end if;
 select * into prior from funnel_journey_sessions where token_hash=_token_hash;
 if found then if prior.journey_id<>j.id then raise exception 'Session mismatch'; end if; return funnel_session_view(_token_hash); end if;
 select * into r from funnel_journey_revisions where journey_id=j.id and version=j.published_version;
 insert into funnel_journey_sessions(token_hash,journey_id,revision,current_step) values(_token_hash,j.id,r.version,r.graph->>'entryStepId');
 return funnel_session_view(_token_hash);
end $$;
create function public.funnel_session_advance(_token_hash text,_step_id text,_answer text,_expected_version integer,_request_id uuid) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare s funnel_journey_sessions; r funnel_journey_revisions; step jsonb; target text; payload jsonb; prior funnel_journey_transitions; result jsonb;
begin
 if _request_id is null or _step_id is null or _expected_version is null then raise exception 'Missing transition fields'; end if;
 select * into s from funnel_journey_sessions where token_hash=_token_hash for update;
 if not found or s.expires_at<=now() then raise exception 'Session expired'; end if;
 perform funnel_session_view(_token_hash);
 payload := jsonb_build_object('step',_step_id,'answer',_answer,'version',_expected_version);
 select * into prior from funnel_journey_transitions where token_hash=_token_hash and request_id=_request_id;
 if found then if prior.input<>payload then raise exception 'Request replay mismatch'; end if; return prior.result; end if;
 if s.version<>_expected_version or s.current_step<>_step_id then raise exception 'Session revision conflict'; end if;
 select * into r from funnel_journey_revisions where journey_id=s.journey_id and version=s.revision;
 select value into step from jsonb_array_elements(r.graph->'steps') where value->>'id'=s.current_step;
 if step->>'kind'='end' then raise exception 'Journey ended'; end if;
 if step->>'kind'='choice' then
  if _answer is null or not exists(select 1 from jsonb_array_elements(step->'options') o where o->>'id'=_answer) then raise exception 'Invalid choice'; end if;
  target := coalesce(step->'branches'->>_answer,step->>'defaultStepId');
 elsif _answer is not null then raise exception 'Unexpected answer';
 else target := step->>'nextStepId'; end if;
 update funnel_journey_sessions set current_step=target,visited=visited||jsonb_build_array(jsonb_build_object('id',step->>'id','title',step->>'title')),answers=case when _answer is not null then answers||jsonb_build_object(_step_id,_answer) else answers end,version=version+1 where token_hash=_token_hash;
 result := funnel_session_view(_token_hash);
 insert into funnel_journey_transitions(token_hash,request_id,input,result) values(_token_hash,_request_id,payload,result);
 return result;
end $$;
revoke execute on function public.funnel_graph_validate(jsonb,boolean),public.funnel_journey_save(uuid,text,text,jsonb,integer,boolean,boolean,uuid),public.funnel_public_journey(text),public.funnel_session_view(text),public.funnel_session_start(text,text),public.funnel_session_advance(text,text,text,integer,uuid) from public,anon,authenticated;
grant execute on function public.funnel_journey_save(uuid,text,text,jsonb,integer,boolean,boolean,uuid) to authenticated;
grant execute on function public.funnel_public_journey(text) to anon,authenticated,service_role;
grant execute on function public.funnel_graph_validate(jsonb,boolean),public.funnel_session_view(text),public.funnel_session_start(text,text),public.funnel_session_advance(text,text,text,integer,uuid) to service_role;

create index funnel_sessions_expiry_idx on public.funnel_journey_sessions(expires_at);
create function public.funnel_journey_cleanup() returns void language sql security definer set search_path=public,pg_temp as $$
 delete from funnel_journey_sessions where expires_at<=now()
$$;
revoke execute on function public.funnel_journey_cleanup() from public,anon,authenticated;
grant execute on function public.funnel_journey_cleanup() to service_role;
-- Anonymous choices expire after seven days and are removed by the daily retention task.
select cron.schedule('funnel-journey-retention-daily','41 4 * * *','select public.funnel_journey_cleanup()');
