import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

// Applies the public column-grant migration and then
// 20260923130000_post_hold_reasons.sql to a posts table shaped like production,
// and proves: new columns + generated contradicted_count + indexes, anon cannot
// read any new column, admins can, publish clears holds, overrides need an
// actor/time/reason, and the override audit table is admin-read-only.
const ADMIN = "00000000-0000-0000-0000-000000000001";
const MEMBER = "00000000-0000-0000-0000-000000000002";
const HOLD_MIGRATION = readFileSync(
  "supabase/migrations/20260923130000_post_hold_reasons.sql",
  "utf8",
);
const GRANTS_MIGRATION = readFileSync(
  "supabase/migrations/20260923111000_public_column_grants.sql",
  "utf8",
);
const denied = /permission denied/;

const BASE = `create role anon;create role authenticated;create role service_role bypassrls;create schema auth;
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
create function public.is_admin(uuid) returns boolean language sql stable as $$select $1='${ADMIN}'::uuid$$;
grant usage on schema public,auth to anon,authenticated,service_role;
create function public.update_updated_at_column() returns trigger language plpgsql as $$begin new.updated_at=now(); return new; end$$;
create table public.categories(id uuid primary key default gen_random_uuid(),name text,slug text);
create table public.generated_pages(id uuid primary key default gen_random_uuid(),niche_id uuid,content_schema_id uuid,slug text,title text,content_json jsonb,seo_meta jsonb,status text,published_at timestamptz,last_refreshed timestamptz,created_at timestamptz default now(),updated_at timestamptz default now());
create table public.posts(
  id uuid primary key default gen_random_uuid(), title text, slug text, content text, excerpt text,
  status text default 'draft', category_id uuid references public.categories(id), featured_image text, reading_time integer,
  scheduled_at timestamptz, tldr text, key_takeaways jsonb, faq_items jsonb,
  created_at timestamptz default now(), updated_at timestamptz default now(),
  lint_flags jsonb, quality_score numeric, publish_override boolean default false, publish_override_reason text,
  publish_override_at timestamptz, publish_override_by uuid, featured_image_alt text, opportunity_id uuid,
  source_citations jsonb, originality_score integer, freshness_hours integer, performance_grade text,
  embedding text, fact_check jsonb, fact_checked_at timestamptz, published_at timestamptz,
  draft_claim_token uuid, auto_scheduled_at timestamptz, editorial_metadata jsonb);
create table public.seo_metadata(id uuid primary key default gen_random_uuid(),post_id uuid references public.posts(id) on delete cascade,meta_title text,meta_description text,keywords text[],og_image text,created_at timestamptz default now(),updated_at timestamptz default now());
create trigger update_posts_updated_at before update on public.posts for each row execute function public.update_updated_at_column();
-- Supabase default privileges: everything to anon and authenticated.
grant all on public.categories,public.posts,public.generated_pages,public.seo_metadata to anon,authenticated,service_role;
alter default privileges in schema public grant all on tables to anon,authenticated,service_role;
alter table public.posts enable row level security;
create policy "Anyone can read published posts" on public.posts for select using ((status = 'published') or is_admin(auth.uid()));
create policy "Admins can update posts" on public.posts for update to authenticated using (is_admin(auth.uid()));
create policy "Admins can insert posts" on public.posts for insert to authenticated with check (is_admin(auth.uid()));
create table public.content_opportunities(id uuid primary key default gen_random_uuid(),status text default 'proposed',attempts int default 0,last_attempt_at timestamptz,opportunity_score int default 1);
create table public.site_settings_private(auto_publish_enabled boolean,auto_publish_min_quality int,auto_publish_daily_cap int);
insert into public.site_settings_private values(true,85,3);
create function public.content_claim_opportunities(integer,integer,integer,integer) returns void language sql as $$select$$;`;
const PIPELINE_MIGRATION = readFileSync(
  "supabase/migrations/20260917072000_pipeline_claim_ownership.sql",
  "utf8",
);

// ---- Guard: refuses to add private columns while anon still has table SELECT.
{
  const bare = new PGlite();
  await bare.exec(BASE);
  await bare.exec(PIPELINE_MIGRATION);
  await assert.rejects(
    bare.exec(HOLD_MIGRATION),
    /public_column_grants/,
    "migration must refuse to run before anon loses table-level SELECT",
  );
  await bare.close();
}

