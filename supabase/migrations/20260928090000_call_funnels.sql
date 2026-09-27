-- Native video/application funnels remain separate from version-1 choice journeys.
create table public.call_funnels (
 id uuid primary key, slug text not null unique check(slug ~ '^[a-z][a-z0-9-]{0,79}$'),
 title text not null check(length(btrim(title)) between 1 and 160),
 draft_config jsonb not null, version integer not null default 1,
 published_version integer, active boolean not null default false,
 updated_at timestamptz not null default now()
);
create table public.call_funnel_revisions (
 funnel_id uuid not null references public.call_funnels(id), version integer not null,
 slug text not null, title text not null, config jsonb not null, published boolean not null,
 created_at timestamptz not null default now(), primary key(funnel_id,version)
);
create table public.call_funnel_requests (
 request_id uuid primary key, actor_id uuid not null, input jsonb not null, result jsonb not null,
 created_at timestamptz not null default now()
);
create table public.call_funnel_applications (
 id uuid primary key default gen_random_uuid(), funnel_id uuid not null,
 revision integer not null, token_hash text not null unique check(token_hash ~ '^[a-f0-9]{64}$'),
 request_id uuid not null unique, contact jsonb not null, answers jsonb not null,
 consent boolean not null check(consent), outcome text not null check(outcome in ('qualified','alternative')),
 submitted_at timestamptz not null default now(), expires_at timestamptz not null default(now()+interval '7 days'),
 retain_until timestamptz not null default(now()+interval '90 days'),
 foreign key(funnel_id,revision) references public.call_funnel_revisions(funnel_id,version)
);
create table public.call_funnel_events (
 id uuid primary key default gen_random_uuid(), application_id uuid not null references public.call_funnel_applications(id) on delete cascade,
 source text not null check(source in ('admin','signed_webhook')),
 event_key text not null check(length(event_key) between 1 and 160),
 type text not null check(type in ('booked','cancelled','rescheduled','attended','no_show','sale')),
 occurred_at timestamptz not null, starts_at timestamptz, reference text not null check(length(btrim(reference)) between 1 and 300),
 note text not null default '' check(length(note)<=2000), actor_id uuid,
 created_at timestamptz not null default now(), unique(source,event_key),
 check((source='admin' and actor_id is not null) or (source='signed_webhook' and actor_id is null)),
 check(type not in ('booked','rescheduled') or starts_at is not null)
);
create index call_applications_funnel_idx on public.call_funnel_applications(funnel_id,submitted_at desc);
create index call_applications_revision_idx on public.call_funnel_applications(funnel_id,revision);
create index call_applications_retention_idx on public.call_funnel_applications(retain_until);
create index call_requests_retention_idx on public.call_funnel_requests(created_at);
create index call_events_application_idx on public.call_funnel_events(application_id,occurred_at desc);

alter table public.call_funnels enable row level security;
alter table public.call_funnel_revisions enable row level security;
alter table public.call_funnel_requests enable row level security;
alter table public.call_funnel_applications enable row level security;
alter table public.call_funnel_events enable row level security;
revoke all on public.call_funnels,public.call_funnel_revisions,public.call_funnel_requests,public.call_funnel_applications,public.call_funnel_events from public,anon,authenticated;
grant select on public.call_funnels,public.call_funnel_revisions to authenticated;
create policy call_funnels_admin_read on public.call_funnels for select to authenticated using((select public.is_admin(auth.uid())));
create policy call_revisions_admin_read on public.call_funnel_revisions for select to authenticated using((select public.is_admin(auth.uid())));
-- Applications/events have no direct client grants; the bounded admin RPC is the only read surface.
grant select,insert,update,delete on public.call_funnels,public.call_funnel_revisions,public.call_funnel_requests,public.call_funnel_applications,public.call_funnel_events to service_role;

create function public.call_funnel_keys(v jsonb, allowed text[]) returns boolean language sql immutable set search_path=public,pg_temp as $$
 select jsonb_typeof(v)='object' and not exists(select 1 from jsonb_object_keys(case when jsonb_typeof(v)='object' then v else '{}'::jsonb end) k where not k=any(allowed))
