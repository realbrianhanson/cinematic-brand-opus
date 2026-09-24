// Admin overview truth: one admin-only snapshot for the Overview (cards,
// live vs test orders, attention list) and resource views counted from real
// page_engagement events instead of the dead generated_pages.views column.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const MIGRATION = readFileSync(
  "supabase/migrations/20260923150000_admin_overview_truth.sql",
  "utf8",
);

const BASE_SCHEMA = `
create role anon; create role authenticated; create role service_role;
create schema auth;
create function auth.uid() returns uuid language sql as $$select '00000000-0000-4000-8000-000000000001'::uuid$$;
create function public.is_admin(uuid) returns boolean language sql
  as $$select coalesce(current_setting('test.admin', true), '') = 'on'$$;
create table speaking_inquiries(id uuid primary key default gen_random_uuid(), status text);
create table posts(id uuid primary key default gen_random_uuid(), title text, slug text unique, status text,
  scheduled_at timestamptz, updated_at timestamptz not null default now());
create table newsletter_subscribers(id uuid primary key default gen_random_uuid(), email text, status text,
  created_at timestamptz not null default now());
create table newsletter_sends(id uuid primary key default gen_random_uuid(), week_key text unique, status text,
  recipient_count int not null default 0, sent_count int not null default 0, created_at timestamptz not null default now());
create table offers(id uuid primary key default gen_random_uuid(), status text, show_in_shop boolean,
  funnel_only boolean, kind text, checkout_mode text);
create table offer_orders(id uuid primary key default gen_random_uuid(), status text, amount_minor int);
create table conversion_order_facts(order_id uuid primary key, payment_mode text);
create table offer_access_deliveries(id uuid primary key default gen_random_uuid(), status text,
  created_at timestamptz not null default now());
create table content_opportunities(id uuid primary key default gen_random_uuid(), status text, last_error text,
  updated_at timestamptz not null default now());
create table content_schemas(id uuid primary key default gen_random_uuid(), name text, slug text);
create table niches(id uuid primary key default gen_random_uuid(), name text);
create table generated_pages(id uuid primary key default gen_random_uuid(), title text, slug text, status text,
  performance_trend text, views int default 0, content_schema_id uuid, niche_id uuid);
create table page_engagement(id uuid primary key default gen_random_uuid(),
  page_id uuid references generated_pages(id) on delete cascade, event_type text, created_at timestamptz not null default now());
create table cta_events(id uuid primary key default gen_random_uuid(), page_id uuid, event_type text,
  created_at timestamptz not null default now());
create table gsc_performance(id uuid primary key default gen_random_uuid(), page_url text, query text, clicks int,
  impressions int, ctr numeric, position numeric, period_start date, period_end date, fetched_at timestamptz);
create table generation_jobs(id uuid primary key default gen_random_uuid(), status text, total_combinations int,
  completed_count int, success_count int, failed_count int, skipped_count int, error_message text,
  updated_at timestamptz not null default now());
create table indexing_log(id uuid primary key default gen_random_uuid(), page_url text, status text, method text,
  submitted_at timestamptz);
`;

async function database({ holdColumns }) {
  const db = new PGlite();
  await db.exec(BASE_SCHEMA);
  if (holdColumns)
    await db.exec(`alter table posts add column held_reason text, add column held_at timestamptz,
      add column contradicted_count int not null default 0;`);
  await db.exec(MIGRATION);
  // Re-running must be harmless.
  await db.exec(MIGRATION);
  return db;
}
const asAdmin = (db, on) => db.exec(`set test.admin = '${on ? "on" : "off"}'`);
const snapshot = async (db) =>
  (await db.query("select public.admin_overview_snapshot() d")).rows[0].d;
const keys = (items) => items.map((item) => item.key);

// ---------------------------------------------------------------------------
const db = await database({ holdColumns: true });

