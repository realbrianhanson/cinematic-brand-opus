-- A paired save/reorder must commit completely, or leave the previous values intact.
-- Search Console property is admin-only; blank retains the site URL-prefix default.
alter table public.site_settings_private add column if not exists gsc_property text;
alter table public.site_settings_private add constraint site_settings_private_gsc_property_format
  check (gsc_property is null or gsc_property = '' or
    gsc_property ~ '^sc-domain:[a-zA-Z0-9]([a-zA-Z0-9.-]*[a-zA-Z0-9])?\.[a-zA-Z]{2,}$' or
    gsc_property ~ '^https://[^/@[:space:]?#]+(/[^[:space:]?#]*)?$') not valid;

create or replace function public.admin_swap_widget_order(
  _first_id uuid, _second_id uuid, _first_order integer, _second_order integer, _direction text
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare first_row public.widget_config; second_row public.widget_config; first_rank integer; second_rank integer;
begin
  if public.is_admin(auth.uid()) is not true then raise exception 'Administrator required' using errcode='42501'; end if;
  if _direction not in ('up','down') or _direction is null or _first_id = _second_id then raise exception 'Invalid reorder'; end if;
  perform pg_advisory_xact_lock(hashtext('admin-widget-reorder'));
  perform id from public.widget_config order by id for update;
  select * into first_row from public.widget_config where id = _first_id;
  select * into second_row from public.widget_config where id = _second_id;
  if first_row.id is null or second_row.id is null or first_row.widget_zone is distinct from second_row.widget_zone then
    raise exception 'The widgets changed. Reload before reordering.';
  end if;
  if first_row.sort_order is distinct from _first_order or second_row.sort_order is distinct from _second_order then
    raise exception 'The widget order changed. Reload before reordering.' using errcode='40001';
  end if;
  with ordered as (select id,row_number() over(order by sort_order,id)::integer as n from public.widget_config where widget_zone=first_row.widget_zone)
    select max(n) filter(where id=_first_id), max(n) filter(where id=_second_id) into first_rank,second_rank from ordered;
  if second_rank is distinct from (first_rank + case when _direction='up' then -1 else 1 end) then
    raise exception 'The neighboring widget changed. Reload before reordering.' using errcode='40001';
  end if;
  -- Normalize ties and swap both neighbors in the same statement/transaction.
  with ordered as (select id,row_number() over(order by sort_order,id)::integer as n from public.widget_config where widget_zone=first_row.widget_zone),
  desired as (select id,case when id=_first_id then second_rank when id=_second_id then first_rank else n end as n from ordered)
  update public.widget_config w set sort_order=d.n from desired d where w.id=d.id and w.sort_order is distinct from d.n;
  return jsonb_build_object('saved',true);
end $$;
revoke all on function public.admin_swap_widget_order(uuid,uuid,integer,integer,text) from public,anon;
grant execute on function public.admin_swap_widget_order(uuid,uuid,integer,integer,text) to authenticated;

create or replace function public.admin_save_site_settings(
  _public_id uuid, _private_id uuid, _public_patch jsonb, _private_patch jsonb,
  _public_updated_at timestamptz, _private_updated_at timestamptz
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare pub public.site_settings; priv public.site_settings_private;
begin
  if public.is_admin(auth.uid()) is not true then raise exception 'Administrator required' using errcode='42501'; end if;
  if jsonb_typeof(_public_patch) is distinct from 'object' or jsonb_typeof(_private_patch) is distinct from 'object' then raise exception 'Invalid settings'; end if;
  if exists(select 1 from jsonb_object_keys(_public_patch) k where k <> all(array['site_name','site_url','publisher_name','publisher_url','author_name','author_title','author_bio','author_credentials','author_social_links','cta_url','cta_headline','cta_subtext','cta_button_text','cta_social_proof','image_generation_enabled','newsletter_from_address','newsletter_reply_to','newsletter_postal_address'])) or
     exists(select 1 from jsonb_object_keys(_private_patch) k where k <> all(array['report_email','report_enabled','voice_profile','banned_phrases','default_expert_pov','gsc_property'])) then raise exception 'Unsupported settings field'; end if;
  perform pg_advisory_xact_lock(hashtext('admin-paired-site-settings'));
  select * into pub from public.site_settings order by id limit 1 for update;
  select * into priv from public.site_settings_private order by id limit 1 for update;
  if pub.id is distinct from _public_id or priv.id is distinct from _private_id or
     pub.updated_at is distinct from _public_updated_at or priv.updated_at is distinct from _private_updated_at then
    raise exception 'Settings changed in another session. Reload the saved settings before applying your draft.' using errcode='40001';
  end if;
  if pub.id is null then insert into public.site_settings default values returning * into pub; end if;
  if priv.id is null then insert into public.site_settings_private default values returning * into priv; end if;
  pub := jsonb_populate_record(pub,_public_patch);
  priv := jsonb_populate_record(priv,_private_patch);
  update public.site_settings s set site_name=pub.site_name,site_url=pub.site_url,publisher_name=pub.publisher_name,publisher_url=pub.publisher_url,author_name=pub.author_name,author_title=pub.author_title,author_bio=pub.author_bio,author_credentials=pub.author_credentials,author_social_links=pub.author_social_links,cta_url=pub.cta_url,cta_headline=pub.cta_headline,cta_subtext=pub.cta_subtext,cta_button_text=pub.cta_button_text,cta_social_proof=pub.cta_social_proof,image_generation_enabled=pub.image_generation_enabled,newsletter_from_address=pub.newsletter_from_address,newsletter_reply_to=pub.newsletter_reply_to,newsletter_postal_address=pub.newsletter_postal_address,updated_at=clock_timestamp() where s.id=pub.id returning * into pub;
  update public.site_settings_private s set report_email=priv.report_email,report_enabled=priv.report_enabled,voice_profile=priv.voice_profile,banned_phrases=priv.banned_phrases,default_expert_pov=priv.default_expert_pov,gsc_property=priv.gsc_property,updated_at=clock_timestamp() where s.id=priv.id returning * into priv;
  return jsonb_build_object('public_id',pub.id,'private_id',priv.id,'public_updated_at',pub.updated_at,'private_updated_at',priv.updated_at);
end $$;
revoke all on function public.admin_save_site_settings(uuid,uuid,jsonb,jsonb,timestamptz,timestamptz) from public,anon;
grant execute on function public.admin_save_site_settings(uuid,uuid,jsonb,jsonb,timestamptz,timestamptz) to authenticated;
