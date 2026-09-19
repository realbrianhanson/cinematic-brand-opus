-- Run once in the SQL editor of an EMPTY Cloud REMIX, before adding site settings.
-- This is not a complete schema migration. It uses the schema copied by Cloud.
-- It deliberately contains no owner identity, subscribers, private notes or secrets.
begin;
create table if not exists public.member_bootstrap_state (
  key text primary key,
  applied_at timestamptz not null default now()
);
alter table public.member_bootstrap_state enable row level security;
revoke all on public.member_bootstrap_state from public,anon,authenticated;

do $$
declare table_name text; populated boolean; active_jobs integer;
begin
  perform pg_advisory_xact_lock(hashtext('member-empty-bootstrap'));
  -- Commerce data can contain customer information and purchased files. Check it
  -- even when an inherited neutral-v1 marker would otherwise make this a no-op.
  foreach table_name in array array['offers','offer_orders','offer_stripe_events'] loop
    if to_regclass('public.'||table_name) is not null then
      execute format('select exists(select 1 from public.%I)',table_name) into populated;
      if populated then raise exception 'Refusing bootstrap: % already contains records. Use an empty remix.',table_name; end if;
    end if;
  end loop;
  if to_regclass('storage.objects') is not null then
    execute 'select exists(select 1 from storage.objects where bucket_id=''offer-files'')' into populated;
    if populated then raise exception 'Refusing bootstrap: offer-files already contains files. Use an empty remix.'; end if;
  end if;
  if exists(select 1 from public.member_bootstrap_state where key='neutral-v1') then return; end if;
  foreach table_name in array array['site_settings','site_settings_private','posts','generated_pages','pillar_pages','newsletter_subscribers','newsletter_sends','niches','content_schemas','source_items','content_sources','expert_notes','widget_config'] loop
    if to_regclass('public.'||table_name) is not null then
      execute format('select exists(select 1 from public.%I)',table_name) into populated;
      if populated then raise exception 'Refusing bootstrap: % already contains records. Use an empty remix.',table_name; end if;
    end if;
  end loop;
  if to_regclass('cron.job') is not null then
    execute 'select count(*) from cron.job where active' into active_jobs;
    if active_jobs>0 then raise exception 'Refusing bootstrap: active jobs exist. Verify this is an isolated empty remix.'; end if;
  end if;
  insert into public.site_settings(site_name,site_url,author_name,author_title,author_bio,publisher_name,publisher_url,cta_url,cta_headline,cta_subtext,cta_button_text,cta_social_proof,image_generation_enabled,newsletter_from_address,newsletter_reply_to,newsletter_postal_address)
    values('Your Website','https://example.com','Your Name','','','Your Website','https://example.com','','','','','',false,null,null,null);
  insert into public.site_settings_private(report_enabled,auto_publish_enabled,auto_publish_daily_cap,auto_publish_min_quality,voice_profile,banned_phrases,default_expert_pov)
    values(false,false,3,85,null,'{}',null);
  insert into public.content_schemas(slug,name,description,schema_definition,title_template,description_template,renderer_component,items_per_section,is_active)
    values('guides','Guides','Practical guides for your audience.',
      '{"type":"object","properties":{"introduction":{"type":"string"},"sections":{"type":"array","items":{"type":"object","properties":{"title":{"type":"string"},"content":{"type":"string"}},"required":["title","content"]}}},"required":["introduction","sections"]}',
      'A practical guide to {niche}','Practical guidance for {niche}.','GuideRenderer',5,true);
  -- No widgets are required for the site to render. Add only widgets you configure
  -- in Admin; in particular newsletter/CTA widgets remain absent until configured.
  insert into public.member_bootstrap_state(key) values('neutral-v1');
end $$;
commit;


-- Database-backed public identity; no inherited owner homepage while setting up.
DO $$ BEGIN
 IF to_regclass('public.site_branding') IS NOT NULL AND EXISTS(SELECT 1 FROM public.site_settings WHERE site_url='https://example.com') THEN
  INSERT INTO public.site_branding(id,settings) VALUES(true,'{"mode":"member","name":"Your Name","initials":"YN","role":"Your Role","siteUrl":"https://example.com","email":"","niche":"Your Topic","headline":"Your useful headline","description":"Describe who you help and how your work helps them.","accent":"#D4AF55","logo":"","favicon":"","socialImage":"","offerLabel":"","offerUrl":"","authorBio":""}'::jsonb)
  ON CONFLICT(id) DO NOTHING;
 END IF;
END $$;
