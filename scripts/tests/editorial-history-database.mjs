import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const ADMIN = "00000000-0000-4000-8000-000000000001";
const MEMBER = "00000000-0000-4000-8000-000000000002";
const db = new PGlite();
await db.exec(`
create role anon; create role authenticated; create role service_role bypassrls;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
create function public.is_admin(id uuid) returns boolean language sql immutable as $$select id='${ADMIN}'::uuid$$;
create table generated_pages(id uuid primary key default gen_random_uuid(), title text, slug text, status text default 'draft', content_json jsonb, seo_meta jsonb, niche_id uuid, content_schema_id uuid, quality_score int, views int default 0, updated_at timestamptz default now());
create table pillar_pages(id uuid primary key default gen_random_uuid(), title text, slug text, status text default 'draft', content text, seo_meta jsonb, niche_id uuid, updated_at timestamptz default now(), published_at timestamptz);
create table pillar_publish_overrides(id uuid primary key default gen_random_uuid(), pillar_id uuid, reason text, issues text[], overridden_by uuid);
create function validate_test_guide() returns trigger language plpgsql as $$begin
  if NEW.status not in ('draft','published') then raise exception 'Invalid status'; end if;
  if NEW.status='published' and OLD.status<>'published' and length(NEW.content)<200 and coalesce(current_setting('app.pillar_publish_override',true),'')<>NEW.id::text then raise exception 'Guide quality gate'; end if;
  return NEW; end$$;
create trigger trg_validate_pillar_pages_status before update on pillar_pages for each row execute function validate_test_guide();
alter table generated_pages enable row level security; alter table pillar_pages enable row level security;
create policy admin_resource on generated_pages for all to authenticated using(is_admin(auth.uid())) with check(is_admin(auth.uid()));
create policy admin_guide on pillar_pages for all to authenticated using(is_admin(auth.uid())) with check(is_admin(auth.uid()));
grant usage on schema public,auth to authenticated,anon,service_role;
grant select,insert,update,delete on generated_pages,pillar_pages to authenticated,service_role;
`);
await db.exec(
  readFileSync(
    "supabase/migrations/20260925130000_editorial_history.sql",
    "utf8",
  ),
);
const one = async (sql, args = []) => (await db.query(sql, args)).rows[0];
const resource = await one(
  'insert into generated_pages(title,slug,content_json,seo_meta,quality_score) values(\'Original\',\'original\',\'{"intro":"Original body"}\',\'{"sources":["https://example.com/report"],"custom":{"keep":true}}\',82) returning *',
);
const guide = await one(
  "insert into pillar_pages(title,slug,content,seo_meta) values('Guide','guide','Short guide','{\"custom\":\"keep\"}') returning *",
);
await db.query(
  "update generated_pages set views=9,quality_score=90 where id=$1",
  [resource.id],
);
assert.equal(
  (await one("select count(*)::int n from generated_page_revisions")).n,
  0,
);

await db.exec(`set role authenticated; set test.uid='${ADMIN}';`);
await db.query(
  "update generated_pages set title='Edited',content_json='{\"intro\":\"New body\"}' where id=$1",
  [resource.id],
);
const revision = await one(
  "select * from generated_page_revisions where page_id=$1",
  [resource.id],
);
assert.equal(revision.snapshot.title, "Original");
assert.equal(revision.snapshot.quality_score, 90);
assert.deepEqual(revision.snapshot.seo_meta.custom, { keep: true });
assert.equal(revision.actor_id, ADMIN);
assert.equal(revision.change_source, "authenticated");
await assert.rejects(
  db.query("delete from generated_page_revisions where id=$1", [revision.id]),
  /permission denied/,
);
await assert.rejects(
  db.query(
    "insert into pillar_page_revisions(page_id,snapshot,change_source) values($1,'{}','system')",
    [guide.id],
  ),
  /permission denied/,
);
await assert.rejects(
  db.exec("select capture_resource_revision()"),
  /permission denied/,
);