// ---- Access control --------------------------------------------------------
await asAdmin(db, false);
await assert.rejects(
  db.query("select public.admin_overview_snapshot()"),
  (error) => error.code === "42501",
  "non-admins are refused with insufficient_privilege",
);
await assert.rejects(
  db.query("select public.admin_performance_snapshot(30)"),
  (error) => error.code === "42501",
);
await assert.rejects(
  db.query("select public.admin_content_breakdown()"),
  (error) => error.code === "42501",
);
await assert.rejects(
  db.query("select * from public.admin_page_view_counts()"),
  (error) => error.code === "42501",
);
for (const fn of [
  "admin_overview_snapshot()",
  "admin_performance_snapshot(integer)",
  "admin_content_breakdown()",
  "admin_page_view_counts()",
]) {
  const privileges = (
    await db.query(
      `select has_function_privilege('anon', 'public.${fn}', 'execute') anon,
              has_function_privilege('authenticated', 'public.${fn}', 'execute') auth,
              has_function_privilege('public', 'public.${fn}', 'execute') everyone`,
    )
  ).rows[0];
  assert.deepEqual(
    privileges,
    { anon: false, auth: true, everyone: false },
    `${fn} is admin-only`,
  );
  const config = (
    await db.query(
      `select p.prosecdef, p.proconfig from pg_proc p where p.oid = 'public.${fn}'::regprocedure`,
    )
  ).rows[0];
  assert.equal(config.prosecdef, true, `${fn} is security definer`);
  assert.ok(
    config.proconfig.some((setting) => setting.startsWith("search_path=")),
    `${fn} pins search_path`,
  );
}
await asAdmin(db, true);

// ---- Empty site: every number is zero and nothing needs attention ----------
{
  const empty = await snapshot(db);
  assert.equal(empty.counts.published, 0);
  assert.equal(empty.counts.paid_orders, 0);
  assert.deepEqual(empty.recent_posts, []);
  assert.deepEqual(empty.attention, [], "a quiet site has no attention items");
  assert.ok(Date.parse(empty.generated_at) > 0);
}

// ---- Production-shaped fixture ---------------------------------------------
await db.exec(`
insert into speaking_inquiries(status) values ('new'),('new'),('replied');
insert into posts(title,slug,status,scheduled_at,updated_at) values
  ('Live one','live-one','published',null,now()-interval '5 days'),
  ('Live two','live-two','published',null,now()-interval '4 days'),
  ('Live three','live-three','published',null,now()-interval '3 days'),
  ('Draft one','draft-one','draft',null,now()-interval '2 days'),
  ('Draft two','draft-two','draft',null,now()-interval '1 day'),
  ('Future','future','scheduled',now()+interval '1 day',now()-interval '6 hours'),
  ('Overdue','overdue','scheduled',now()-interval '1 day',now()-interval '1 hour');
update posts set held_reason='Quality score 62, needs 85', held_at=now()-interval '1 hour' where slug='overdue';
update posts set contradicted_count=2 where slug in ('live-one','live-two');
update posts set contradicted_count=1 where slug='draft-one';
insert into newsletter_subscribers(email,status,created_at) values
  ('owner@example.com','confirmed',now()-interval '60 days'),
  ('a@example.com','pending',now()-interval '30 days'),
  ('b@example.com','pending',now()-interval '3 days'),
  ('fresh@example.com','pending',now()-interval '2 hours'),
  ('gone@example.com','unsubscribed',now()-interval '90 days');
insert into newsletter_sends(week_key,status,recipient_count,sent_count) values
  ('2026-W38','sent',1,0),('2026-W39','needs_review',1,0),('2026-W40','preview',0,0);
insert into offers(status,show_in_shop,funnel_only,kind,checkout_mode) values
  ('published',true,false,'free','native'),('published',true,true,'free','native'),
  ('published',false,false,'paid','native'),('draft',true,false,'paid','native'),
  ('published',true,false,'paid','external');
insert into content_opportunities(status,last_error,updated_at) values
  ('proposed','AI credits ran out. Add credits in Lovable, then run again',now()-interval '2 hours'),
  ('proposed','Not drafted: AI credits ran out earlier in this run',now()-interval '2 hours'),
  ('drafting','timeout',now()),
  ('proposed','AI credits ran out. Add credits in Lovable, then run again',now()-interval '20 days'),
  ('rejected','draft failed',now()),
  ('proposed',null,now());
insert into generated_pages(title,slug,status,performance_trend) values
  ('Stale one','stale-one','published','needs_refresh'),('Draft page','draft-page','draft','needs_refresh');
insert into offer_access_deliveries(status,created_at) values
  ('pending',now()-interval '3 days'),('pending',now()-interval '5 minutes'),
  ('needs_review',now()-interval '2 days'),('failed',now()-interval '2 days'),('sent',now()-interval '2 days');
insert into indexing_log(page_url,status,method,submitted_at) values
  ('https://example.com/','submitted','sitemap_ping',now()-interval '70 days');
`);
// Orders: live paid, test paid, paid without a facts row, unknown-mode paid,
// free claims, and unfulfilled rows that never count.
const order = async (status, amount, mode) => {
  const id = (
    await db.query(
      "insert into offer_orders(status,amount_minor) values($1,$2) returning id",
      [status, amount],
    )
  ).rows[0].id;
  if (mode)
    await db.query(
      "insert into conversion_order_facts(order_id,payment_mode) values($1,$2)",
      [id, mode],
    );
};
await order("fulfilled", 4900, "live");
await order("fulfilled", 9900, "live");
await order("fulfilled", 4900, "test");
await order("fulfilled", 4900, null);
await order("fulfilled", 4900, "unknown");
await order("fulfilled", 0, "unknown");
await order("fulfilled", 0, null);
await order("pending", 4900, "live");
await order("refunded", 4900, "live");