const db = new PGlite();
await db.exec(BASE);
await db.exec(`
insert into public.posts(id,title,slug,status,fact_check,publish_override,publish_override_reason) values
 ('40000000-0000-0000-0000-000000000001','Live with flags','live','published',
  '{"claims":[{"verdict":"contradicted"},{"verdict":"verified"},{"verdict":"contradicted"},"odd"],"contradicted_count":2}',
  true,'Bulk publish all drafts from admin UI'),
 ('40000000-0000-0000-0000-000000000002','Draft','draft','draft',null,false,null),
 ('40000000-0000-0000-0000-000000000003','Weird','weird','draft','{"claims":{"verdict":"contradicted"}}',false,null),
 ('40000000-0000-0000-0000-000000000004','Scalar','scalar','draft','"not an object"',false,null);`);
await db.exec(PIPELINE_MIGRATION);
await db.exec(GRANTS_MIGRATION);
await db.exec(HOLD_MIGRATION);
const q = async (sql, params = []) => (await db.query(sql, params)).rows;
const P1 = "40000000-0000-0000-0000-000000000001";
const P2 = "40000000-0000-0000-0000-000000000002";

// ---- Columns ---------------------------------------------------------------
const cols = Object.fromEntries(
  (
    await q(`select column_name, data_type, is_nullable, is_generated from information_schema.columns
             where table_schema='public' and table_name='posts'
               and column_name in ('held_reason','held_at','contradicted_count','schedule_checked_at','schedule_checked_by')`)
  ).map((r) => [r.column_name, r]),
);
assert.equal(cols.held_reason.data_type, "text");
assert.equal(cols.held_reason.is_nullable, "YES");
assert.equal(cols.held_at.data_type, "timestamp with time zone");
assert.equal(cols.held_at.is_nullable, "YES");
assert.equal(cols.schedule_checked_at.data_type, "timestamp with time zone");
assert.equal(cols.schedule_checked_by.data_type, "uuid");
assert.equal(cols.contradicted_count.data_type, "integer");
assert.equal(cols.contradicted_count.is_generated, "ALWAYS");

// ---- contradicted_count is computed from claim verdicts ----------------------
const counts = Object.fromEntries(
  (await q("select slug, contradicted_count from public.posts")).map((r) => [
    r.slug,
    r.contradicted_count,
  ]),
);
assert.deepEqual(counts, { live: 2, draft: 0, weird: 1, scalar: 0 });
await q(
  `update public.posts set fact_check='{"claims":[{"verdict":"contradicted"}]}' where id=$1`,
  [P2],
);
assert.equal(
  (await q("select contradicted_count from public.posts where id=$1", [P2]))[0]
    .contradicted_count,
  1,
  "recomputed when fact_check changes",
);
await assert.rejects(
  q("update public.posts set contradicted_count=0 where id=$1", [P2]),
  /can only be updated to DEFAULT/,
  "contradicted_count cannot be written directly",
);
const indexes = (
  await q("select indexname, indexdef from pg_indexes where tablename='posts'")
).map((r) => r.indexname);
for (const name of [
  "posts_contradicted_count_idx",
  "posts_held_idx",
  "posts_auto_scheduled_at_idx",
])
  assert.ok(indexes.includes(name), `index ${name} exists`);

// ---- held_reason / held_at pairing -----------------------------------------
await assert.rejects(
  q("update public.posts set held_reason='x' where id=$1", [P2]),
  /posts_held_pair/,
  "a hold always records when it started",
);
await q(
  "update public.posts set status='scheduled', held_reason='Daily limit of 3 reached, will retry automatically', held_at=now(), schedule_checked_at=now(), schedule_checked_by=$2 where id=$1",
  [P2, ADMIN],
);

// ---- Publishing clears the hold and stamps published_at ---------------------
await q("update public.posts set status='published' where id=$1", [P2]);
const cleared = (
  await q(
    "select held_reason, held_at, published_at, schedule_checked_at from public.posts where id=$1",
    [P2],
  )
)[0];
assert.equal(cleared.held_reason, null);
assert.equal(cleared.held_at, null);
assert.ok(cleared.published_at, "published_at is always set on publish");
assert.equal(
  cleared.schedule_checked_at,
  null,
  "leaving 'scheduled' clears the check stamp",
);

// ---- Override audit rules on posts ------------------------------------------
await assert.rejects(
  q(
    "update public.posts set publish_override=true, publish_override_reason='Bulk publish all drafts' where status='draft'",
  ),
  /publish override/i,
  "a bulk SQL override without an actor is refused",
);
await q(
  "insert into public.posts(id,title,slug,status) values ('40000000-0000-0000-0000-000000000009','New','new','draft')",
);
const P9 = "40000000-0000-0000-0000-000000000009";
await assert.rejects(
  q(
    "update public.posts set publish_override=true, publish_override_reason='too short', publish_override_by=$2, publish_override_at=now() where id=$1",
    [P9, ADMIN],
  ),
  /publish override/i,
  "reason must be at least 10 characters",
);
await q(
  "update public.posts set status='published', publish_override=true, publish_override_reason='Checked every claim by hand', publish_override_by=$2, publish_override_at=now() where id=$1",
  [P9, ADMIN],
);
// Legacy overridden rows (actor NULL) stay editable when the override is untouched.
await q("update public.posts set title='Live, renamed' where id=$1", [P1]);