$$;
create function public.call_funnel_text(v jsonb, maximum integer, required boolean default false) returns boolean language sql immutable set search_path=public,pg_temp as $$
 select coalesce(jsonb_typeof(v)='string' and length(v#>>'{}')<=maximum and (not required or length(btrim(v#>>'{}'))>0),false)
$$;
create function public.call_funnel_shape(v jsonb, fields text[]) returns boolean language sql immutable set search_path=public,pg_temp as $$
 select coalesce(public.call_funnel_keys(v,fields) and (select count(*) from jsonb_object_keys(case when jsonb_typeof(v)='object' then v else '{}'::jsonb end))=cardinality(fields),false)
$$;
create function public.call_funnel_url(v jsonb, local boolean default false) returns boolean language sql immutable set search_path=public,pg_temp as $$
 select coalesce(jsonb_typeof(v)='string' and length(v#>>'{}')<=2048 and ((v#>>'{}')='' or
 ((v#>>'{}') !~ '[[:space:]\\]' and ((local and (v#>>'{}') ~ '^/[a-zA-Z0-9_.,?=#%&+-][a-zA-Z0-9/_.,?=#%&+-]*$') or (local and (v#>>'{}')='/') or
 ((v#>>'{}') ~ '^https://[A-Za-z0-9][^[:space:]\\]*$' and (v#>>'{}') !~ '^https://[^/]*@')))),false)
$$;
create function public.call_funnel_media(v jsonb) returns boolean language sql immutable set search_path=public,pg_temp as $$
 select public.call_funnel_shape(v,array['url','poster','transcript']) and public.call_funnel_url(v->'url') and public.call_funnel_url(v->'poster',true) and public.call_funnel_text(v->'transcript',12000)
$$;
create function public.call_funnel_config_validate(c jsonb, publishing boolean default false) returns void language plpgsql set search_path=public,pg_temp as $$
declare q jsonb; item jsonb; opt jsonb; field text; maxlen integer; ids text[] := '{}'; options text[]; prior jsonb; proof_id text; branch jsonb;
begin
 if not call_funnel_shape(c,array['version','theme','brand','invitation','application','questions','qualificationRules','booking','preparation','training','alternative','proofIds','proofImages','scripts']) or c->'version' is distinct from '1'::jsonb or length(c::text)>262144 then raise exception 'Invalid call funnel config'; end if;
 if not call_funnel_shape(c->'theme',array['mode','accent','font']) or coalesce(c#>>'{theme,mode}','') not in ('dark','light','site') or coalesce(c#>>'{theme,font}','') not in ('sans','serif','brand') or coalesce(c#>>'{theme,accent}','') !~ '^#[a-fA-F0-9]{6}$' then raise exception 'Invalid call funnel theme'; end if;
 if not call_funnel_shape(c->'brand',array['name','hostName','hostRole','hostBio','hostImage']) then raise exception 'Invalid call funnel brand'; end if;
 foreach field in array array['name','hostName','hostRole'] loop if not call_funnel_text(c->'brand'->field,160,publishing and field='name') then raise exception 'Invalid call funnel brand text'; end if; end loop;
 if not call_funnel_text(c#>'{brand,hostBio}',3000) or not call_funnel_url(c#>'{brand,hostImage}',true) then raise exception 'Invalid call funnel host'; end if;
 if not call_funnel_shape(c->'invitation',array['audience','headline','description','watchPrompt','video','promise','cta','ctaSubline','reassurance','proofHeading','closingHeadline']) then raise exception 'Invalid invitation'; end if;
 foreach field in array array['audience','headline','description','watchPrompt','promise','cta','ctaSubline','reassurance','proofHeading','closingHeadline'] loop
  maxlen:=case when field in ('description','reassurance') then 2000 else 500 end;
  if not call_funnel_text(c->'invitation'->field,maxlen,publishing and field in ('headline','cta')) then raise exception 'Invalid invitation text'; end if;
 end loop;
 if not call_funnel_media(c#>'{invitation,video}') then raise exception 'Invalid invitation media'; end if;
 if not call_funnel_shape(c->'application',array['heading','intro','consentText','privacyUrl']) or not call_funnel_text(c#>'{application,heading}',300,publishing) or not call_funnel_text(c#>'{application,intro}',1200) or not call_funnel_text(c#>'{application,consentText}',1200,publishing) or not call_funnel_url(c#>'{application,privacyUrl}',true) or (publishing and coalesce(c#>>'{application,privacyUrl}','')='') then raise exception 'Invalid application details'; end if;
 if jsonb_typeof(c->'questions') is distinct from 'array' or jsonb_array_length(c->'questions') not between 1 and 15 then raise exception 'Invalid application questions'; end if;
 for q in select value from jsonb_array_elements(c->'questions') loop
  if not call_funnel_text(q->'id',48,true) then raise exception 'Invalid application question identifier'; end if;
  if not call_funnel_keys(q,array['id','label','help','type','required','options','showWhen']) or not q ?& array['id','label','help','type','required','options'] or coalesce(q->>'id','') !~ '^[a-z][a-z0-9-]{0,47}$' or q->>'id'=any(ids) or not call_funnel_text(q->'label',500,true) or not call_funnel_text(q->'help',1000) or coalesce(q->>'type','') not in ('single','text','textarea') or jsonb_typeof(q->'required') is distinct from 'boolean' or jsonb_typeof(q->'options') is distinct from 'array' then raise exception 'Invalid application question'; end if;
  if (q->>'type'='single' and jsonb_array_length(q->'options') not between 2 and 8) or (q->>'type'<>'single' and jsonb_array_length(q->'options')<>0) then raise exception 'Invalid question choices'; end if;
  options:='{}';
  for opt in select value from jsonb_array_elements(q->'options') loop
   if not call_funnel_text(opt->'id',48,true) then raise exception 'Invalid question option identifier'; end if;
   if not call_funnel_shape(opt,array['id','label']) or coalesce(opt->>'id','') !~ '^[a-z][a-z0-9-]{0,47}$' or opt->>'id'=any(options) or not call_funnel_text(opt->'label',300,true) then raise exception 'Invalid question option'; end if;
   options:=array_append(options,opt->>'id');
  end loop;
  if q ? 'showWhen' then
   branch:=q->'showWhen';
   if not call_funnel_text(branch->'questionId',48,true) or not call_funnel_text(branch->'optionId',48,true) then raise exception 'Invalid question condition'; end if;
   if not call_funnel_shape(branch,array['questionId','optionId']) or not coalesce(branch->>'questionId','')=any(ids) then raise exception 'Invalid question condition'; end if;
   select value into prior from jsonb_array_elements(c->'questions') where value->>'id'=branch->>'questionId';
   if prior->>'type'<>'single' or not exists(select 1 from jsonb_array_elements(prior->'options') where value->>'id'=branch->>'optionId') then raise exception 'Invalid question condition'; end if;
  end if;
  ids:=array_append(ids,q->>'id');
 end loop;
 if jsonb_typeof(c->'qualificationRules') is distinct from 'array' or jsonb_array_length(c->'qualificationRules')>30 then raise exception 'Invalid fit rules'; end if;
 for item in select value from jsonb_array_elements(c->'qualificationRules') loop
  if not call_funnel_text(item->'questionId',48,true) or not call_funnel_text(item->'optionId',48,true) then raise exception 'Invalid fit rule'; end if;
  if not call_funnel_shape(item,array['questionId','optionId','outcome']) or item->>'outcome' is distinct from 'alternative' then raise exception 'Invalid fit rule'; end if;
  select value into q from jsonb_array_elements(c->'questions') where value->>'id'=item->>'questionId';
  if q is null or q->>'type'<>'single' or not exists(select 1 from jsonb_array_elements(q->'options') where value->>'id'=item->>'optionId') then raise exception 'Invalid fit rule target'; end if;
 end loop;
 if not call_funnel_shape(c->'booking',array['url','label','minutes','agenda']) or not call_funnel_url(c#>'{booking,url}') or not call_funnel_text(c#>'{booking,label}',120,publishing) or not call_funnel_text(c#>'{booking,agenda}',3000) or jsonb_typeof(c#>'{booking,minutes}') is distinct from 'number' or coalesce(c#>>'{booking,minutes}','') !~ '^[0-9]+$' then raise exception 'Invalid booking details'; end if;
 if (c#>>'{booking,minutes}')::numeric not between 5 and 240 or (publishing and c#>>'{booking,url}'='') then raise exception 'Invalid booking destination'; end if;
 if not call_funnel_shape(c->'preparation',array['headline','intro','video','checklist']) or not call_funnel_text(c#>'{preparation,headline}',300,publishing) or not call_funnel_text(c#>'{preparation,intro}',2000) or not call_funnel_media(c#>'{preparation,video}') or jsonb_typeof(c#>'{preparation,checklist}') is distinct from 'array' or jsonb_array_length(c#>'{preparation,checklist}')>12 then raise exception 'Invalid preparation'; end if;
 for item in select value from jsonb_array_elements(c#>'{preparation,checklist}') loop if not call_funnel_text(item,500,true) then raise exception 'Invalid preparation checklist'; end if; end loop;
 if not call_funnel_shape(c->'training',array['headline','intro','video','chapters','notesPrompt']) or not call_funnel_text(c#>'{training,headline}',300,publishing) or not call_funnel_text(c#>'{training,intro}',2000) or not call_funnel_text(c#>'{training,notesPrompt}',500) or not call_funnel_media(c#>'{training,video}') or jsonb_typeof(c#>'{training,chapters}') is distinct from 'array' or jsonb_array_length(c#>'{training,chapters}')>20 then raise exception 'Invalid training'; end if;
 ids:='{}';
 for item in select value from jsonb_array_elements(c#>'{training,chapters}') loop
  if not call_funnel_text(item->'id',48,true) then raise exception 'Invalid training chapter identifier'; end if;
  if not call_funnel_shape(item,array['id','title','seconds']) or coalesce(item->>'id','') !~ '^[a-z][a-z0-9-]{0,47}$' or item->>'id'=any(ids) or not call_funnel_text(item->'title',300,true) or jsonb_typeof(item->'seconds') is distinct from 'number' or coalesce(item->>'seconds','') !~ '^[0-9]+$' then raise exception 'Invalid training chapter'; end if;
  if (item->>'seconds')::numeric not between 0 and 86400 then raise exception 'Invalid training time'; end if;
  ids:=array_append(ids,item->>'id');
 end loop;
 if not call_funnel_shape(c->'alternative',array['headline','intro','video','story','benefits','faq','cta','url','price','billing','proofIds']) then raise exception 'Invalid alternative offer'; end if;
 foreach field in array array['headline','intro','story','cta','price','billing'] loop if not call_funnel_text(c->'alternative'->field,case when field='story' then 6000 else 2000 end,publishing and field in ('headline','cta')) then raise exception 'Invalid alternative copy'; end if; end loop;
 if not call_funnel_media(c#>'{alternative,video}') or not call_funnel_url(c#>'{alternative,url}',true) or (publishing and c#>>'{alternative,url}'='') or jsonb_typeof(c#>'{alternative,benefits}') is distinct from 'array' or jsonb_array_length(c#>'{alternative,benefits}')>8 or jsonb_typeof(c#>'{alternative,faq}') is distinct from 'array' or jsonb_array_length(c#>'{alternative,faq}')>12 then raise exception 'Invalid alternative details'; end if;
 for item in select value from jsonb_array_elements(c#>'{alternative,benefits}') loop if not call_funnel_shape(item,array['title','body']) or not call_funnel_text(item->'title',300,true) or not call_funnel_text(item->'body',2000) then raise exception 'Invalid alternative benefit'; end if; end loop;
 for item in select value from jsonb_array_elements(c#>'{alternative,faq}') loop if not call_funnel_shape(item,array['question','answer']) or not call_funnel_text(item->'question',300,true) or not call_funnel_text(item->'answer',3000,true) then raise exception 'Invalid alternative FAQ'; end if; end loop;
 for item in select c->'proofIds' union all select c#>'{alternative,proofIds}' loop
  if jsonb_typeof(item) is distinct from 'array' or jsonb_array_length(item)>12 then raise exception 'Invalid proof selection'; end if;
  ids:='{}';
  for proof_id in select value#>>'{}' from jsonb_array_elements(item) loop
   if coalesce(proof_id,'') !~* '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' or proof_id=any(ids) then raise exception 'Invalid proof identifier'; end if;
   ids:=array_append(ids,proof_id);
   if publishing and not exists(select 1 from offer_proof_items where id=proof_id::uuid and approved) then raise exception 'Proof must be approved before publication'; end if;
  end loop;
 end loop;
 if jsonb_typeof(c->'proofImages') is distinct from 'object' or (select count(*) from jsonb_object_keys(c->'proofImages'))>24 then raise exception 'Invalid proof images'; end if;
 for field,item in select * from jsonb_each(c->'proofImages') loop if field !~* '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' or not call_funnel_url(item,true) then raise exception 'Invalid proof image'; end if; end loop;
 if not call_funnel_keys(c->'scripts',array['buyer','problem','trigger','mechanism','deliverables','evidence','callOutcome','voice','riskTerms','invitation','welcome','training','wordsPerMinute']) then raise exception 'Invalid script workspace'; end if;
 for field,item in select * from jsonb_each(c->'scripts') loop
  if field='wordsPerMinute' then
   if jsonb_typeof(item) is distinct from 'number' or (item#>>'{}') !~ '^[0-9]+$' then raise exception 'Invalid speaking pace'; end if;
   if (item#>>'{}')::numeric not between 80 and 220 then raise exception 'Invalid speaking pace'; end if;
  elsif not call_funnel_text(item,case when field in ('invitation','welcome','training') then 12000 else 1200 end) then raise exception 'Invalid script text'; end if;
 end loop;
end $$;
create function public.call_funnel_save(_id uuid,_slug text,_title text,_config jsonb,_expected_version integer,_publish boolean,_active boolean,_request_id uuid) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare f call_funnels; previous call_funnel_requests; payload jsonb; result jsonb; next_version integer;
begin
 if not coalesce(public.is_admin(auth.uid()),false) then raise exception 'Admins only'; end if;
 if _id is null or _request_id is null or _expected_version is null or _expected_version<0 or _publish is null or _active is null then raise exception 'Missing request fields'; end if;
 payload:=jsonb_build_object('id',_id,'slug',_slug,'title',_title,'config',_config,'expectedVersion',_expected_version,'publish',_publish,'active',_active);
 perform pg_advisory_xact_lock(hashtextextended(_request_id::text,20));
 select * into previous from call_funnel_requests where request_id=_request_id;
 if found then if previous.input<>payload or previous.actor_id<>auth.uid() then raise exception 'Request replay mismatch'; end if; return previous.result; end if;
 perform pg_advisory_xact_lock(hashtextextended(_id::text,21));
 select * into f from call_funnels where id=_id for update;
 if coalesce(f.version,0)<>_expected_version then raise exception 'Call funnel revision conflict'; end if;
 if f.id is not null and f.slug<>_slug then raise exception 'Saved call funnel addresses are stable'; end if;
 if coalesce(_slug,'') !~ '^[a-z][a-z0-9-]{0,79}$' or length(btrim(coalesce(_title,''))) not between 1 and 160 then raise exception 'Invalid call funnel details'; end if;
 perform call_funnel_config_validate(_config,_publish);
 next_version:=coalesce(f.version,0)+1;
 insert into call_funnels(id,slug,title,draft_config,version,published_version,active) values(_id,_slug,_title,_config,next_version,case when _publish then next_version end,_publish and _active)
 on conflict(id) do update set title=excluded.title,draft_config=excluded.draft_config,version=excluded.version,published_version=case when _publish then next_version else f.published_version end,active=case when _publish then _active when not _active then false else f.active end,updated_at=now();
 insert into call_funnel_revisions(funnel_id,version,slug,title,config,published) values(_id,next_version,_slug,_title,_config,_publish);
 select to_jsonb(row_value) into result from call_funnels row_value where id=_id;
 insert into call_funnel_requests(request_id,actor_id,input,result) values(_request_id,auth.uid(),payload,result);
 return result;
end $$;
create function public.call_funnel_publication(_funnel_id uuid,_revision integer) returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
 select jsonb_build_object('id',r.funnel_id,'slug',r.slug,'title',r.title,'revision',r.version,'config',
 jsonb_set(jsonb_set(jsonb_set(r.config-'scripts'-'qualificationRules', '{proofIds}',coalesce((
  select jsonb_agg(selected.value order by selected.ordinality) from jsonb_array_elements(r.config->'proofIds') with ordinality selected
  where exists(select 1 from offer_proof_items p where p.id=(selected.value#>>'{}')::uuid and p.approved)
 ),'[]'::jsonb)), '{alternative,proofIds}',coalesce((
  select jsonb_agg(selected.value order by selected.ordinality) from jsonb_array_elements(r.config#>'{alternative,proofIds}') with ordinality selected
  where exists(select 1 from offer_proof_items p where p.id=(selected.value#>>'{}')::uuid and p.approved)
 ),'[]'::jsonb)), '{proofImages}',coalesce((
  select jsonb_object_agg(image.key,image.value) from jsonb_each(r.config->'proofImages') image
  where (r.config->'proofIds' ? image.key or r.config#>'{alternative,proofIds}' ? image.key)
   and exists(select 1 from offer_proof_items p where p.id=image.key::uuid and p.approved)
 ),'{}'::jsonb)), 'proof',coalesce((
 select jsonb_agg(jsonb_build_object('id',p.id,'title',p.title,'content',p.content,'attribution',p.attribution,'source_url',p.source_url) order by p.id)
 from offer_proof_items p where p.approved and (r.config->'proofIds' ? p.id::text or r.config#>'{alternative,proofIds}' ? p.id::text)
 ),'[]'::jsonb))
 from call_funnel_revisions r join call_funnels f on f.id=r.funnel_id
 where r.funnel_id=_funnel_id and r.version=_revision and r.published and f.active
$$;
create function public.call_funnel_public_get(_slug text) returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
 select public.call_funnel_publication(f.id,f.published_version) from call_funnels f where f.slug=_slug and f.active
$$;
create function public.call_funnel_outcomes(_application_id uuid) returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare booking call_funnel_events; attendance call_funnel_events; sale call_funnel_events;
begin
 select * into booking from call_funnel_events where application_id=_application_id and type in ('booked','cancelled','rescheduled') order by occurred_at desc,case when type='cancelled' then 1 else 0 end desc,created_at desc,id desc limit 1;
 select * into attendance from call_funnel_events where application_id=_application_id and type in ('attended','no_show') and booking.type in ('booked','rescheduled') and occurred_at>=booking.occurred_at order by occurred_at desc,created_at desc,id desc limit 1;
 select * into sale from call_funnel_events where application_id=_application_id and type='sale' order by occurred_at desc,created_at desc,id desc limit 1;
 return jsonb_build_object(
  'booking',jsonb_build_object('status',case when booking.id is null then 'unconfirmed' when booking.type='cancelled' then 'cancelled' else 'booked' end,'startsAt',booking.starts_at,'source',booking.source,'timezone','UTC','meetingUrl',null,'manageUrl',null),
  'attendance',jsonb_build_object('status',coalesce(attendance.type,'unrecorded'),'source',attendance.source),
  'sale',jsonb_build_object('status',case when sale.id is null then 'unrecorded' else 'recorded' end,'source',sale.source)
 );
end $$;
create function public.call_funnel_application_view(_token_hash text) returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare a call_funnel_applications; publication jsonb;
begin
 select * into a from call_funnel_applications where token_hash=_token_hash;
 if not found then raise exception 'Application session unavailable'; end if;
 if a.expires_at<=now() or a.retain_until<=now() then raise exception 'Application session expired'; end if;
 publication:=call_funnel_publication(a.funnel_id,a.revision);
 if publication is null then raise exception 'Call funnel unavailable'; end if;
 return (publication-'id') || jsonb_build_object('id',a.id,'funnelId',a.funnel_id,'outcome',a.outcome,'submittedAt',a.submitted_at) || call_funnel_outcomes(a.id);
end $$;
create function public.call_funnel_submit(_slug text,_revision integer,_token_hash text,_request_id uuid,_answers jsonb,_contact jsonb,_consent boolean) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare f call_funnels; r call_funnel_revisions; a call_funnel_applications; q jsonb; visible text[]:='{}'; answer jsonb; outcome text:='qualified'; rule jsonb;
begin
 if coalesce(_token_hash,'') !~ '^[a-f0-9]{64}$' or _request_id is null or _revision is null or _revision<1 or _consent is distinct from true then raise exception 'Invalid application request'; end if;
 -- A token and request ID are both bound to the immutable exact submitted payload.
 perform pg_advisory_xact_lock(hashtextextended(_token_hash,22));
 perform pg_advisory_xact_lock(hashtextextended(_request_id::text,23));
 select * into f from call_funnels where slug=_slug and active for share;
 if not found then raise exception 'Call funnel unavailable'; end if;
 select * into a from call_funnel_applications where token_hash=_token_hash or request_id=_request_id;
 if found then
  if a.token_hash<>_token_hash or a.request_id<>_request_id or a.funnel_id<>f.id or a.revision<>_revision or a.answers is distinct from _answers or a.contact is distinct from _contact or a.consent is distinct from _consent then raise exception 'Application replay mismatch'; end if;
  return call_funnel_application_view(_token_hash);
 end if;
 select * into r from call_funnel_revisions where funnel_id=f.id and version=_revision and published;
 if not found then raise exception 'Published revision unavailable'; end if;
 if not call_funnel_shape(_contact,array['name','email']) or not call_funnel_text(_contact->'name',160,true) or not call_funnel_text(_contact->'email',254,true) or coalesce(_contact->>'email','') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or jsonb_typeof(_answers) is distinct from 'object' or (select count(*) from jsonb_object_keys(_answers))>15 then raise exception 'Invalid application details'; end if;
 for q in select value from jsonb_array_elements(r.config->'questions') loop
  if q ? 'showWhen' and (not coalesce(q#>>'{showWhen,questionId}','')=any(visible) or (_answers->>(q#>>'{showWhen,questionId}')) is distinct from q#>>'{showWhen,optionId}') then continue; end if;
  visible:=array_append(visible,q->>'id'); answer:=_answers->(q->>'id');
  if answer is null or answer='""'::jsonb then if (q->>'required')::boolean then raise exception 'Required application answer missing'; end if;
  elsif not call_funnel_text(answer,2000,(q->>'required')::boolean) then raise exception 'Invalid application answer';
  elsif q->>'type'='single' and not exists(select 1 from jsonb_array_elements(q->'options') where value->>'id'=answer#>>'{}') then raise exception 'Invalid application choice'; end if;
 end loop;
 if exists(select 1 from jsonb_object_keys(_answers) k where not k=any(visible)) then raise exception 'Unexpected hidden application answer'; end if;
 for rule in select value from jsonb_array_elements(r.config->'qualificationRules') loop
  if _answers ? (rule->>'questionId') and _answers->>(rule->>'questionId')=rule->>'optionId' then outcome:='alternative'; exit; end if;
 end loop;
 insert into call_funnel_applications(funnel_id,revision,token_hash,request_id,contact,answers,consent,outcome) values(f.id,r.version,_token_hash,_request_id,_contact,_answers,true,outcome);
 return call_funnel_application_view(_token_hash);
end $$;
create function public.call_funnel_record_event(_application_id uuid,_event_key text,_type text,_occurred_at timestamptz,_starts_at timestamptz,_reference text,_note text,_source text,_actor_id uuid) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare a call_funnel_applications; previous call_funnel_events; booking call_funnel_events; result call_funnel_events;
begin
 if _application_id is null or coalesce(_event_key,'') !~ '^[a-zA-Z0-9:_-]{1,160}$' or coalesce(_type,'') not in ('booked','cancelled','rescheduled','attended','no_show','sale') or _occurred_at is null or not isfinite(_occurred_at) or _occurred_at>now()+interval '5 minutes' or (_starts_at is not null and not isfinite(_starts_at)) or (_type in ('booked','rescheduled') and _starts_at is null) or length(btrim(coalesce(_reference,''))) not between 1 and 300 or length(coalesce(_note,''))>2000 or coalesce(_source,'') not in ('admin','signed_webhook') or (_source='admin' and _actor_id is null) or (_source='signed_webhook' and _actor_id is not null) then raise exception 'Invalid call outcome event'; end if;
 perform pg_advisory_xact_lock(hashtextextended(_source||':'||_event_key,24));
 select * into previous from call_funnel_events where source=_source and event_key=_event_key;
 if found then
  if previous.application_id<>_application_id or previous.type<>_type or previous.occurred_at<>_occurred_at or previous.starts_at is distinct from _starts_at or previous.reference<>_reference or previous.note is distinct from coalesce(_note,'') or previous.actor_id is distinct from _actor_id then raise exception 'Event replay mismatch'; end if;
  return to_jsonb(previous);
 end if;
 select * into a from call_funnel_applications where id=_application_id and retain_until>now() for update;
 if not found then raise exception 'Application unavailable'; end if;
 if _occurred_at<a.submitted_at-interval '5 minutes' then raise exception 'Event predates application'; end if;
 if _type in ('booked','cancelled','rescheduled','attended','no_show') and a.outcome<>'qualified' then raise exception 'Application not qualified for booking'; end if;
 if _type in ('attended','no_show') then
  select * into booking from call_funnel_events where application_id=a.id and type in ('booked','cancelled','rescheduled') and occurred_at<=_occurred_at order by occurred_at desc,case when type='cancelled' then 1 else 0 end desc,created_at desc,id desc limit 1;
  if booking.id is null or booking.type='cancelled' then raise exception 'Record an active booking before attendance'; end if;
 end if;
 insert into call_funnel_events(application_id,source,event_key,type,occurred_at,starts_at,reference,note,actor_id) values(_application_id,_source,_event_key,_type,_occurred_at,_starts_at,_reference,coalesce(_note,''),_actor_id) returning * into result;
 return to_jsonb(result);
end $$;
create function public.call_funnel_admin_event(_application_id uuid,_request_id uuid,_type text,_occurred_at timestamptz,_starts_at timestamptz default null,_reference text default '',_note text default '') returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if not coalesce(public.is_admin(auth.uid()),false) then raise exception 'Admins only'; end if;
 if _request_id is null then raise exception 'Missing event request'; end if;
 return call_funnel_record_event(_application_id,_request_id::text,_type,_occurred_at,_starts_at,_reference,_note,'admin',auth.uid());
end $$;
create function public.call_funnel_admin_report(_funnel_id uuid,_limit integer default 100,_offset integer default 0) returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare result jsonb; total bigint;
begin
 if not coalesce(public.is_admin(auth.uid()),false) then raise exception 'Admins only'; end if;
 if _funnel_id is null or _limit is null or _limit not between 1 and 100 or _offset is null or _offset not between 0 and 100000 then raise exception 'Invalid report range'; end if;
 select count(*) into total from call_funnel_applications where funnel_id=_funnel_id and retain_until>now();
 select jsonb_build_object('applications',coalesce(jsonb_agg(row_value order by row_value->>'submittedAt' desc),'[]'::jsonb),'total',total,'offset',_offset,'limit',_limit,'hasMore',total>_offset+_limit) into result from (
  select jsonb_build_object('id',a.id,'revision',a.revision,'contact',a.contact,'answers',a.answers,'questions',(select config->'questions' from call_funnel_revisions where funnel_id=a.funnel_id and version=a.revision),'outcome',a.outcome,'submittedAt',a.submitted_at,'events',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'type',e.type,'source',e.source,'occurredAt',e.occurred_at,'startsAt',e.starts_at,'reference',e.reference,'note',e.note,'actorId',e.actor_id) order by e.occurred_at desc,e.created_at desc) from (select * from call_funnel_events where application_id=a.id order by occurred_at desc,created_at desc limit 20) e),'[]'::jsonb),'eventCount',(select count(*) from call_funnel_events where application_id=a.id)) || call_funnel_outcomes(a.id) as row_value
  from call_funnel_applications a where a.funnel_id=_funnel_id and a.retain_until>now() order by a.submitted_at desc,a.id limit _limit offset _offset
 ) rows;
 return result || jsonb_build_object('counts',(
  with retained as materialized (
   select id,outcome from call_funnel_applications where funnel_id=_funnel_id and retain_until>now()
  ), latest_booking as (
   select distinct on (e.application_id) e.application_id,e.type,e.occurred_at
   from call_funnel_events e join retained a on a.id=e.application_id
   where e.type in ('booked','cancelled','rescheduled')
   order by e.application_id,e.occurred_at desc,case when e.type='cancelled' then 1 else 0 end desc,e.created_at desc,e.id desc
  ), latest_attendance as (
   select distinct on (e.application_id) e.application_id,e.type
   from call_funnel_events e join latest_booking b on b.application_id=e.application_id
   where b.type in ('booked','rescheduled') and e.type in ('attended','no_show') and e.occurred_at>=b.occurred_at
   order by e.application_id,e.occurred_at desc,e.created_at desc,e.id desc
  ), latest_sale as (
   select distinct on (e.application_id) e.application_id,e.source
   from call_funnel_events e join retained a on a.id=e.application_id where e.type='sale'
   order by e.application_id,e.occurred_at desc,e.created_at desc,e.id desc
  )
  select jsonb_build_object('applications',count(*),'qualified',count(*) filter(where a.outcome='qualified'),'alternative',count(*) filter(where a.outcome='alternative'),
  'booked',count(*) filter(where b.type in ('booked','rescheduled')),'cancelled',count(*) filter(where b.type='cancelled'),
  'attended',count(*) filter(where attendance.type='attended'),'no_show',count(*) filter(where attendance.type='no_show'),
  'manual_sales',count(*) filter(where sale.source='admin'),'webhook_sales',count(*) filter(where sale.source='signed_webhook'))
  from retained a left join latest_booking b on b.application_id=a.id left join latest_attendance attendance on attendance.application_id=a.id left join latest_sale sale on sale.application_id=a.id
 ),'retentionDays',90,'generatedAt',now());
end $$;
create function public.call_funnel_cleanup() returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
 delete from call_funnel_applications where retain_until<=now();
 delete from call_funnel_requests where created_at<now()-interval '90 days';
end $$;
revoke execute on function public.call_funnel_keys(jsonb,text[]),public.call_funnel_text(jsonb,integer,boolean),public.call_funnel_shape(jsonb,text[]),public.call_funnel_url(jsonb,boolean),public.call_funnel_media(jsonb),public.call_funnel_config_validate(jsonb,boolean),public.call_funnel_save(uuid,text,text,jsonb,integer,boolean,boolean,uuid),public.call_funnel_publication(uuid,integer),public.call_funnel_public_get(text),public.call_funnel_outcomes(uuid),public.call_funnel_application_view(text),public.call_funnel_submit(text,integer,text,uuid,jsonb,jsonb,boolean),public.call_funnel_record_event(uuid,text,text,timestamptz,timestamptz,text,text,text,uuid),public.call_funnel_admin_event(uuid,uuid,text,timestamptz,timestamptz,text,text),public.call_funnel_admin_report(uuid,integer,integer),public.call_funnel_cleanup() from public,anon,authenticated;
grant execute on function public.call_funnel_save(uuid,text,text,jsonb,integer,boolean,boolean,uuid),public.call_funnel_admin_event(uuid,uuid,text,timestamptz,timestamptz,text,text),public.call_funnel_admin_report(uuid,integer,integer) to authenticated;
grant execute on function public.call_funnel_public_get(text),public.call_funnel_application_view(text),public.call_funnel_submit(text,integer,text,uuid,jsonb,jsonb,boolean),public.call_funnel_record_event(uuid,text,text,timestamptz,timestamptz,text,text,text,uuid),public.call_funnel_cleanup() to service_role;
-- Functional application records expire after 90 days; browser capability access lasts seven.
select cron.schedule('call-funnel-retention-daily','47 4 * * *','SELECT public.call_funnel_cleanup()');