const snap = await snapshot(db);

// ---- 1. Cards use exactly today's predicates --------------------------------
const legacy = (
  await db.query(`select
    (select count(*)::int from speaking_inquiries where status='new') inquiries,
    (select count(*)::int from posts where status='published') published,
    (select count(*)::int from posts where status='draft') drafts,
    (select count(*)::int from posts where status='scheduled') scheduled,
    (select count(*)::int from posts where status='scheduled' and scheduled_at < now()) overdue,
    (select count(*)::int from newsletter_subscribers where status='confirmed') subscribers,
    (select count(*)::int from offers where status='published' and show_in_shop and not funnel_only) shop,
    (select count(*)::int from offer_orders where status='fulfilled' and amount_minor=0) free_claims,
    (select count(*)::int from offers where status='published' and kind='paid' and checkout_mode='native') native_paid_offers,
    (select count(*)::int from content_opportunities where status in ('proposed','drafting') and last_error is not null) queue_errors,
    (select count(*)::int from generated_pages where performance_trend='needs_refresh' and status='published') stale_pages`)
).rows[0];
for (const [key, value] of Object.entries(legacy))
  assert.equal(snap.counts[key], value, `${key} matches the old count query`);
assert.deepEqual(
  {
    inquiries: snap.counts.inquiries,
    published: snap.counts.published,
    drafts: snap.counts.drafts,
    scheduled: snap.counts.scheduled,
    overdue: snap.counts.overdue,
    subscribers: snap.counts.subscribers,
    shop: snap.counts.shop,
    queue_errors: snap.counts.queue_errors,
  },
  {
    inquiries: 2,
    published: 3,
    drafts: 2,
    scheduled: 2,
    overdue: 1,
    subscribers: 1,
    shop: 2,
    queue_errors: 4,
  },
);
assert.equal(snap.counts.pending_subscribers, 3);

// ---- 2. Live vs test orders -------------------------------------------------
assert.equal(snap.counts.paid_orders, 2, "only live-mode payments count");
assert.equal(
  snap.counts.test_paid_orders,
  1,
  "Stripe test purchases split out",
);
assert.equal(
  snap.counts.unknown_paid_orders,
  2,
  "paid orders with no or unknown mode are neither live nor test",
);
assert.equal(snap.counts.free_claims, 2, "free claims ignore payment mode");

// ---- 3. Recent posts replace the separate request ---------------------------
assert.deepEqual(
  snap.recent_posts.map((post) => post.title),
  ["Overdue", "Future", "Draft two", "Draft one", "Live three"],
);
assert.deepEqual(Object.keys(snap.recent_posts[0]).sort(), [
  "id",
  "status",
  "title",
  "updated_at",
]);

// ---- 4. Attention list --------------------------------------------------------
const byKey = Object.fromEntries(
  snap.attention.map((item) => [item.key, item]),
);
for (const item of snap.attention) {
  assert.ok(["high", "medium", "low"].includes(item.severity), item.key);
  assert.equal(typeof item.message, "string");
  assert.ok(item.message.length > 10, `${item.key} has a plain message`);
  assert.match(item.link, /^\/admin/, `${item.key} links to an admin page`);
  assert.equal(typeof item.count, "number");
}
const severities = snap.attention.map((item) => item.severity);
assert.deepEqual(
  severities,
  [...severities].sort(
    (a, b) =>
      ["high", "medium", "low"].indexOf(a) -
      ["high", "medium", "low"].indexOf(b),
  ),
  "most urgent first",
);

assert.equal(byKey.newsletter_delivery.severity, "high");
assert.match(byKey.newsletter_delivery.message, /2026-W39/);
assert.match(byKey.newsletter_delivery.message, /0 of 1/);
assert.equal(byKey.newsletter_delivery.link, "/admin#newsletter");

