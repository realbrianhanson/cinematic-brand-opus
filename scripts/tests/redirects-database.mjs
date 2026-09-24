import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

// Automatic 404 handling: visitors (anon) may only call resolve_redirect and
// record_not_found; both validate every input and never store query strings
// or user agents. The two tables are admin-only.
const MIGRATION = readFileSync(
  "supabase/migrations/20260923160000_redirects.sql",
  "utf8",
);
const admin = "00000000-0000-0000-0000-000000000001";
const member = "00000000-0000-0000-0000-000000000002";

const db = new PGlite();
await db.exec(`create role anon; create role authenticated; create role service_role; create schema auth;
create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
create function public.is_admin(uuid) returns boolean language sql security definer as $$select $1='${admin}'::uuid$$;
grant usage on schema public,auth to anon,authenticated,service_role;
-- Supabase grants new objects to the API roles by default; the migration must undo that.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
`);
await db.exec(MIGRATION);
await db.exec(MIGRATION); // idempotent

const q = async (sql, params) => (await db.query(sql, params)).rows;
const as = async (role, uid = "") => {
  await db.exec("reset role");
  await db.query("select set_config('test.uid', $1, false)", [uid]);
  if (role) await db.exec(`set role ${role}`);
};
const denied = (promise, pattern = /permission denied|row-level security/i) =>
  assert.rejects(promise, pattern);

// 1. Seeds: exactly three rules, applied once.
assert.deepEqual(
  await q(
    "select from_path, to_path, status_code, is_active, hits from redirect_rules order by from_path",
  ),
  [
    {
      from_path: "/contact",
      to_path: "/speaking",
      status_code: 301,
      is_active: true,
      hits: 0,
    },
    {
      from_path: "/my-story",
      to_path: "/about",
      status_code: 301,
      is_active: true,
      hits: 0,
    },
    {
      from_path: "/newsletter",
      to_path: "/",
      status_code: 302,
      is_active: true,
      hits: 0,
    },
  ],
);

// 2. Anonymous visitors: no table access at all, only the two functions.
await as("anon");
for (const sql of [
  "select * from redirect_rules",
  "select * from not_found_hits",
  "insert into redirect_rules(from_path,to_path) values ('/x','/')",
  "insert into not_found_hits(path) values ('/x')",
  "update redirect_rules set to_path='https://evil.example'",
  "delete from not_found_hits",
  "select public.normalize_redirect_path('/x')",
  "select public.redirect_path_eligible('/x')",
])
  await denied(db.query(sql), /permission denied/i);

assert.deepEqual(
  await q("select * from public.resolve_redirect($1)", ["/My-Story/?utm=1"]),
  [{ to_path: "/about", status_code: 301 }],
);
assert.deepEqual(
  await q("select * from public.resolve_redirect($1)", ["/nothing-here"]),
  [],
);
for (const bad of [
  null,
  "",
  "my-story",
  "https://evil.example/my-story",
  "/my story",
  "/a/../my-story",
  `/${"a".repeat(600)}`,
  `/${"a".repeat(5000)}`,
])
  assert.deepEqual(
    await q("select * from public.resolve_redirect($1)", [bad]),
    [],
    `resolve must ignore ${String(bad).slice(0, 40)}`,
  );

// record_not_found: normalized path, referrer origin+path only, class allowlist.
const record = async (path, referrer = null, ua = "human") =>
  (
    await q("select public.record_not_found($1,$2,$3) ok", [path, referrer, ua])
  )[0].ok;

assert.equal(
  await record(
    "/Case-Studies/?utm_source=fb&email=a@b.co",
    "https://www.google.com/search?q=secret-token#frag",
  ),
  true,
);
assert.equal(await record("/case-studies", null, "evil-agent/1.0"), true);
assert.equal(await record("/social-media", "javascript:alert(1)", "bot"), true);
assert.equal(
  await record("/revven", "https://user:pw@evil.example/x", "unknown"),
  true,
);
assert.equal(
  await record("/revven", `https://example.com/${"a".repeat(900)}`, "human"),
  true,
);
for (const excluded of [
  "/",
  "/admin",
  "/admin/secret-page",
  "/api/public/x",
  "/assets/app.js",
  "/_serverFn/abc",
  "/robots.txt",
  "/images/logo.png",
  "/.env",
  "/.well-known/security.txt",
  "/wp-login",
  "/cgi-bin/x",
  "relative",
  "/a b",
  `/${"a".repeat(600)}`,
  null,
  "/my-story", // has an active rule: not missing
])
  assert.equal(await record(excluded), false, `must not record ${excluded}`);

