-- Owner-only private draft. No existing offer, page, provider, price or publication is changed.
-- Idempotent: a journey at this stable address is preserved, including subsequent edits.
begin;
set local lock_timeout='10s';
set local statement_timeout='30s';
do $$
declare journey_id uuid := 'e35dbe7c-70e1-4e44-b866-a65399e8e6f6'; kit uuid; workshop uuid; pushten uuid; graph jsonb;
begin
 if (select count(*) from public.site_settings)<>1 or not exists(select 1 from public.site_settings where site_url='https://brianhanson.com' and author_name='Brian Hanson') then raise exception 'This draft belongs only to the Brian Hanson owner site'; end if;
 perform pg_advisory_xact_lock(hashtextextended(journey_id::text,1));
 if exists(select 1 from public.funnel_journeys where slug='first-ai-build-next-step' or id=journey_id) then return; end if;
 select id into kit from public.offers where slug='ai-follow-up-starter-kit' and status='published' and kind='free' and not funnel_only;
 select id into workshop from public.offers where slug='app-building-workshop' and status='published' and not funnel_only;
 select id into pushten from public.offers where slug='pushten' and status='published' and not funnel_only;
 if kit is null or workshop is null or pushten is null then raise exception 'The three existing published owner offers must be available before this draft can be seeded'; end if;
 graph := jsonb_build_object('version',1,'entryStepId','project','steps',jsonb_build_array(
  jsonb_build_object('id','project','kind','choice','title','What would you like to build first?','body','Your free project plan is already yours. Use these questions only if you want help choosing what to do next. No name or email is needed for the questions.','options',jsonb_build_array(jsonb_build_object('id','follow-up','label','A client follow-up helper'),jsonb_build_object('id','inquiries','label','An inquiry organizer'),jsonb_build_object('id','onboarding','label','An onboarding checklist')),'branches',jsonb_build_object('follow-up','follow-up-help','inquiries','build-help','onboarding','build-help'),'defaultStepId','independent'),
  jsonb_build_object('id','follow-up-help','kind','choice','title','What kind of help would be useful?','body','Choose the amount of support you want for this first version. You can keep working independently.','options',jsonb_build_array(jsonb_build_object('id','practice','label','A free follow-up practice kit'),jsonb_build_object('id','guided','label','Guided app-building training'),jsonb_build_object('id','templates','label','Templates, walkthroughs and ongoing training'),jsonb_build_object('id','independent','label','I want to try my plan myself')),'branches',jsonb_build_object('practice','starter-kit','guided','workshop','templates','pushten'),'defaultStepId','independent'),
  jsonb_build_object('id','build-help','kind','choice','title','How would you like to make your first version?','body','Choose the support that fits how you want to learn. Review the current offer details before deciding.','options',jsonb_build_array(jsonb_build_object('id','guided','label','Guided app-building training'),jsonb_build_object('id','templates','label','Templates, walkthroughs and ongoing training'),jsonb_build_object('id','independent','label','I want to try my plan myself')),'branches',jsonb_build_object('guided','workshop','templates','pushten'),'defaultStepId','independent'),
  jsonb_build_object('id','starter-kit','kind','offer','title','Practice with the AI Follow-Up Starter Kit','body','This free seven-page PDF includes five reusable prompts, an input sheet, a fictional landscaping example and a pre-send checklist. The existing resource page explains email delivery and the separate newsletter option.','offerId',kit,'nextStepId','finish'),
  jsonb_build_object('id','workshop','kind','offer','title','Explore the App Building Workshop','body','Review the workshop description and current checkout details to decide whether guided app-building training fits your next step. The provider handles enrollment and payment.','offerId',workshop,'nextStepId','finish'),
  jsonb_build_object('id','pushten','kind','offer','title','Explore PushTen','body','PushTen includes templates, video walkthroughs, training and community. Review the existing offer page for current membership details and commercial-use terms, then decide whether that support fits your project.','offerId',pushten,'nextStepId','finish'),
  jsonb_build_object('id','independent','kind','end','title','Try your first version independently','body','Return to your free plan, use fictional information and run the three tests. Keep the first version small and review its output before connecting any production service. Your plan does not require a purchase or signup.'),
  jsonb_build_object('id','finish','kind','end','title','Keep your next step small','body','Your next step is a choice, not a commitment. Review the resource or training details when you are ready, or continue independently with the plan you already have. Reaching this page does not confirm resource access, enrollment or payment.')
 ));
 perform public.funnel_graph_validate(graph,true);
 insert into public.funnel_journeys(id,slug,title,draft_graph,version,active) values(journey_id,'first-ai-build-next-step','Your first AI build: choose your next step',graph,1,false);
 insert into public.funnel_journey_revisions(journey_id,version,slug,title,graph,published) values(journey_id,1,'first-ai-build-next-step','Your first AI build: choose your next step',graph,false);
end $$;
commit;