assert.equal(
  byKey.pending_subscribers.count,
  2,
  "only signups older than a day",
);
assert.match(byKey.pending_subscribers.message, /2 newsletter signups/);
assert.equal(byKey.pending_subscribers.link, "/admin/audience");

assert.equal(byKey.access_email_failed.count, 2);
assert.equal(byKey.access_email_failed.severity, "high");
assert.equal(byKey.access_email_failed.link, "/admin/offers?tab=setup");
assert.equal(
  byKey.access_email_waiting.count,
  1,
  "fresh deliveries are not stuck",
);

assert.equal(byKey.indexnow_idle.severity, "medium");
assert.equal(byKey.indexnow_idle.link, "/admin/site-settings");

assert.equal(byKey.posts_held.count, 1);
assert.match(byKey.posts_held.detail, /Overdue/);
assert.match(byKey.posts_held.detail, /Quality score 62/);
const overdueId = (await db.query("select id from posts where slug='overdue'"))
  .rows[0].id;
assert.equal(byKey.posts_held.link, `/admin/posts/${overdueId}/edit`);

assert.equal(byKey.contradicted_live.count, 2, "drafts are not live");
assert.equal(byKey.contradicted_live.severity, "high");

assert.equal(byKey.ai_credits.count, 2, "only recent credit stops");
assert.equal(byKey.ai_credits.link, "/admin/queue");
assert.equal(
  byKey.pipeline_errors.count,
  2,
  "credit stops are not double-counted as pipeline errors",
);

assert.equal(byKey.speaking_inquiries.count, 2);
assert.equal(byKey.overdue_scheduled.count, 1);
assert.equal(byKey.drafts.count, 2);
assert.equal(byKey.drafts.severity, "low");

// ---- 5. Healthy states clear their items ------------------------------------
await db.exec(`
update newsletter_sends set status='sent', sent_count=1 where week_key='2026-W39';
insert into indexing_log(page_url,status,method,submitted_at)
  values ('https://example.com/blog/live-one','indexnow_submitted','indexnow',now()-interval '1 day');
update offer_access_deliveries set status='sent';
update newsletter_subscribers set status='confirmed';
update posts set held_reason=null, held_at=null, contradicted_count=0;
update content_opportunities set last_error=null;
`);
{
  const healthy = await snapshot(db);
  const healthyKeys = keys(healthy.attention);
  for (const key of [
    "newsletter_delivery",
    "pending_subscribers",
    "access_email_failed",
    "access_email_waiting",
    "indexnow_idle",
    "posts_held",
    "contradicted_live",
    "ai_credits",
    "pipeline_errors",
  ])
    assert.ok(!healthyKeys.includes(key), `${key} cleared`);
}
// A partial delivery on the latest sent week is still flagged.
await db.exec(`insert into newsletter_sends(week_key,status,recipient_count,sent_count)
  values ('2026-W41','sent',4,3);`);
{
  const partial = (await snapshot(db)).attention.find(
    (item) => item.key === "newsletter_delivery",
  );
  assert.match(partial.message, /3 of 4/);
}
// A failed week with a recorded provider error explains why.
await db.exec(`alter table newsletter_sends add column last_error text;
insert into newsletter_sends(week_key,status,recipient_count,sent_count,last_error)
  values ('2026-W42','failed',2,0,'Provider returned HTTP 403');`);
{
  const failed = (await snapshot(db)).attention.find(
    (item) => item.key === "newsletter_delivery",
  );
  assert.match(failed.message, /reached nobody/);
  assert.match(failed.detail, /HTTP 403/);
}

