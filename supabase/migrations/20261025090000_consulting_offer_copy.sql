-- Consulting and services positioning, shorter application, and copy fixes.
-- The 4x Inc. 5000 record stays; the company behind it is no longer named.

update public.site_settings set
  author_title = '4x Inc. 5000 founder and AI educator',
  author_bio = 'Brian Hanson founded AI For Business, a community of 200,000+ business owners learning to put AI to work. He''s a 4x Inc. 5000 founder who teaches non-technical owners to build with AI, no coding required';

update public.offers set
  title = 'PushTen: Proprietary Source Architecture for apps and websites',
  summary = 'Start your next app or website from working Proprietary Source Architecture. Make it yours, put it to work in your business or deliver it to a client, with training and a community to help'
where slug = 'pushten';

update public.offers set
  summary = 'See how to turn PushTen Proprietary Source Architecture into a branded app or website, and learn the basics of building and delivering projects for clients'
where slug = 'app-building-workshop';

DO $$
DECLARE
  f public.call_funnels;
  cfg jsonb;
  next_version integer;
BEGIN
  SELECT * INTO f FROM public.call_funnels WHERE slug = 'work-with-brian';
  IF f.id IS NULL THEN RETURN; END IF;
  cfg := f.draft_config;
  cfg := jsonb_set(cfg, '{invitation,headline}', to_jsonb('We help you put AI to work, from the plan to the finished build'::text));
  cfg := jsonb_set(cfg, '{invitation,description}', to_jsonb('AI consulting, staff AI training, automations, lead generation, ad management, funnels and more. Built and taught with the same tools I use in my own businesses. Tell us where you''re stuck and we''ll see if we''re a fit'::text));
  cfg := jsonb_set(cfg, '{invitation,promise}', to_jsonb('Bring the part of your business that''s stuck. Leave with a plan for what to do first'::text));
  cfg := jsonb_set(cfg, '{invitation,proofHeading}', to_jsonb('What people say about learning from Brian'::text));
  cfg := jsonb_set(cfg, '{booking,agenda}', to_jsonb('We''ll look at your business and goals, map what to do first and walk through what working together looks like'::text));
  cfg := jsonb_set(cfg, '{preparation,extras,objections,items}', (
    SELECT jsonb_agg(
      CASE WHEN item->>'question' = 'What does it cost?'
        THEN jsonb_set(item, '{answer}', to_jsonb('Done-for-you projects start at $5,000. We quote consulting, trainings and builds after the call, so you know the full investment before you decide'::text))
        ELSE item END)
    FROM jsonb_array_elements(cfg #> '{preparation,extras,objections,items}') item
  ) || jsonb_build_array(jsonb_build_object(
    'video', jsonb_build_object('url','','poster','','transcript',''),
    'answer', 'Yes. We run AI trainings for your staff, built around the work your team does every day',
    'enabled', true, 'captions', '', 'question', 'Can you train my team?')));
  -- Eight questions instead of fifteen. Kept ids match the qualification rules.
  cfg := jsonb_set(cfg, '{questions}', '[
    {"id":"help","help":"Pick your top priority. We''ll cover the rest on the call","type":"single","label":"Where do you want help first?","required":true,"options":[
      {"id":"strategy","label":"AI strategy and consulting"},
      {"id":"training","label":"AI training for my team"},
      {"id":"automation","label":"Automations to cut manual work"},
      {"id":"leads","label":"More leads (lead generation and ad management)"},
      {"id":"convert","label":"Funnels and websites that convert"},
      {"id":"follow-up","label":"Faster follow-up (email, SMS, chatbot, AI voice)"},
      {"id":"not-sure","label":"Not sure yet"}]},
    {"id":"offer","help":"A sentence or two is plenty. Add your website if you have one","type":"textarea","label":"What do you sell, and who buys it?","required":true,"options":[]},
    {"id":"win","help":"Be as specific as you can","type":"textarea","label":"What would a win look like 90 days from now?","required":true,"options":[]},
    {"id":"revenue","help":"","type":"single","label":"Average monthly revenue over the last 3 months","required":true,"options":[
      {"id":"pre-revenue","label":"Pre-revenue"},{"id":"under-5k","label":"Under $5k"},{"id":"usd-5-10k","label":"$5k–$10k"},{"id":"usd-10-25k","label":"$10k–$25k"},{"id":"usd-25-50k","label":"$25k–$50k"},{"id":"usd-50-100k","label":"$50k–$100k"},{"id":"usd-100k-plus","label":"$100k+"}]},
    {"id":"budget","help":"This is your budget, not our price","type":"single","label":"What budget have you set aside for this?","required":true,"options":[
      {"id":"under-5k","label":"Under $5k"},{"id":"usd-5-10k","label":"$5k–$10k"},{"id":"usd-10-25k","label":"$10k–$25k"},{"id":"usd-25-50k","label":"$25k–$50k"},{"id":"usd-50k-plus","label":"$50k+"},{"id":"not-sure","label":"Not sure yet"},{"id":"tight","label":"Funds are tight, but I''m resourceful"}]},
    {"id":"start","help":"","type":"single","label":"How soon do you want to start?","required":true,"options":[
      {"id":"asap","label":"As soon as possible"},{"id":"within-30-days","label":"Within 30 days"},{"id":"one-to-three-months","label":"In 1–3 months"},{"id":"researching","label":"Just researching for now"}]},
    {"id":"decision","help":"","type":"single","label":"Who makes the final decision?","required":true,"options":[
      {"id":"me","label":"Just me"},{"id":"partner-joining","label":"Me and a partner who will join the call"},{"id":"partner-absent","label":"Me and a partner who can''t join"},{"id":"someone-else","label":"Someone else decides"}]},
    {"id":"phone","help":"So we can reach you about your application and call","type":"text","label":"Best mobile number","required":true,"options":[]}
  ]'::jsonb);
  PERFORM public.call_funnel_config_validate(cfg, true);
  next_version := f.version + 1;
  UPDATE public.call_funnels
    SET draft_config = cfg, version = next_version, published_version = next_version, updated_at = now()
    WHERE id = f.id;
  INSERT INTO public.call_funnel_revisions(funnel_id, version, slug, title, config, published)
    VALUES (f.id, next_version, f.slug, f.title, cfg, true);
END $$;
