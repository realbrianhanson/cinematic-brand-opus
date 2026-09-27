-- Optional preparation modules and private source notes; older revision shapes remain valid.
-- Existing function privileges and immutable revision/booking contracts are preserved.
create or replace function public.call_funnel_config_validate(c jsonb, publishing boolean default false) returns void language plpgsql set search_path=public,pg_temp as $$
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
 if not call_funnel_shape((c->'preparation')-'extras',array['headline','intro','video','checklist']) or not call_funnel_text(c#>'{preparation,headline}',300,publishing) or not call_funnel_text(c#>'{preparation,intro}',2000) or not call_funnel_media(c#>'{preparation,video}') or jsonb_typeof(c#>'{preparation,checklist}') is distinct from 'array' or jsonb_array_length(c#>'{preparation,checklist}')>12 then raise exception 'Invalid preparation'; end if;
 for item in select value from jsonb_array_elements(c#>'{preparation,checklist}') loop if not call_funnel_text(item,500,true) then raise exception 'Invalid preparation checklist'; end if; end loop;
 if c->'preparation' ? 'extras' then
  branch:=c#>'{preparation,extras}';
  if not call_funnel_shape(branch,array['overview','objections','proofHeading','proofIds']) or not call_funnel_text(branch->'proofHeading',300) then raise exception 'Invalid preparation extras'; end if;
  q:=branch->'overview';
  if not call_funnel_shape(q,array['enabled','heading','description','button','url']) or jsonb_typeof(q->'enabled') is distinct from 'boolean' then raise exception 'Invalid preparation overview'; end if;
  if not call_funnel_text(q->'heading',300,publishing and (q->>'enabled')::boolean) or not call_funnel_text(q->'description',2000) or not call_funnel_text(q->'button',120,publishing and (q->>'enabled')::boolean) or not call_funnel_url(q->'url') or (publishing and (q->>'enabled')::boolean and q->>'url'='') then raise exception 'Invalid preparation overview details'; end if;
  q:=branch->'objections';
  if not call_funnel_shape(q,array['enabled','heading','intro','items']) or jsonb_typeof(q->'enabled') is distinct from 'boolean' then raise exception 'Invalid preparation questions'; end if;
  if not call_funnel_text(q->'heading',300,publishing and (q->>'enabled')::boolean) or not call_funnel_text(q->'intro',2000) or jsonb_typeof(q->'items') is distinct from 'array' or jsonb_array_length(q->'items')>8 then raise exception 'Invalid preparation question list'; end if;
  for item in select value from jsonb_array_elements(q->'items') loop
   if not call_funnel_shape(item,array['enabled','question','answer','video','captions']) or jsonb_typeof(item->'enabled') is distinct from 'boolean' then raise exception 'Invalid preparation answer'; end if;
   if not call_funnel_text(item->'question',300,publishing and (q->>'enabled')::boolean and (item->>'enabled')::boolean) or not call_funnel_text(item->'answer',3000,publishing and (q->>'enabled')::boolean and (item->>'enabled')::boolean) or not call_funnel_media(item->'video') or not call_funnel_url(item->'captions') then raise exception 'Invalid preparation answer details'; end if;
  end loop;
 end if;
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
 for item in select c->'proofIds' union all select c#>'{alternative,proofIds}' union all select coalesce(c#>'{preparation,extras,proofIds}','[]'::jsonb) loop
  if jsonb_typeof(item) is distinct from 'array' or jsonb_array_length(item)>12 then raise exception 'Invalid proof selection'; end if;
  ids:='{}';
  for proof_id in select value#>>'{}' from jsonb_array_elements(item) loop
   if coalesce(proof_id,'') !~* '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' or proof_id=any(ids) then raise exception 'Invalid proof identifier'; end if;
   ids:=array_append(ids,proof_id);
   if publishing and not exists(select 1 from offer_proof_items where id=proof_id::uuid and approved) then raise exception 'Proof must be approved before publication'; end if;
  end loop;
 end loop;
 if jsonb_typeof(c->'proofImages') is distinct from 'object' or (select count(*) from jsonb_object_keys(c->'proofImages'))>36 then raise exception 'Invalid proof images'; end if;
 for field,item in select * from jsonb_each(c->'proofImages') loop if field !~* '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' or not call_funnel_url(item,true) then raise exception 'Invalid proof image'; end if; end loop;
 if not call_funnel_keys(c->'scripts',array['buyer','problem','trigger','mechanism','deliverables','evidence','callOutcome','voice','riskTerms','invitation','welcome','training','wordsPerMinute','inspirationSource','inspirationPattern','experimentNote']) then raise exception 'Invalid script workspace'; end if;
 for field,item in select * from jsonb_each(c->'scripts') loop
  if field='inspirationSource' then
   if not call_funnel_text(item,20) or item#>>'{}' not in ('','closers','wojo','justin','acquisition') then raise exception 'Invalid inspiration source'; end if;
  elsif field='wordsPerMinute' then
   if jsonb_typeof(item) is distinct from 'number' or (item#>>'{}') !~ '^[0-9]+$' then raise exception 'Invalid speaking pace'; end if;
   if (item#>>'{}')::numeric not between 80 and 220 then raise exception 'Invalid speaking pace'; end if;
  elsif not call_funnel_text(item,case when field in ('invitation','welcome','training') then 12000 else 1200 end) then raise exception 'Invalid script text'; end if;
 end loop;
end $$;

create or replace function public.call_funnel_publication(_funnel_id uuid,_revision integer) returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
 with revision as (
  select r.* from call_funnel_revisions r join call_funnels f on f.id=r.funnel_id
  where r.funnel_id=_funnel_id and r.version=_revision and r.published and f.active
 ), selected as (
  select r.*, coalesce((select jsonb_agg(p.id::text) from offer_proof_items p where p.approved and
    (r.config->'proofIds' ? p.id::text or r.config#>'{alternative,proofIds}' ? p.id::text or coalesce(r.config#>'{preparation,extras,proofIds}','[]'::jsonb) ? p.id::text)), '[]'::jsonb) as approved_ids
  from revision r
 ), filtered as (
  select r.*, jsonb_set(jsonb_set(jsonb_set(r.config-'scripts'-'qualificationRules', '{proofIds}',coalesce((
    select jsonb_agg(item.value order by item.ordinality) from jsonb_array_elements(r.config->'proofIds') with ordinality item where r.approved_ids ? (item.value#>>'{}')
   ),'[]'::jsonb)), '{alternative,proofIds}',coalesce((
    select jsonb_agg(item.value order by item.ordinality) from jsonb_array_elements(r.config#>'{alternative,proofIds}') with ordinality item where r.approved_ids ? (item.value#>>'{}')
   ),'[]'::jsonb)), '{proofImages}',coalesce((
    select jsonb_object_agg(image.key,image.value) from jsonb_each(r.config->'proofImages') image where r.approved_ids ? image.key
   ),'{}'::jsonb)) as safe_config
  from selected r
 )
 select jsonb_build_object('id',r.funnel_id,'slug',r.slug,'title',r.title,'revision',r.version,'config',
  case when r.config->'preparation' ? 'extras' then jsonb_set(r.safe_config,'{preparation,extras,proofIds}',coalesce((
   select jsonb_agg(item.value order by item.ordinality) from jsonb_array_elements(r.config#>'{preparation,extras,proofIds}') with ordinality item where r.approved_ids ? (item.value#>>'{}')
  ),'[]'::jsonb)) else r.safe_config end,
  'proof',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'title',p.title,'content',p.content,'attribution',p.attribution,'source_url',p.source_url) order by p.id)
   from offer_proof_items p where p.approved and r.approved_ids ? p.id::text),'[]'::jsonb))
 from filtered r
$$;