await as(null);
assert.deepEqual(
  await q(
    "select path, hits, last_referrer, last_user_agent_class from not_found_hits order by path",
  ),
  [
    {
      path: "/case-studies",
      hits: 2,
      last_referrer: "https://www.google.com/search",
      last_user_agent_class: "unknown",
    },
    {
      path: "/revven",
      hits: 2,
      last_referrer: `https://example.com/${"a".repeat(280)}`,
      last_user_agent_class: "human",
    },
    {
      path: "/social-media",
      hits: 1,
      last_referrer: null,
      last_user_agent_class: "bot",
    },
  ],
);
assert.equal(
  (
    await q(
      "select hits, last_hit_at is not null seen from redirect_rules where from_path='/my-story'",
    )
  )[0].hits,
  1,
  "resolve_redirect counts a hit",
);

// Hit counters saturate instead of overflowing.
await db.exec(
  "update redirect_rules set hits=2147483647 where from_path='/contact'; update not_found_hits set hits=2147483647 where path='/revven'",
);
await as("anon");
assert.equal((await q("select * from resolve_redirect('/contact')")).length, 1);
assert.equal(await record("/revven"), true);
await as(null);
assert.equal(
  (await q("select hits from redirect_rules where from_path='/contact'"))[0]
    .hits,
  2147483647,
);
assert.equal(
  (await q("select hits from not_found_hits where path='/revven'"))[0].hits,
  2147483647,
);

// Table cap: random-path spam cannot grow the table without bound.
await db.exec(
  "insert into not_found_hits(path) select '/spam-' || g from generate_series(1, 4997) g",
);
assert.equal(
  (await q("select count(*)::int n from not_found_hits"))[0].n,
  5000,
);
await as("anon");
assert.equal(await record("/brand-new"), false, "full table refuses new paths");
assert.equal(await record("/case-studies"), true, "known paths still count");
await as(null);
await db.exec(
  "update not_found_hits set last_seen = now() - interval '30 days' where path like '/spam-%' and split_part(path,'-',2)::int <= 150",
);
await as("anon");
assert.equal(await record("/brand-new"), true, "stale one-off rows make room");
await as(null);
assert.ok((await q("select count(*)::int n from not_found_hits"))[0].n <= 5000);
await db.exec("delete from not_found_hits where path like '/spam-%'");

// 3. Signed-in non-admins see nothing and change nothing.
await as("authenticated", member);
assert.deepEqual(await q("select * from redirect_rules"), []);
assert.deepEqual(await q("select * from not_found_hits"), []);
await denied(
  db.query("insert into redirect_rules(from_path,to_path) values ('/x','/')"),
);
await db.exec("update redirect_rules set to_path='https://evil.example'");
await db.exec("delete from not_found_hits");
await as(null);
assert.equal(
  (
    await q(
      "select count(*)::int n from redirect_rules where to_path like 'https://evil%'",
    )
  )[0].n,
  0,
);
assert.ok((await q("select count(*)::int n from not_found_hits"))[0].n > 0);

// 4. Admin: create, validate, toggle, delete.
await as("authenticated", admin);
assert.equal((await q("select count(*)::int n from not_found_hits"))[0].n, 4);
const [created] = await q(
  "insert into redirect_rules(from_path,to_path,status_code,note) values (' /Case-Studies/ ','/blog',301,'  ') returning from_path, note",
);
assert.deepEqual(created, { from_path: "/case-studies", note: null });
assert.equal(
  (
    await q(
      "select count(*)::int n from not_found_hits where path='/case-studies'",
    )
  )[0].n,
  0,
  "a new rule clears its missing-page entry",
);

const rejectInsert = (from, to, code = 301, pattern) =>
  assert.rejects(
    db.query(
      "insert into redirect_rules(from_path,to_path,status_code) values ($1,$2,$3)",
      [from, to, code],
    ),
    pattern,
    `${from} -> ${to}`,
  );