// ---- 6. Resource views come from page_engagement -----------------------------
await db.exec(`
delete from generated_pages;
insert into content_schemas(id,name,slug) values
  ('20000000-0000-4000-8000-000000000001','Listicle','listicles'),
  ('20000000-0000-4000-8000-000000000002','Guide','guides');
insert into niches(id,name) values ('30000000-0000-4000-8000-000000000001','Solo founders');
insert into generated_pages(id,title,slug,status,content_schema_id,niche_id,views) values
  ('10000000-0000-4000-8000-000000000001','Popular','popular','published','20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001',0),
  ('10000000-0000-4000-8000-000000000002','Quiet','quiet','published','20000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000001',999),
  ('10000000-0000-4000-8000-000000000003','Unpublished','unpublished','draft','20000000-0000-4000-8000-000000000001',null,0);
insert into page_engagement(page_id,event_type,created_at)
  select '10000000-0000-4000-8000-000000000001','view',now()-make_interval(days=>g%40) from generate_series(1,17) g;
insert into page_engagement(page_id,event_type) values
  ('10000000-0000-4000-8000-000000000002','view'),
  ('10000000-0000-4000-8000-000000000001','scroll'),
  ('10000000-0000-4000-8000-000000000003','view'),('10000000-0000-4000-8000-000000000003','view');
insert into gsc_performance(page_url,query,clicks,impressions,ctr,position,period_start,period_end,fetched_at) values
  ('https://example.com/','brian hanson',20,1000,0.02,1.2,'2026-08-24','2026-09-20',now()),
  ('https://example.com/blog/live-one','ai tools',1,60,0.016,8,'2026-08-24','2026-09-20',now()),
  ('https://example.com/blog/live-one','ai tool list',0,40,0,12,'2026-08-24','2026-09-20',now()),
  ('https://example.com/blog/live-two?utm=x','agents',1,30,0.03,9,'2026-08-24','2026-09-20',now()),
  ('https://example.com/blog/missing-post#faq','old',0,5,0,30,'2026-08-24','2026-09-20',now()),
  ('https://example.com/resources/listicles/popular','lists',0,20,0,15,'2026-08-24','2026-09-20',now()),
  ('https://example.com/blog/live-one','ai tools',9,900,0.01,5,'2026-08-17','2026-09-13',now()-interval '7 days');
`);
const perf = (await db.query("select public.admin_performance_snapshot(30) d"))
  .rows[0].d;
assert.equal(perf.published_resources, 2);
assert.equal(
  perf.resource_views_all_time,
  18,
  "view events on published resources, not the dead views column",
);
assert.deepEqual(
  perf.top_pages.map((page) => [page.title, page.views]),
  [
    ["Popular", 17],
    ["Quiet", 1],
  ],
);
assert.equal(perf.published_articles, 3, "articles are part of the headline");
assert.equal(perf.search.impressions, 1155, "latest period only");
const sections = Object.fromEntries(
  perf.search.sections.map((section) => [section.section, section]),
);
assert.deepEqual(sections.articles, {
  section: "articles",
  pages: 3,
  clicks: 2,
  impressions: 135,
});
assert.equal(sections.resources.impressions, 20);
assert.equal(sections.other.impressions, 1000);
assert.deepEqual(
  perf.top_articles.map((row) => [row.title, row.impressions, row.clicks]),
  [
    ["Live one", 100, 1],
    ["Live two", 30, 1],
    ["/blog/missing-post", 5, 0],
  ],
);
assert.equal(perf.top_articles[0].path, "/blog/live-one");
assert.equal(perf.top_articles[0].position, 9.6, "impression-weighted");
for (const days of [7, 90])
  assert.ok(
    (await db.query("select public.admin_performance_snapshot($1) d", [days]))
      .rows[0].d,
  );
await assert.rejects(db.query("select public.admin_performance_snapshot(14)"));

const breakdown = (await db.query("select public.admin_content_breakdown() d"))
  .rows[0].d;
assert.deepEqual(
  breakdown.formats.map((row) => [row.name, row.pages, row.views]),
  [
    ["Listicle", 1, 17],
    ["Guide", 1, 1],
  ],
);
assert.deepEqual(
  breakdown.niches.map((row) => [row.name, row.pages, row.views, row.clicks]),
  [["Solo founders", 2, 18, 0]],
);
const perPage = Object.fromEntries(
  (await db.query("select * from public.admin_page_view_counts()")).rows.map(
    (row) => [row.page_id, Number(row.views)],
  ),
);
assert.deepEqual(perPage, {
  "10000000-0000-4000-8000-000000000001": 17,
  "10000000-0000-4000-8000-000000000002": 1,
  "10000000-0000-4000-8000-000000000003": 2,
});
assert.ok(
  (
    await db.query(
      "select 1 from pg_indexes where indexname='page_engagement_page_event_idx'",
    )
  ).rows.length,
  "view counts are indexed",
);

// ---- 7. Applies before 20260923130000 (no hold columns yet) -----------------
const early = await database({ holdColumns: false });
await asAdmin(early, true);
await early.exec(
  `insert into posts(title,slug,status) values ('Live','live','published');`,
);
const earlySnap = await snapshot(early);
assert.equal(earlySnap.counts.published, 1);
assert.equal(earlySnap.counts.held_posts, null, "unknown, not zero");
assert.equal(earlySnap.counts.contradicted_live_posts, null);
assert.ok(
  !keys(earlySnap.attention).includes("posts_held"),
  "hold item skipped until its columns exist",
);

console.log("admin overview database tests passed");
