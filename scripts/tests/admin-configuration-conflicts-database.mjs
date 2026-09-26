import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const db = new PGlite();
const admin = "00000000-0000-4000-8000-000000000001";
const other = "00000000-0000-4000-8000-000000000002";
const one = async (sql, args = []) => (await db.query(sql, args)).rows[0];
await db.exec(`
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('test.uid',true),'')::uuid $$;
CREATE FUNCTION public.is_admin(uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT coalesce($1='${admin}'::uuid,false) $$;
GRANT USAGE ON SCHEMA public,auth TO anon,authenticated,service_role;
CREATE TABLE site_settings(id uuid default gen_random_uuid(),site_name text,site_url text,author_name text,author_title text,author_bio text,publisher_name text,publisher_url text,author_credentials text[],author_social_links jsonb,cta_button_text text,cta_url text,cta_headline text,cta_subtext text,cta_social_proof text,updated_at timestamptz default now());
INSERT INTO site_settings(site_name,author_title,cta_headline) VALUES('Original','Preserve byline','Preserve article CTA');
CREATE TABLE widget_config(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),config jsonb DEFAULT '{}',updated_at timestamptz DEFAULT now());
ALTER TABLE widget_config ENABLE ROW LEVEL SECURITY;
GRANT SELECT,UPDATE ON widget_config TO authenticated;
CREATE POLICY widget_admin ON widget_config FOR ALL TO authenticated USING(public.is_admin(auth.uid())) WITH CHECK(public.is_admin(auth.uid()));
CREATE TABLE offers(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),slug text,title text,summary text,kind text DEFAULT 'free',status text,funnel_only boolean DEFAULT false);
`);
for (const file of [
  "20260919091000_site_branding.sql",
  "20260923101000_site_setup_preserve_settings.sql",
  "20260923160000_redirects.sql",
  "20260924070000_content_offer_routes.sql",
  "20260927100000_admin_configuration_conflicts.sql",
])
  await db.exec(readFileSync(`supabase/migrations/${file}`, "utf8"));
const payload = {
  mode: "owner",
  name: "Brian Hanson",
  siteUrl: "https://brianhanson.com",
  accent: "#C9A84C",
};
const versions = async () =>
  await one(
    `SELECT (SELECT updated_at::text FROM site_branding) branding,(SELECT updated_at::text FROM site_settings) settings`,
  );
const save = (version, value = payload) =>
  one("SELECT admin_save_site_branding($1,$2,$3) result", [
    value,
    version.branding,
    version.settings,
  ]);