await rejectInsert("/case-studies", "/", 301, /duplicate key|unique/i);
await rejectInsert("/x-chain", "/Case-Studies", 301, /already redirects/i);
await rejectInsert("/about", "/speaking", 301, /Another rule sends visitors/i);
await rejectInsert("/self", "/Self/", 301, /itself/i);
await rejectInsert("/", "/about", 301, /can't be redirected/i);
await rejectInsert("/admin/x", "/", 301, /can't be redirected/i);
await rejectInsert("/old.pdf", "/", 301, /can't be redirected/i);
await rejectInsert("relative", "/", 301, /site path/i);
await rejectInsert(
  "/x1",
  "javascript:alert(1)",
  301,
  /redirect_rules_to_path_shape/,
);
await rejectInsert(
  "/x2",
  "//evil.example",
  301,
  /redirect_rules_to_path_shape/,
);
await rejectInsert(
  "/x3",
  "http://example.com",
  301,
  /redirect_rules_to_path_shape/,
);
await rejectInsert(
  "/x4",
  "https://u:p@example.com",
  301,
  /redirect_rules_to_path_shape/,
);
await rejectInsert("/x5", "/a b", 301, /redirect_rules_to_path_shape/);
await rejectInsert("/x6", "/", 307, /redirect_rules_status_code_check/);
await db.query(
  "insert into redirect_rules(from_path,to_path,status_code) values ('/summit','https://go.aiforbusiness.com/summit',302)",
);

// Toggling off stops resolution; toggling back on re-validates.
await db.exec(
  "update redirect_rules set is_active=false where from_path='/my-story'",
);
await db.query(
  "insert into redirect_rules(from_path,to_path) values ('/about','/speaking')",
);
await assert.rejects(
  db.query(
    "update redirect_rules set is_active=true where from_path='/my-story'",
  ),
  /already redirects/i,
);
await db.exec("delete from redirect_rules where from_path='/about'");
await db.exec(
  "update redirect_rules set is_active=true where from_path='/my-story'",
);
await db.exec(
  "update redirect_rules set is_active=false where from_path='/summit'",
);
await as("anon");
assert.deepEqual(await q("select * from resolve_redirect('/summit')"), []);
await as("authenticated", admin);
await db.exec("delete from redirect_rules where from_path='/summit'");
await db.exec("delete from not_found_hits where path='/social-media'");
assert.equal((await q("select count(*)::int n from redirect_rules"))[0].n, 4);

// 5. Hit bumps must not rewrite updated_at (admin sees real edit times).
await as(null);
const before = (
  await q("select updated_at from redirect_rules where from_path='/contact'")
)[0].updated_at;
await as("anon");
await q("select * from resolve_redirect('/contact')");
await as(null);
assert.deepEqual(
  (
    await q("select updated_at from redirect_rules where from_path='/contact'")
  )[0].updated_at,
  before,
);

// 6. Grants: anon/authenticated execute only the two public functions.
const grants =
  await q(`select p.proname, has_function_privilege('anon', p.oid, 'execute') anon,
  has_function_privilege('authenticated', p.oid, 'execute') authed
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname in ('resolve_redirect','record_not_found','normalize_redirect_path','redirect_path_eligible','redirect_rules_before_write')
  order by p.proname`);
assert.deepEqual(grants, [
  { proname: "normalize_redirect_path", anon: false, authed: false },
  { proname: "record_not_found", anon: true, authed: true },
  { proname: "redirect_path_eligible", anon: false, authed: false },
  { proname: "redirect_rules_before_write", anon: false, authed: false },
  { proname: "resolve_redirect", anon: true, authed: true },
]);
const secdef = await q(
  "select proname, prosecdef, proconfig from pg_proc where proname in ('resolve_redirect','record_not_found') order by proname",
);
for (const fn of secdef) {
  assert.equal(fn.prosecdef, true, `${fn.proname} is SECURITY DEFINER`);
  assert.ok(
    fn.proconfig?.some((c) => c.startsWith("search_path=")),
    `${fn.proname} pins search_path`,
  );
}

console.log("redirects database tests passed");
