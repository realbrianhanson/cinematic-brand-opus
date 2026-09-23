import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import assert from "node:assert/strict";

// Regression: the retired cta_events table accepts no browser writes, and
// page_engagement only accepts bounded events for published pages.
const db = new PGlite();
const owner = "00000000-0000-0000-0000-000000000001";
const member = "00000000-0000-0000-0000-000000000002";
const published = "10000000-0000-0000-0000-000000000001";
const draft = "10000000-0000-0000-0000-000000000002";
await db.exec(`create role anon; create role authenticated; create schema auth;
create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
create function public.is_admin(uuid) returns boolean language sql as $$select $1='${owner}'::uuid$$;
grant usage on schema public,auth to anon,authenticated;
create table public.generated_pages(id uuid primary key, status text);
alter table public.generated_pages enable row level security;
create policy "Anyone can read published generated_pages" on public.generated_pages for select to public using ((status = 'published') or is_admin(auth.uid()));
grant select (id, status) on public.generated_pages to anon, authenticated;
insert into public.generated_pages values ('${published}','published'),('${draft}','draft');
create table public.cta_events(id uuid primary key default gen_random_uuid(), page_id uuid, page_type text, cta_variant text, event_type text, niche_slug text, content_type_slug text, created_at timestamptz default now());
alter table public.cta_events enable row level security;
create policy "Anyone can insert cta_events" on public.cta_events for insert to anon, authenticated with check (event_type is not null and page_type is not null);
create policy "Admins can read cta_events" on public.cta_events for select to authenticated using (is_admin(auth.uid()));
create table public.page_engagement(id uuid primary key default gen_random_uuid(), page_id uuid references public.generated_pages(id) on delete cascade, event_type text not null, metadata jsonb default '{}', created_at timestamptz default now());
alter table public.page_engagement enable row level security;
create policy "Anyone can insert page_engagement" on public.page_engagement for insert to anon, authenticated with check (event_type is not null and page_id is not null);
create policy "Admins can read page_engagement" on public.page_engagement for select to authenticated using (is_admin(auth.uid()));
grant all on public.cta_events, public.page_engagement to anon, authenticated;
insert into public.cta_events(page_type, event_type) values ('resource','click');
insert into public.page_engagement(page_id, event_type, metadata) values ('${published}','legacy_junk', jsonb_build_object('blob', repeat('x', 4000)));
`);

const migration = readFileSync(
  "supabase/migrations/20260923112000_lock_legacy_analytics.sql",
  "utf8",
);
await db.exec(migration);
// Re-running must be safe.
await db.exec(migration);

// Every event type the site writes must stay accepted.
const sources = [
  "src/pages/GeneratedPage.tsx",
  ...readdirSync("src/components/renderers")
    .filter((f) => f.endsWith(".tsx"))
    .map((f) => `src/components/renderers/${f}`),
];
const written = new Set();
for (const file of sources) {
  const text = readFileSync(file, "utf8");
  for (const m of text.matchAll(
    /(?:event_type:\s*|logEvent\(|logEngagement\()"([a-z_]+)"/g,
  ))
    written.add(m[1]);
}
assert.ok(written.size >= 6, `found writers: ${[...written]}`);

const insert = (event, meta = {}, page = published) =>
  db.query(
    "insert into public.page_engagement(page_id, event_type, metadata) values ($1,$2,$3)",
    [page, event, meta],
  );

for (const role of ["anon", "authenticated"]) {
  await db.exec(
    `reset role; set test.uid='${role === "anon" ? "" : member}'; set role ${role}`,
  );
  // Retired table: no writes of any kind.
  await assert.rejects(
    db.query(
      "insert into public.cta_events(page_type, event_type) values ('x','click')",
    ),
    /permission denied/,
  );
  await assert.rejects(
    db.query("delete from public.cta_events"),
    /permission denied/,
  );
  // Allowed events on a published page.
  for (const event of written) await insert(event, { filter: "category" });
  // Bounded content.
  await assert.rejects(insert("drop_table"), /page_engagement_event_type_chk/);
  await assert.rejects(
    insert("view", { blob: "x".repeat(2000) }),
    /page_engagement_metadata_size_chk/,
  );
  // Only published pages; page id required.
  await assert.rejects(insert("view", {}, draft), /row-level security/);
  await assert.rejects(insert("view", {}, null), /row-level security/);
  // Append-only.
  await assert.rejects(
    db.query("update public.page_engagement set event_type='view'"),
    /permission denied/,
  );
  await assert.rejects(
    db.query("delete from public.page_engagement"),
    /permission denied/,
  );
}

// Admin can still read history, including rows written before the constraints.
await db.exec(`reset role; set test.uid='${owner}'; set role authenticated`);
assert.equal(
  (await db.query("select count(*)::int as n from public.cta_events")).rows[0]
    .n,
  1,
);
const legacy = await db.query(
  "select count(*)::int as n from public.page_engagement where event_type='legacy_junk'",
);
assert.equal(legacy.rows[0].n, 1);

await db.exec("reset role");
const constraints = await db.query(
  "select conname, convalidated from pg_constraint where conrelid='public.page_engagement'::regclass and contype='c' order by conname",
);
assert.deepEqual(constraints.rows, [
  { conname: "page_engagement_event_type_chk", convalidated: false },
  { conname: "page_engagement_metadata_size_chk", convalidated: false },
]);
const policies = await db.query(
  "select tablename, policyname, cmd from pg_policies where tablename in ('cta_events','page_engagement') order by 1,2",
);
assert.deepEqual(policies.rows.map((r) => `${r.tablename}:${r.cmd}`).sort(), [
  "cta_events:SELECT",
  "page_engagement:INSERT",
  "page_engagement:SELECT",
]);
console.log(`legacy analytics lock: ok (${[...written].sort().join(", ")})`);
