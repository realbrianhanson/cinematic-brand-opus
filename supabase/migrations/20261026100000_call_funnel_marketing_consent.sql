-- Optional opt-in to news, updates and offers on call funnel applications.
-- The required consent still covers contact about the application itself.
alter table public.call_funnel_applications
  add column if not exists marketing_consent boolean not null default false;

-- A second overload with the opt-in. The seven-argument version stays so
-- submissions keep working while the edge function deploys.
create or replace function public.call_funnel_submit(_slug text,_revision integer,_token_hash text,_request_id uuid,_answers jsonb,_contact jsonb,_consent boolean,_marketing boolean) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
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
  if a.token_hash<>_token_hash or a.request_id<>_request_id or a.funnel_id<>f.id or a.revision<>_revision or a.answers is distinct from _answers or a.contact is distinct from _contact or a.consent is distinct from _consent or a.marketing_consent is distinct from coalesce(_marketing,false) then raise exception 'Application replay mismatch'; end if;
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
 insert into call_funnel_applications(funnel_id,revision,token_hash,request_id,contact,answers,consent,marketing_consent,outcome) values(f.id,r.version,_token_hash,_request_id,_contact,_answers,true,coalesce(_marketing,false),outcome);
 return call_funnel_application_view(_token_hash);
end $$;
revoke execute on function public.call_funnel_submit(text,integer,text,uuid,jsonb,jsonb,boolean,boolean) from public, anon, authenticated;
grant execute on function public.call_funnel_submit(text,integer,text,uuid,jsonb,jsonb,boolean,boolean) to service_role;

-- Required consent names every channel; the host intro carries Brian's own build count.
DO $$
DECLARE f public.call_funnels; cfg jsonb; v integer;
BEGIN
  SELECT * INTO f FROM public.call_funnels WHERE slug = 'work-with-brian';
  IF f.id IS NULL THEN RETURN; END IF;
  cfg := jsonb_set(f.draft_config, '{application,consentText}', to_jsonb('I agree to be contacted about this application and my call by phone, text message and email, using the details I provided. Message and data rates may apply. Reply STOP to opt out of texts'::text));
  cfg := jsonb_set(cfg, '{brand,hostBio}', to_jsonb('4x Inc. 5000 founder. I''ve built over 300 apps myself with Lovable, Grok Bots, Claude Code and Codex, and my team puts the same tools to work in your business'::text));
  IF cfg = f.draft_config THEN RETURN; END IF;
  PERFORM public.call_funnel_config_validate(cfg, true);
  v := f.version + 1;
  UPDATE public.call_funnels SET draft_config = cfg, version = v, published_version = v, updated_at = now() WHERE id = f.id;
  INSERT INTO public.call_funnel_revisions(funnel_id, version, slug, title, config, published) VALUES (f.id, v, f.slug, f.title, cfg, true);
END $$;