// ---- post_publish_overrides audit table -------------------------------------
await q(
  `insert into public.post_publish_overrides(post_id, mode, reason, failures, overridden_by)
   values ($1,'publish','Checked every claim by hand','["Not fact-checked yet"]',$2)`,
  [P9, ADMIN],
);
await assert.rejects(
  q(
    "insert into public.post_publish_overrides(post_id, mode, reason, overridden_by) values ($1,'publish','short',$2)",
    [P9, ADMIN],
  ),
  /check/,
);
await assert.rejects(
  q(
    "insert into public.post_publish_overrides(post_id, mode, reason, overridden_by) values ($1,'bulk','Checked every claim by hand',$2)",
    [P9, ADMIN],
  ),
  /check/,
);

// ---- Auto-publish slots ignore hand-scheduled posts --------------------------
await q(
  "insert into public.posts(id,title,slug,status,scheduled_at) values ('40000000-0000-0000-0000-000000000010','Hand','hand','scheduled',now()+interval '30 days')",
);
const OPP = (
  await q(
    "insert into public.content_opportunities default values returning id",
  )
)[0].id;
await q(
  `insert into public.posts(id,title,slug,status,opportunity_id,quality_score,lint_flags,fact_check) values
   ('40000000-0000-0000-0000-000000000011','Auto','auto','draft',$1,92,'[]','{"claims":[{},{}],"verified_count":2,"unverified_count":0,"contradicted_count":0}')`,
  [OPP],
);
const slot = (
  await q(
    "select content_schedule_checked('40000000-0000-0000-0000-000000000011') as r",
  )
)[0].r;
assert.equal(slot.decision, "scheduled");
assert.ok(
  Date.parse(slot.scheduled_at) - Date.now() < 2 * 3600_000,
  "auto slot is within hours, not after the hand-scheduled post next month",
);

// ---- anon ---------------------------------------------------------------------
await db.exec("reset role; set test.uid=''; set role anon");
assert.equal(
  (await q("select id, title from public.posts")).length,
  3,
  "anon still reads public columns of published posts",
);
for (const column of [
  "held_reason",
  "held_at",
  "contradicted_count",
  "schedule_checked_at",
  "schedule_checked_by",
]) {
  await assert.rejects(
    q(`select ${column} from public.posts`),
    denied,
    `anon must not read posts.${column}`,
  );
}
await assert.rejects(
  q("select id from public.posts where contradicted_count > 0"),
  denied,
  "anon cannot filter on contradicted_count either",
);
await assert.rejects(
  q("select * from public.post_publish_overrides"),
  denied,
  "anon cannot read the override audit",
);

// ---- authenticated admin --------------------------------------------------------
await db.exec(`reset role; set test.uid='${ADMIN}'; set role authenticated`);
const flagged = await q(
  "select slug, contradicted_count, held_reason, held_at from public.posts where status='published' and contradicted_count > 0 order by slug",
);
assert.deepEqual(
  flagged.map((r) => r.slug),
  ["draft", "live"],
);
await q(
  "update public.posts set held_reason='Not fact-checked yet', held_at=now() where slug='weird'",
);
assert.equal(
  (await q("select held_reason from public.posts where slug='weird'"))[0]
    .held_reason,
  "Not fact-checked yet",
);
assert.equal(
  (await q("select reason from public.post_publish_overrides")).length,
  1,
  "admins read the override audit",
);
await assert.rejects(
  q("delete from public.post_publish_overrides"),
  denied,
  "the audit is append-only for app users",
);
await assert.rejects(
  q(
    "insert into public.post_publish_overrides(post_id, mode, reason, overridden_by) values ($1,'publish','Checked every claim by hand',$2)",
    [P9, ADMIN],
  ),
  denied,
  "only manual-publish (service role) writes audit rows",
);

// ---- authenticated non-admin ------------------------------------------------------
await db.exec(`reset role; set test.uid='${MEMBER}'; set role authenticated`);
assert.equal(
  (await q("select * from public.post_publish_overrides")).length,
  0,
  "non-admins see no audit rows",
);

// ---- service role -------------------------------------------------------------------
await db.exec("reset role; set role service_role");
assert.equal(
  (await q("select count(*)::int as n from public.post_publish_overrides"))[0]
    .n,
  1,
);

console.log(
  "PASS: hold columns + generated contradicted_count + indexes, anon denied on new columns, publish clears holds, overrides need actor/time/reason, append-only admin-read audit",
);
await db.close();
