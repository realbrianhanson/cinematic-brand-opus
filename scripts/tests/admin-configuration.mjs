import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
const db = new PGlite();
await db.exec(`create role anon;create role authenticated;create schema auth;
create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
create function public.is_admin(uuid) returns boolean language sql as $$select $1='00000000-0000-0000-0000-000000000001'::uuid$$;
grant usage on schema public,auth to anon,authenticated;
create table niches(id uuid default gen_random_uuid(),name text,slug text,is_active boolean,context jsonb,expert_pov text);alter table niches enable row level security;
create policy "Public reads active niches" on niches for select using(is_active);
grant select on niches to anon,authenticated;
create table site_settings(id uuid default gen_random_uuid(),site_name text,newsletter_from_address text,newsletter_reply_to text,image_generation_enabled boolean default true);
create table site_settings_private(auto_publish_enabled boolean default true);
insert into niches(name,slug,is_active,context,expert_pov) values('Active','active',true,'{"private":true}','Private'),('Inactive','inactive',false,'{}','Private');
insert into site_settings(site_name)values('Owner');`);
await db.exec(
  readFileSync(
    "supabase/migrations/20260917071000_admin_configuration_reads.sql",
    "utf8",
  ),
);
await db.exec("set role anon");
assert.equal((await db.query("select name from niches")).rows.length, 1);
await assert.rejects(
  db.query("select context from niches"),
  /permission denied/,
);
await assert.rejects(
  db.query("select * from admin_read_niches()"),
  /permission denied/,
);
await db.exec(
  "set role authenticated;set test.uid='00000000-0000-0000-0000-000000000002'",
);
assert.equal((await db.query("select name from niches")).rows.length, 1);
await assert.rejects(
  db.query("select context from niches"),
  /permission denied/,
);
await assert.rejects(
  db.query("select * from admin_read_niches()"),
  /Administrator access required/,
);
await assert.rejects(
  db.query("select * from admin_read_site_settings()"),
  /Administrator access required/,
);
await db.exec("set test.uid='00000000-0000-0000-0000-000000000001'");
assert.equal(
  (await db.query("select * from admin_read_niches()")).rows.length,
  2,
);
assert.equal(
  (await db.query("select * from admin_read_site_settings()")).rows[0]
    .site_name,
  "Owner",
);
console.log(
  "PASS: anonymous/public fields only, non-admin RPC denial, admin private/inactive reads",
);
await db.close();
