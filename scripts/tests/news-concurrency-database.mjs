import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const ADMIN = "00000000-0000-4000-8000-000000000001";
const MEMBER = "00000000-0000-4000-8000-000000000002";
const SUPPLIED = "00000000-0000-4000-8000-000000000003";
const db = new PGlite();
await db.exec(`
create role anon; create role authenticated; create role service_role bypassrls;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
create function public.is_admin(id uuid) returns boolean language sql immutable as $$select id='${ADMIN}'::uuid$$;
create table source_items(id uuid primary key default gen_random_uuid(), title text, full_content text, image_url text, status text not null default 'pending');
alter table source_items enable row level security;
create policy admin_news on source_items for all to authenticated using(is_admin(auth.uid())) with check(is_admin(auth.uid()));
create policy public_news on source_items for select using(status='published');
grant usage on schema public,auth to authenticated,anon,service_role;
grant select on source_items to anon;
grant select,insert,update,delete on source_items to authenticated,service_role;
insert into source_items(title,full_content) values('Existing article','Original');
`);
await db.exec(
  readFileSync(
    "supabase/migrations/20260925150000_news_concurrency.sql",
    "utf8",
  ),
);
const one = async (sql, args = []) => (await db.query(sql, args)).rows[0];
const original = await one("select * from source_items");
assert.match(original.edit_version, /^[\da-f-]{36}$/i);
await db.exec(`set role authenticated; set test.uid='${ADMIN}';`);
const inserted = await one(
  "insert into source_items(title,edit_version) values('New article',$1) returning *",
  [SUPPLIED],
);
assert.notEqual(inserted.edit_version, SUPPLIED);
const revised = await one(
  "update source_items set full_content='Editor review',edit_version=$3 where id=$1 and edit_version=$2 returning *",
  [original.id, original.edit_version, original.edit_version],
);
assert.notEqual(revised.edit_version, original.edit_version);
for (const patch of [
  "full_content='Stale editor'",
  "image_url='stale-image.jpg'",
]) {
  assert.equal(
    (
      await db.query(
        `update source_items set ${patch} where id=$1 and edit_version=$2 returning id`,
        [original.id, original.edit_version],
      )
    ).rows.length,
    0,
  );
}
assert.equal(
  (
    await one("select full_content from source_items where id=$1", [
      original.id,
    ])
  ).full_content,
  "Editor review",
);
// The currently published client remains able to save without a supplied token.
const legacy = await one(
  "update source_items set title='Legacy admin' where id=$1 returning *",
  [original.id],
);
assert.notEqual(legacy.edit_version, revised.edit_version);
assert.equal(
  (
    await db.query(
      "update source_items set full_content='Stale new editor' where id=$1 and edit_version=$2 returning id",
      [original.id, revised.edit_version],
    )
  ).rows.length,
  0,
);
await assert.rejects(
  db.exec("select touch_news_edit_version()"),
  /permission denied/,
);
await db.exec(`set test.uid='${MEMBER}';`);
assert.equal((await db.query("select * from source_items")).rows.length, 0);
assert.equal(
  (
    await db.query(
      "update source_items set title='Non-admin' where id=$1 returning id",
      [original.id],
    )
  ).rows.length,
  0,
);
await db.exec("reset role; set role anon;");
await assert.rejects(
  db.exec("update source_items set title='Anonymous'"),
  /permission denied/,
);
await db.exec("reset role; set test.uid=''; set role service_role;");
const generated = await one(
  "update source_items set full_content='Generated while current' where id=$1 and edit_version=$2 returning *",
  [original.id, legacy.edit_version],
);
assert.notEqual(generated.edit_version, legacy.edit_version);
assert.equal(
  (
    await db.query(
      "update source_items set full_content='Late generation' where id=$1 and edit_version=$2 returning id",
      [original.id, legacy.edit_version],
    )
  ).rows.length,
  0,
);
await db.exec("reset role;");
// No clock precision dependency, even repeated writes within one transaction.
await db.exec("begin");
const versions = new Set();
for (let i = 0; i < 20; i++)
  versions.add(
    (
      await one(
        "update source_items set title=title where id=$1 returning edit_version",
        [original.id],
      )
    ).edit_version,
  );
await db.exec("commit");
assert.equal(versions.size, 20);
const beforeFailure = await one(
  "select edit_version from source_items where id=$1",
  [original.id],
);
await assert.rejects(
  db.query("update source_items set status=null where id=$1", [original.id]),
  /not-null/,
);
assert.equal(
  (
    await one("select edit_version from source_items where id=$1", [
      original.id,
    ])
  ).edit_version,
  beforeFailure.edit_version,
);
console.log(
  "PASS: news versions are server-owned, conditional writes preserve newer work, legacy writes invalidate tokens, roles remain private and failures roll back",
);
await db.close();
