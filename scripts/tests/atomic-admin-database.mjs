import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
const db = new PGlite();
const admin = "00000000-0000-0000-0000-000000000001";
await db.exec(`create role anon; create role authenticated; create schema auth;
create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
create function public.is_admin(uuid) returns boolean language sql as $$select $1='${admin}'::uuid$$;
grant usage on schema public,auth to anon,authenticated;`);
const initial = readFileSync(
  "supabase/migrations/20260312171802_6457fd8e-fcd2-40ca-8c0b-ac73aa05562f.sql",
  "utf8",
);
await db.exec(
  initial.slice(
    initial.indexOf("CREATE TABLE public.site_settings"),
    initial.indexOf("-- niches"),
  ),
);
await db.exec(`alter table site_settings add column image_generation_enabled boolean, add column newsletter_from_address text, add column newsletter_reply_to text, add column newsletter_postal_address text;
create table site_settings_private(id uuid primary key default gen_random_uuid(), report_email text check(report_email <> 'fail'),report_enabled boolean,voice_profile text,banned_phrases text[],default_expert_pov text,updated_at timestamptz default now(),auto_publish_enabled boolean default false);
insert into site_settings_private(report_email,voice_profile) values('','Keep this strategy');
create table widget_config(id uuid primary key,widget_zone text,sort_order integer,config jsonb default '{}',updated_at timestamptz default now());
insert into widget_config(id,widget_zone,sort_order) values('${admin}','page',1),('00000000-0000-0000-0000-000000000002','page',1),('00000000-0000-0000-0000-000000000003','footer',1);`);
await db.exec(
  readFileSync(
    "supabase/migrations/20260925100000_atomic_admin_writes.sql",
    "utf8",
  ),
);
const current = async () => ({
  pub: (await db.query("select * from site_settings")).rows[0],
  priv: (await db.query("select * from site_settings_private")).rows[0],
});
const original = await current();
const save = (pub, priv, publicPatch = {}, privatePatch = {}) =>
  db.query("select admin_save_site_settings($1,$2,$3,$4,$5,$6) value", [
    pub.id,
    priv.id,
    JSON.stringify(publicPatch),
    JSON.stringify(privatePatch),
    pub.updated_at,
    priv.updated_at,
  ]);
await db.exec("set role anon");
await assert.rejects(save(original.pub, original.priv), /permission denied/);
await db.exec("set role authenticated");
await assert.rejects(
  save(original.pub, original.priv),
  /Administrator required/,
);
await db.exec(`set test.uid='${admin}'`);
await assert.rejects(
  save(
    original.pub,
    original.priv,
    { site_name: "Should roll back" },
    { report_email: "fail" },
  ),
  /check constraint/,
);
await db.exec("reset role");
assert.equal((await current()).pub.site_name, original.pub.site_name);
await db.exec("set role authenticated");
await save(
  original.pub,
  original.priv,
  { site_name: "Saved together" },
  {
    report_email: "owner@example.test",
    gsc_property: "sc-domain:example.test",
  },
);
await assert.rejects(
  save(original.pub, original.priv, { site_name: "Stale draft" }),
  /Settings changed/,
);
await assert.rejects(
  save(original.pub, original.priv, { indexnow_key: "forged" }),
  /Unsupported settings field/,
);
await db.exec("reset role");
const saved = await current();
assert.equal(saved.pub.site_name, "Saved together");
assert.equal(saved.priv.report_email, "owner@example.test");
assert.equal(saved.priv.voice_profile, "Keep this strategy");
assert.equal(saved.priv.auto_publish_enabled, false);
await db.exec("set role authenticated");
const swap = (a, b, ao, bo, d) =>
  db.query("select admin_swap_widget_order($1,$2,$3,$4,$5)", [a, b, ao, bo, d]);
const b = "00000000-0000-0000-0000-000000000002";
await swap(admin, b, 1, 1, "down");
await assert.rejects(swap(admin, b, 1, 1, "down"), /order changed/);
await assert.rejects(
  swap(admin, "00000000-0000-0000-0000-000000000003", 2, 1, "down"),
  /widgets changed/,
);
await db.exec("reset role");
assert.deepEqual(
  (
    await db.query(
      "select sort_order from widget_config where widget_zone='page' order by id",
    )
  ).rows.map((r) => r.sort_order),
  [2, 1],
);
await db.exec(`create function reject_second_widget() returns trigger language plpgsql as $$begin if new.id='${b}' then raise exception 'Injected second write failure';end if;return new;end$$;
create trigger reject_second before update on widget_config for each row execute function reject_second_widget();set role authenticated;`);
await assert.rejects(
  swap(admin, b, 2, 1, "up"),
  /Injected second write failure/,
);
await db.exec("reset role");
assert.deepEqual(
  (
    await db.query(
      "select sort_order from widget_config where widget_zone='page' order by id",
    )
  ).rows.map((r) => r.sort_order),
  [2, 1],
);
console.log(
  "PASS: atomic paired saves, permissions, stale drafts, allowlists, preserved unrelated fields, tied widget ordering, reorder rollback",
);
await db.close();
