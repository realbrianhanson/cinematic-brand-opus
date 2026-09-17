import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
const fixture = `create role anon;create role authenticated;
create table site_settings(id uuid primary key default gen_random_uuid(),site_name text,site_url text,author_name text,author_title text,author_bio text,publisher_name text,publisher_url text,cta_url text,cta_headline text,cta_subtext text,cta_button_text text,cta_social_proof text,image_generation_enabled boolean,newsletter_from_address text,newsletter_reply_to text,newsletter_postal_address text);
create table site_settings_private(report_enabled boolean,auto_publish_enabled boolean,auto_publish_daily_cap int,auto_publish_min_quality int,voice_profile text,banned_phrases text[],default_expert_pov text);
create table content_schemas(slug text primary key,name text,description text,schema_definition jsonb,title_template text,description_template text,renderer_component text,items_per_section int,is_active boolean);
create table posts(id uuid);create table newsletter_subscribers(email text);`;
const sql = readFileSync("setup/member-bootstrap.sql", "utf8");
const db = new PGlite();
await db.exec(fixture);
await db.exec(sql);
assert.equal(
  (await db.query("select count(*)::int n from site_settings")).rows[0].n,
  1,
);
assert.deepEqual(
  (
    await db.query(
      "select auto_publish_enabled,report_enabled from site_settings_private",
    )
  ).rows[0],
  { auto_publish_enabled: false, report_enabled: false },
);
assert.equal(
  (await db.query("select count(*)::int n from newsletter_subscribers")).rows[0]
    .n,
  0,
);
await db.exec("update site_settings set site_name='My Brand'");
await db.exec(sql);
assert.equal(
  (await db.query("select site_name from site_settings")).rows[0].site_name,
  "My Brand",
  "rerun preserves configured settings",
);
await db.close();
const populated = new PGlite();
await populated.exec(fixture);
await populated.exec(
  "insert into site_settings(site_name)values('Existing Owner')",
);
await assert.rejects(populated.exec(sql), /Refusing bootstrap/);
await populated.exec("rollback");
assert.equal(
  (await populated.query("select site_name from site_settings")).rows[0]
    .site_name,
  "Existing Owner",
);
await populated.close();
console.log(
  "PASS: empty member bootstrap, automation off, no subscribers, idempotent rerun, populated-owner refusal",
);