let version = await versions();
await db.exec("SET ROLE anon");
await assert.rejects(save(version), /permission denied/);
await db.exec(`SET ROLE authenticated; SET test.uid='${other}'`);
await assert.rejects(save(version), /Administrator/);
await db.exec(`SET test.uid='${admin}'`);
assert.equal((await save(version)).result.saved, true);
await assert.rejects(
  save(version, { ...payload, name: "Stale tab" }),
  /changed in another session/,
);
await db.exec("RESET ROLE");
assert.equal(
  (await one("SELECT count(*)::int n FROM site_setup_history")).n,
  1,
  "conflict creates no history/write",
);
assert.equal(
  (await one("SELECT site_name,author_title,cta_headline FROM site_settings"))
    .site_name,
  "Brian Hanson",
);
assert.equal(
  (await one("SELECT author_title FROM site_settings")).author_title,
  "Preserve byline",
);
assert.equal(
  (await one("SELECT cta_headline FROM site_settings")).cta_headline,
  "Preserve article CTA",
);
version = await versions();
await db.exec(
  "UPDATE site_settings SET author_title='Changed from Site Config'",
);
await db.exec(`SET ROLE authenticated; SET test.uid='${admin}'`);
await assert.rejects(save(version), /changed in another session/);
await db.exec("RESET ROLE");
version = await versions();
await db.exec(`SET ROLE authenticated; SET test.uid='${admin}'`);
assert.equal((await save(version)).result.saved, true);
// Legacy deployed clients still call their original RPC successfully.
await db.query("SELECT save_site_branding($1)", [payload]);
await assert.rejects(
  db.query("SELECT * FROM site_setup_history"),
  /permission denied/,
);
await db.exec("RESET ROLE");
const offer = (
  await one(
    "INSERT INTO offers(title,slug,status) VALUES('Kit','kit','published') RETURNING id",
  )
).id;
const widget = await one(
  'INSERT INTO widget_config(config) VALUES(\'{"title":"Original"}\') RETURNING id,updated_at::text version',
);
await db.exec(`SET ROLE authenticated; SET test.uid='${admin}'`);
const firstWidget = await one(
  'UPDATE widget_config SET config=\'{"title":"Tab A"}\' WHERE id=$1 AND updated_at=$2 RETURNING updated_at::text version',
  [widget.id, widget.version],
);
assert.ok(firstWidget.version !== widget.version);
assert.equal(
  (
    await db.query(
      'UPDATE widget_config SET config=\'{"title":"Tab B"}\' WHERE id=$1 AND updated_at=$2 RETURNING id',
      [widget.id, widget.version],
    )
  ).rows.length,
  0,
  "stale widget update affects no rows",
);
const route = await one(
  "INSERT INTO content_offer_routes(scope,match_key,label,offer_id) VALUES('default','*','Default',$1) RETURNING id,updated_at::text version",
  [offer],
);
await assert.rejects(
  db.query(
    "INSERT INTO content_offer_routes(scope,match_key,label,offer_id) VALUES('default','*','Replacement',$1)",
    [offer],
  ),
  /unique constraint/,
);
const changedRoute = await one(
  "UPDATE content_offer_routes SET headline='Tab A' WHERE id=$1 AND updated_at=$2 RETURNING updated_at::text version",
  [route.id, route.version],
);
assert.equal(
  (
    await db.query(
      "UPDATE content_offer_routes SET headline='Tab B' WHERE id=$1 AND updated_at=$2 RETURNING id",
      [route.id, route.version],
    )
  ).rows.length,
  0,
);
assert.equal(
  (
    await db.query(
      "DELETE FROM content_offer_routes WHERE id=$1 AND updated_at=$2 RETURNING id",
      [route.id, route.version],
    )
  ).rows.length,
  0,
  "stale deletes preserve new assignments",
);
await db.query(
  "DELETE FROM content_offer_routes WHERE id=$1 AND updated_at=$2",
  [route.id, changedRoute.version],
);
assert.equal(
  (
    await db.query(
      "UPDATE content_offer_routes SET headline='Resurrected' WHERE id=$1 AND updated_at=$2 RETURNING id",
      [route.id, changedRoute.version],
    )
  ).rows.length,
  0,
  "deleted assignments never resurrect on edit",
);
const redirect = await one(
  "INSERT INTO redirect_rules(from_path,to_path) VALUES('/old-test','/about') RETURNING id,updated_at::text version",
);
await db.exec("RESET ROLE");
await db.query("UPDATE redirect_rules SET hits=hits+1 WHERE id=$1", [
  redirect.id,
]);
assert.equal(
  (
    await one(
      "SELECT updated_at::text version FROM redirect_rules WHERE id=$1",
      [redirect.id],
    )
  ).version,
  redirect.version,
  "visits do not invalidate redirect drafts",
);
await db.exec(`SET ROLE authenticated; SET test.uid='${admin}'`);
const changedRedirect = await one(
  "UPDATE redirect_rules SET to_path='/shop' WHERE id=$1 AND updated_at=$2 RETURNING updated_at::text version",
  [redirect.id, redirect.version],
);
assert.equal(
  (
    await db.query(
      "UPDATE redirect_rules SET to_path='/start-here' WHERE id=$1 AND updated_at=$2 RETURNING id",
      [redirect.id, redirect.version],
    )
  ).rows.length,
  0,
);
await db.query("DELETE FROM redirect_rules WHERE id=$1 AND updated_at=$2", [
  redirect.id,
  changedRedirect.version,
]);
assert.equal(
  (
    await db.query(
      "UPDATE redirect_rules SET to_path='/shop' WHERE id=$1 AND updated_at=$2 RETURNING id",
      [redirect.id, changedRedirect.version],
    )
  ).rows.length,
  0,
  "zero-row writes cannot be reported as saves",
);
await db.exec(`SET test.uid='${other}'`);
assert.equal(
  (
    await db.query(
      "UPDATE widget_config SET config='{}' WHERE id=$1 RETURNING id",
      [widget.id],
    )
  ).rows.length,
  0,
);
await assert.rejects(
  db.query(
    "INSERT INTO content_offer_routes(scope,match_key,label,offer_id) VALUES('default','*','Unauthorized',$1)",
    [offer],
  ),
  /row-level security/,
);
await db.exec("RESET ROLE; BEGIN");
const v1 = await one(
  "UPDATE widget_config SET config='{}' WHERE id=$1 RETURNING updated_at::text version",
  [widget.id],
);
const v2 = await one(
  "UPDATE widget_config SET config='{}' WHERE id=$1 RETURNING updated_at::text version",
  [widget.id],
);
assert.notEqual(
  v1.version,
  v2.version,
  "even same-transaction writes advance version",
);
await db.exec("ROLLBACK");
await db.close();
console.log(
  "Admin configuration conflict checks passed: atomic versions, stale edits/deletes, create-only assignments, branding compatibility/history, RLS and usage counters.",
);
