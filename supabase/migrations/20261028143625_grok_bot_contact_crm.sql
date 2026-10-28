-- The Grok Bot application captures contact details before the questions.
-- Claim the first contact webhook once and retry a failed delivery for a day.
alter table public.call_funnel_partials
  add column if not exists crm_contact_sent_at timestamptz,
  add column if not exists crm_contact_claimed_at timestamptz;

create index if not exists call_funnel_partials_crm_pending_idx
  on public.call_funnel_partials(funnel_id, created_at)
  where crm_contact_sent_at is null;

create or replace function public.call_funnel_crm_contact_claim(_id uuid)
returns boolean
language sql
security definer
set search_path = public, pg_temp
as $$
  with claimed as (
    update public.call_funnel_partials p
    set crm_contact_claimed_at = now()
    where p.id = _id
      and p.crm_contact_sent_at is null
      and (
        p.crm_contact_claimed_at is null
        or p.crm_contact_claimed_at < now() - interval '5 minutes'
      )
      and not exists (
        select 1 from public.call_funnel_applications a
        where a.token_hash = p.token_hash
      )
    returning 1
  )
  select exists (select 1 from claimed);
$$;

revoke all on function public.call_funnel_crm_contact_claim(uuid)
  from public, anon, authenticated;
grant execute on function public.call_funnel_crm_contact_claim(uuid)
  to service_role;

-- A finished application has its own full CRM event. Remove its unfinished
-- contact event from the retry queue so it cannot crowd out new leads.
create or replace function public.call_funnel_crm_contact_supersede()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  update public.call_funnel_partials
  set crm_contact_sent_at = now()
  where token_hash = new.token_hash
    and crm_contact_sent_at is null;
  return new;
end;
$$;

revoke all on function public.call_funnel_crm_contact_supersede()
  from public, anon, authenticated;

drop trigger if exists call_funnel_crm_contact_supersede
  on public.call_funnel_applications;
create trigger call_funnel_crm_contact_supersede
after insert on public.call_funnel_applications
for each row execute function public.call_funnel_crm_contact_supersede();
