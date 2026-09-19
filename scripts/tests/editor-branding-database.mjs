import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
const db = new PGlite();
const owner = "00000000-0000-0000-0000-000000000001",
  other = "00000000-0000-0000-0000-000000000002",
  post = "00000000-0000-0000-0000-000000000003";
await db.exec(`create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
create function public.is_admin(uuid) returns boolean language sql as $$select $1='${owner}'::uuid$$;
grant usage on schema public,auth to anon,authenticated;
insert into auth.users values('${owner}'),('${other}');
create table posts(id uuid primary key,title text,content text,slug text,excerpt text,status text,updated_at timestamptz default now());
create table seo_metadata(id uuid default gen_random_uuid(),post_id uuid references posts(id) on delete cascade,meta_title text,updated_at timestamptz default now());
create table site_settings(id uuid default gen_random_uuid(),site_name text,site_url text,author_name text,author_title text,author_bio text,publisher_name text,publisher_url text,author_credentials text[],author_social_links jsonb,cta_button_text text,cta_url text,cta_headline text,cta_subtext text,cta_social_proof text,updated_at timestamptz default now(),newsletter_from_address text);
insert into site_settings(site_name,newsletter_from_address,author_credentials,author_social_links) values('Owner','preserve@example.com',ARRAY['Owner credential'],'{"linkedin":"owner"}');
insert into posts(id,title,content,slug,status) values('${post}','Original','original body','original','published');
insert into seo_metadata(post_id,meta_title) values('${post}','Original meta');
create table generated_pages(id uuid, title text,slug text,status text,views int,content_schema_id uuid,niche_id uuid,performance_trend text,seo_meta jsonb);
create table content_schemas(id uuid,name text,slug text,is_active boolean);
create table niches(id uuid,name text);
create table pillar_pages(id uuid,title text,slug text,status text,seo_meta jsonb);
create table indexing_log(id uuid,status text);
create table cta_events(page_id uuid,event_type text,created_at timestamptz);
create table page_engagement(event_type text,created_at timestamptz);
create table gsc_performance(page_url text,query text,clicks int,impressions int,ctr numeric,position numeric,period_start date,period_end date,fetched_at timestamptz);
create table generation_jobs(id uuid,status text,total_combinations int,completed_count int,success_count int,failed_count int,skipped_count int,error_message text,updated_at timestamptz);
`);
for (const file of [
  "20260919090000_editor_recovery.sql",
  "20260919091000_site_branding.sql",
  "20260919092000_performance_reporting.sql",
  "20260919093000_public_library.sql",
  "20260919094000_library_and_breakdowns.sql",
])
  await db.exec(readFileSync("supabase/migrations/" + file, "utf8"));
await db.exec("set role anon");
await assert.rejects(
  db.query("select * from post_editor_drafts"),
  /permission denied/,
);
await assert.rejects(
  db.query("select admin_performance_snapshot(30)"),
  /permission denied/,
);
await assert.rejects(
  db.query("select save_site_branding('{}')"),
  /permission denied/,
);
assert.equal((await db.query("select * from site_branding")).rows.length, 0);
await db.exec(`set role authenticated;set test.uid='${other}'`);
await assert.rejects(
  db.query("select save_site_branding('{}')"),
  /Administrator required/,
);
await assert.rejects(
  db.query(
    "insert into post_editor_drafts(user_id,document_key,snapshot) values($1,$2,$3)",
    [other, post, {}],
  ),
  /row-level security/,
);
await db.exec(`set test.uid='${owner}'`);
await db.query(
  "insert into post_editor_drafts(user_id,document_key,snapshot) values($1,$2,$3)",
  [owner, post, { content: "working" }],
);
await assert.rejects(
  db.query(
    "insert into post_editor_drafts(user_id,document_key,snapshot) values($1,$2,$3)",
    [other, post, {}],
  ),
  /row-level security/,
);
const old = (await db.query("select updated_at from post_editor_drafts"))
  .rows[0].updated_at;
await db.exec('update post_editor_drafts set snapshot=\'{"content":"newer"}\'');
assert.equal(
  (
    await db.query(
      "update post_editor_drafts set snapshot=$1 where updated_at=$2 returning *",
      [{ content: "stale" }, old],
    )
  ).rows.length,
  0,
);
const value = {
  mode: "member",
  name: "Acme",
  role: "Consultant",
  siteUrl: "https://acme.example",
  accent: "#2255AA",
  authorBio: "Real bio",
  offerLabel: "Explore",
  offerUrl: "/resources",
  headline: "Useful work",
  description: "A practical guide",
  initials: "AC",
  email: "",
  niche: "Consulting",
  logo: "",
  favicon: "",
  socialImage: "",
};
await db.query("select save_site_branding($1)", [value]);
await db.exec("reset role");
const settings = (await db.query("select * from site_settings")).rows[0];
assert.equal(settings.site_name, "Acme");
assert.equal(settings.newsletter_from_address, "preserve@example.com");
assert.deepEqual(settings.author_credentials, []);
assert.deepEqual(settings.author_social_links, {});
assert.equal(
  (await db.query("select content from posts")).rows[0].content,
  "original body",
);
await db.exec(
  "update posts set content='Edited'; update seo_metadata set meta_title='New meta'",
);
assert.equal(
  (await db.query("select count(*)::int n from post_revisions")).rows[0].n,
  2,
);
assert.equal(
  (
    await db.query(
      "select snapshot->'post'->>'content' c from post_revisions order by created_at limit 1",
    )
  ).rows[0].c,
  "original body",
);
for (let i = 0; i < 25; i++)
  await db.query("update posts set title=$1", ["Version " + i]);
assert.equal(
  (await db.query("select count(*)::int n from post_revisions")).rows[0].n,
  20,
);
await db.exec(
  `insert into gsc_performance values('https://acme.example/blog/old','old',99,999,.1,2,'2026-08-01','2026-08-28',now()),('https://acme.example/blog/new','new',2,20,.1,5,'2026-09-01','2026-09-18',now());set role authenticated;set test.uid='${owner}'`,
);
const report = (await db.query("select admin_performance_snapshot(30) d"))
  .rows[0].d;
assert.equal(report.search.clicks, 2);
assert.equal(report.queries.length, 1);
assert.equal(report.queries[0].query, "new");
await db.exec(
  "reset role; grant select on posts,pillar_pages,generated_pages,content_schemas to anon; set role anon",
);
assert.equal(
  (await db.query("select search_public_library('Version',0) d")).rows[0].d
    .total,
  1,
);
assert.equal(
  (await db.query("select search_public_library('%',0) d")).rows[0].d.total,
  0,
);
await db.exec("reset role");
await db.exec("delete from posts");
assert.equal(
  (await db.query("select count(*)::int n from post_revisions")).rows[0].n,
  0,
);
await db.close();
console.log(
  "PASS: editor isolation, RLS, optimistic conflicts, revision retention, branding identity and private-setting preservation, latest-period analytics, literal search.",
);
