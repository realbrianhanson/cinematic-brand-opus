-- Column grants distinguish public identity from private editorial/email settings.
-- Administrators use checked RPCs for complete rows, including inactive niches.
create policy "Admins read all niches" on public.niches for select to authenticated using (public.is_admin(auth.uid()));

do $$ declare c record; begin
  revoke select on public.niches from public,anon,authenticated;
  for c in select column_name from information_schema.columns where table_schema='public' and table_name='niches' loop
    execute format('revoke select (%I) on public.niches from public,anon,authenticated',c.column_name);
  end loop;
end $$;
grant select(id,name,slug,is_active) on public.niches to anon,authenticated;

create or replace function public.admin_read_niches()
returns setof public.niches language plpgsql security definer set search_path=public as $$
begin
  if not coalesce(public.is_admin(auth.uid()),false) then raise exception 'Administrator access required' using errcode='42501'; end if;
  return query select * from public.niches order by name;
end $$;
create or replace function public.admin_read_site_settings()
returns setof public.site_settings language plpgsql security definer set search_path=public as $$
begin
  if not coalesce(public.is_admin(auth.uid()),false) then raise exception 'Administrator access required' using errcode='42501'; end if;
  return query select * from public.site_settings order by id limit 1;
end $$;
revoke all on function public.admin_read_niches(),public.admin_read_site_settings() from public,anon;
grant execute on function public.admin_read_niches(),public.admin_read_site_settings() to authenticated;

-- New installations must opt into paid generation/sending. Existing values stay intact.
alter table public.site_settings alter column newsletter_from_address drop default,
  alter column newsletter_reply_to drop default,
  alter column image_generation_enabled set default false;
alter table public.site_settings_private alter column auto_publish_enabled set default false;