await db.exec(`set test.uid='${MEMBER}';`);
assert.equal(
  (await one("select count(*)::int n from generated_page_revisions")).n,
  0,
);
await assert.rejects(
  db.query(
    "select * from publish_pillar_page_with_override_v2($1,'A documented reason','{}',$2)",
    [guide.id, guide.updated_at],
  ),
  /Admins only/,
);
await db.exec("reset role; set role anon;");
await assert.rejects(
  db.exec("select * from generated_page_revisions"),
  /permission denied/,
);
await db.exec("reset role; set test.uid=''; set role service_role;");
await assert.rejects(
  db.query(
    "select * from publish_pillar_page_with_override_v2($1,'A documented reason','{}',$2)",
    [guide.id, guide.updated_at],
  ),
  /Admins only/,
);
await db.query(
  "update generated_pages set seo_meta=jsonb_set(seo_meta,'{system_note}','\"refresh\"') where id=$1",
  [resource.id],
);
const system = await one(
  "select change_source,actor_id from generated_page_revisions where page_id=$1 order by created_at desc,id desc limit 1",
  [resource.id],
);
assert.deepEqual(system, { change_source: "system", actor_id: null });
await db.exec("reset role;");
for (let index = 0; index < 25; index++) {
  await db.query("update generated_pages set title=$2 where id=$1", [
    resource.id,
    `Resource ${index}`,
  ]);
  await db.query("update pillar_pages set title=$2 where id=$1", [
    guide.id,
    `Guide ${index}`,
  ]);
  if (index === 0) {
    // Simulate repeated/backward clock readings. New captures must remain newer
    // than retained records even when the wall clock is behind their timestamp.
    await db.exec(
      "update generated_page_revisions set created_at=clock_timestamp()+interval '1 second'; update pillar_page_revisions set created_at=clock_timestamp()+interval '1 second';",
    );
  }
}
for (const table of ["generated_page_revisions", "pillar_page_revisions"]) {
  assert.equal(
    (await one(`select count(distinct created_at)::int n from ${table}`)).n,
    20,
  );
}
assert.equal(
  (await one("select count(*)::int n from generated_page_revisions")).n,
  20,
);
assert.equal(
  (await one("select count(*)::int n from pillar_page_revisions")).n,
  20,
);
assert.equal(
  (
    await one(
      "select snapshot->>'title' title from generated_page_revisions order by created_at desc,id desc limit 1",
    )
  ).title,
  "Resource 23",
);
const before = await one(
  "select *,updated_at::text as updated_at from pillar_pages where id=$1",
  [guide.id],
);
await db.exec(`set role authenticated; set test.uid='${ADMIN}';`);
const updated = await one(
  "update pillar_pages set content='A revised draft',updated_at='2000-01-01' where id=$1 and updated_at=$2 returning *,updated_at::text as updated_at",
  [guide.id, before.updated_at],
);
assert.equal(
  (
    await one(
      "select updated_at>$2::timestamptz newer from pillar_pages where id=$1",
      [guide.id, before.updated_at],
    )
  ).newer,
  true,
);
assert.equal(
  (
    await db.query(
      "update pillar_pages set title='Stale edit' where id=$1 and updated_at=$2 returning id",
      [guide.id, before.updated_at],
    )
  ).rows.length,
  0,
);
await assert.rejects(
  db.query(
    "select * from publish_pillar_page_with_override_v2($1,'A documented reason','{}',$2)",
    [guide.id, before.updated_at],
  ),
  /changed/,
);
await db.exec("reset role;");
assert.equal(
  (await one("select count(*)::int n from pillar_publish_overrides")).n,
  0,
);
await db.exec(`set role authenticated; set test.uid='${ADMIN}';`);
await db.query(
  "select * from publish_pillar_page_with_override_v2($1,'A documented reason','{}',$2)",
  [guide.id, updated.updated_at],
);
assert.equal(
  (await one("select status from pillar_pages where id=$1", [guide.id])).status,
  "published",
);
assert.equal(
  (
    await one(
      "select snapshot->>'status' status from pillar_page_revisions where page_id=$1 order by created_at desc,id desc limit 1",
      [guide.id],
    )
  ).status,
  "draft",
);
await db.exec("reset role;");
assert.notEqual(
  (
    await one(
      "select to_regprocedure('public.publish_pillar_page_with_override(uuid,text,text[])') old_rpc",
    )
  ).old_rpc,
  null,
);
const legacyGuide = await one(
  "insert into pillar_pages(title,slug,content) values('Legacy','legacy','Short') returning *",
);
await db.exec("set role authenticated; set test.uid='';");
await assert.rejects(
  db.query(
    "select * from publish_pillar_page_with_override($1,'A documented reason')",
    [legacyGuide.id],
  ),
  /Admins only/,
);
await db.exec(`set test.uid='${MEMBER}';`);
await assert.rejects(
  db.query(
    "select * from publish_pillar_page_with_override($1,'A documented reason')",
    [legacyGuide.id],
  ),
  /Admins only/,
);
await db.exec(`set test.uid='${ADMIN}';`);
await db.query(
  "select * from publish_pillar_page_with_override($1,'A documented reason')",
  [legacyGuide.id],
);
assert.equal(
  (await one("select status from pillar_pages where id=$1", [legacyGuide.id]))
    .status,
  "published",
);
await db.exec("reset role;");
const countBeforeFailure = (
  await one("select count(*)::int n from pillar_page_revisions")
).n;
await assert.rejects(
  db.query(
    "update pillar_pages set title='Must roll back',status='bad' where id=$1",
    [guide.id],
  ),
  /Invalid status/,
);
assert.equal(
  (await one("select count(*)::int n from pillar_page_revisions")).n,
  countBeforeFailure,
);
assert.notEqual(
  (await one("select title from pillar_pages where id=$1", [guide.id])).title,
  "Must roll back",
);
console.log(
  "PASS: private read-only history, complete before-images, neutral actor labels, meaningful changes, 20-version retention, guide concurrency, guarded override and rollback",
);
await db.close();
