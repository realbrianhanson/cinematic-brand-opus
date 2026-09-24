import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

// Regression: IndexNow had no real key (0 URLs ever sent) and Brand &
// publishing accepted any URL/email. The migration must store a real key,
// expose it only through a key-file lookup and an admin status RPC, and add
// format CHECK constraints that current production values pass.
const MIGRATION = readFileSync(
  "supabase/migrations/20260923151000_indexnow_and_settings_checks.sql",
  "utf8",
);
const admin = "00000000-0000-0000-0000-000000000001";
const other = "00000000-0000-0000-0000-000000000002";

async function freshDb(settingsValues) {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role; create schema auth;
create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
create function public.is_admin(uuid) returns boolean language sql as $$select $1='${admin}'::uuid$$;
grant usage on schema public,auth to anon,authenticated,service_role;
create table public.generated_pages(id uuid primary key default gen_random_uuid());
create table public.site_settings(id uuid primary key default gen_random_uuid(), site_name text not null default 'My Website', site_url text not null default 'https://example.com', publisher_url text default 'https://example.com', cta_url text default '', newsletter_from_address text, newsletter_reply_to text, updated_at timestamptz default now());
create table public.site_settings_private(id uuid primary key default gen_random_uuid(), report_email text default '', report_enabled boolean default false);
create table public.indexing_log(id uuid primary key default gen_random_uuid(), page_id uuid references public.generated_pages(id), page_url text not null, submitted_at timestamptz default now(), status text default 'submitted', method text default 'sitemap_ping', error_message text);
alter table public.site_settings enable row level security;
create policy "Anyone can read site_settings" on public.site_settings for select using (true);
grant select (id, site_name, site_url, publisher_url, cta_url) on public.site_settings to anon;
grant select, insert, update on public.site_settings to authenticated;
`);
  if (settingsValues) await db.exec(settingsValues);
  return db;
}

// 1. Production-shaped data (checked read-only on 2026-09-23): every check validates.
const db = await freshDb(`
insert into public.site_settings(site_url, publisher_url, cta_url, newsletter_from_address, newsletter_reply_to)
values ('https://brianhanson.com','https://brianhanson.com','https://go.aiforbusiness.com/summit?_go=brian60','Brian Hanson <brian@m.brianhanson.com>','brian@realagency.com');
insert into public.site_settings_private(report_email) values ('');
insert into public.indexing_log(page_url, status, method, submitted_at) values ('https://brianhanson.com/sitemap.xml','submitted','sitemap_ping','2026-07-06');
`);
await db.exec(MIGRATION);
// Idempotent: a re-run must not rotate the key or fail on existing objects.
const key1 = (await db.query("select indexnow_key from site_settings")).rows[0]
  .indexnow_key;
assert.match(key1, /^[0-9a-f]{32}$/);
await db.exec(MIGRATION);
assert.equal(
  (await db.query("select indexnow_key from site_settings")).rows[0]
    .indexnow_key,
  key1,
  "re-running the migration must keep the existing key",
);

const constraints = (
  await db.query(
    "select conname, convalidated from pg_constraint where conrelid in ('public.site_settings'::regclass,'public.site_settings_private'::regclass) and contype='c' order by conname",
  )
).rows;
assert.deepEqual(
  constraints.map((c) => c.conname),
  [
    "site_settings_cta_url_format",
    "site_settings_indexnow_key_format",
    "site_settings_newsletter_from_format",
    "site_settings_newsletter_reply_to_format",
    "site_settings_private_report_email_format",
    "site_settings_publisher_url_https",
    "site_settings_site_url_https",
  ],
);
assert.ok(
  constraints.every((c) => c.convalidated),
  "production-shaped rows pass, so every check is validated",
);

// Checks reject bad writes.
for (const [sql, name] of [
  ["update site_settings set site_url='brianhanson.com'", "site_url_https"],
  [
    "update site_settings set site_url='http://brianhanson.com'",
    "site_url_https",
  ],
  [
    "update site_settings set site_url='https://brianhanson.com/'",
    "site_url_https",
  ],
  ["update site_settings set publisher_url='www.x.com'", "publisher_url_https"],
  ["update site_settings set cta_url='javascript:alert(1)'", "cta_url_format"],
  ["update site_settings set cta_url='//evil.example'", "cta_url_format"],
  [
    "update site_settings set newsletter_from_address='Brian <brian@m.brianhanson.com'",
    "newsletter_from_format",
  ],
  ["update site_settings set newsletter_reply_to='brian@'", "reply_to_format"],
  ["update site_settings set indexnow_key='../x'", "indexnow_key_format"],
  [
    "update site_settings_private set report_email='me at x'",
    "report_email_format",
  ],
])
  await assert.rejects(db.exec(sql), new RegExp(name), sql);

// Allowed optional blanks and relative CTA paths.
await db.exec(
  "update site_settings set publisher_url='', cta_url='/summit', newsletter_from_address='brian@m.brianhanson.com', newsletter_reply_to=null",
);
await db.exec(
  "update site_settings_private set report_email='brian@realagency.com'",
);
await db.exec("update site_settings_private set report_email=''");

// 2. Key-file lookup: anon can confirm the exact key only; the column stays private.
await db.exec("set role anon");
assert.equal(
  (await db.query("select public.indexnow_key_file($1) k", [key1])).rows[0].k,
  key1,
);
assert.equal(
  (
    await db.query("select public.indexnow_key_file($1) k", [
      "deadbeefdeadbeef",
    ])
  ).rows[0].k,
  null,
);
assert.equal(
  (await db.query("select public.indexnow_key_file($1) k", ["%"])).rows[0].k,
  null,
);
await assert.rejects(
  db.query("select indexnow_key from site_settings"),
  /permission denied/,
);
await assert.rejects(
  db.query("select public.admin_indexnow_status()"),
  /permission denied/,
);
await db.exec("reset role");

// 3. Admin status RPC: admin only, real counts from indexing_log.
await db.exec(`set role authenticated; set test.uid='${other}'`);
await assert.rejects(
  db.query("select public.admin_indexnow_status()"),
  /Administrator access required/,
);
await db.exec(`set test.uid='${admin}'`);
let status = (await db.query("select public.admin_indexnow_status() s")).rows[0]
  .s;
assert.deepEqual(status, {
  key: key1,
  received_total: 0,
  last_submission_at: null,
  last_submission_count: 0,
  last_error_at: null,
  last_error: null,
});
await db.exec("reset role");

await db.exec(`
insert into indexing_log(page_url,status,method,error_message,submitted_at) values
 ('https://brianhanson.com','error','indexnow','IndexNow key missing','2026-09-21T08:00:00Z'),
 ('https://brianhanson.com/blog/a','indexnow_submitted','indexnow',null,'2026-09-22T08:00:00Z'),
 ('https://brianhanson.com/blog/b','indexnow_submitted','indexnow',null,'2026-09-22T08:00:00Z'),
 ('https://brianhanson.com/blog/c','indexnow_pending','indexnow',null,'2026-09-22T08:00:00Z'),
 ('https://brianhanson.com/blog/d','indexnow_submitted','indexnow',null,'2026-09-23T08:00:00Z'),
 ('https://brianhanson.com/blog/e','indexnow_submitted','indexnow',null,'2026-09-23T08:00:00Z'),
 ('https://brianhanson.com/x','submitted','sitemap_ping',null,'2026-09-24T08:00:00Z');
`);
await db.exec(`set role authenticated; set test.uid='${admin}'`);
status = (await db.query("select public.admin_indexnow_status() s")).rows[0].s;
assert.equal(status.received_total, 5);
assert.equal(status.last_submission_count, 2);
assert.equal(
  new Date(status.last_submission_at).toISOString(),
  "2026-09-23T08:00:00.000Z",
);
assert.equal(status.last_error, "IndexNow key missing");
assert.equal(
  new Date(status.last_error_at).toISOString(),
  "2026-09-21T08:00:00.000Z",
);
await db.exec("reset role");

const grants = (
  await db.query(`select
  has_function_privilege('anon','public.indexnow_key_file(text)','execute') anon_key,
  has_function_privilege('anon','public.admin_indexnow_status()','execute') anon_status,
  has_function_privilege('authenticated','public.admin_indexnow_status()','execute') auth_status,
  has_column_privilege('anon','public.site_settings','indexnow_key','select') anon_col`)
).rows[0];
assert.deepEqual(grants, {
  anon_key: true,
  anon_status: false,
  auth_status: true,
  anon_col: false,
});
await db.close();

// 4. A copy whose data would fail keeps NOT VALID checks (migration still applies).
const legacy = await freshDb(`
insert into public.site_settings(site_url, publisher_url, newsletter_reply_to) values ('brianhanson.com','http://old.example','nobody');
insert into public.site_settings_private(report_email) values ('bad');
`);
await legacy.exec(MIGRATION);
const legacyChecks = Object.fromEntries(
  (
    await legacy.query(
      "select conname, convalidated from pg_constraint where conrelid in ('public.site_settings'::regclass,'public.site_settings_private'::regclass) and contype='c'",
    )
  ).rows.map((r) => [r.conname, r.convalidated]),
);
assert.equal(legacyChecks.site_settings_site_url_https, false);
assert.equal(legacyChecks.site_settings_publisher_url_https, false);
assert.equal(legacyChecks.site_settings_newsletter_reply_to_format, false);
assert.equal(legacyChecks.site_settings_private_report_email_format, false);
assert.equal(legacyChecks.site_settings_cta_url_format, true);
assert.match(
  (await legacy.query("select indexnow_key from site_settings")).rows[0]
    .indexnow_key,
  /^[0-9a-f]{32}$/,
);
// New rows get a key by default.
await legacy.exec("insert into site_settings default values");
assert.equal(
  (
    await legacy.query(
      "select count(*)::int n from site_settings where indexnow_key ~ '^[0-9a-f]{32}$'",
    )
  ).rows[0].n,
  2,
);
await legacy.close();

console.log(
  "PASS: IndexNow key stored and served by exact match only, admin status reports real receipts/errors, settings checks validated on clean data and NOT VALID on legacy data.",
);
