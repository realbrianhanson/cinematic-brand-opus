-- Submitted call funnel applications post to a CRM inbound webhook
-- (GoHighLevel) from the server. The address lives in the admin-only
-- private settings, so it never reaches the browser.
alter table public.site_settings_private
  add column if not exists call_funnel_webhook_url text not null default '';

alter table public.call_funnel_applications
  add column if not exists crm_sent_at timestamptz,
  add column if not exists crm_claimed_at timestamptz;

-- The submit path and the 15-minute worker both send; a 5-minute claim keeps
-- them from posting the same lead twice.
create or replace function public.call_funnel_crm_claim(_id uuid)
returns boolean
language sql
security definer
set search_path = public, pg_temp
as $$
  with claimed as (
    update public.call_funnel_applications
    set crm_claimed_at = now()
    where id = _id
      and crm_sent_at is null
      and (crm_claimed_at is null or crm_claimed_at < now() - interval '5 minutes')
    returning 1
  )
  select exists (select 1 from claimed);
$$;

revoke all on function public.call_funnel_crm_claim(uuid) from public, anon, authenticated;
grant execute on function public.call_funnel_crm_claim(uuid) to service_role;
