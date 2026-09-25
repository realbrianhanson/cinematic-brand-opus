import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
const db = new PGlite();
await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;
create function auth.uid() returns uuid language sql as $$select null::uuid$$;
create function public.is_admin(uuid) returns boolean language sql as $$select false$$;
grant usage on schema public,auth to anon,authenticated,service_role;
create table gsc_performance(id uuid default gen_random_uuid(),page_url text,query text,clicks integer,impressions integer,ctr numeric,position numeric,period_start date,period_end date,fetched_at timestamptz);
grant all on gsc_performance to service_role;
insert into gsc_performance(page_url,query,clicks,impressions,ctr,position,period_start,period_end) values('https://example.test/old','old',9,90,0.1,3,'2026-08-01','2026-08-28');`);
await db.exec(
  readFileSync(
    "supabase/migrations/20260925101000_atomic_gsc_imports.sql",
    "utf8",
  ),
);
const start = async () =>
  (
    await db.query(
      "insert into gsc_imports(property,period_start,period_end) values('sc-domain:example.test','2026-08-01','2026-08-28') returning id",
    )
  ).rows[0].id;
const finish = (id, n) => db.query("select gsc_finish_import($1,$2)", [id, n]);
const old = await start();
await db.exec("set role anon");
await assert.rejects(finish(old, 0), /permission denied/);
await db.exec("set role authenticated");
await assert.rejects(finish(old, 0), /permission denied/);
await db.exec("set role service_role");
const id = await start();
await db.query(
  "insert into gsc_import_rows values($1,0,'https://example.test/new','new',1,10,0.1,2)",
  [id],
);
await assert.rejects(finish(id, 2), /Incomplete import/);
assert.equal(
  (await db.query("select clicks from gsc_performance")).rows[0].clicks,
  9,
);
await finish(id, 1);
assert.equal(
  (await db.query("select clicks from gsc_performance")).rows[0].clicks,
  1,
);
await finish(id, 1); // Lost-response retry remains idempotent.
assert.equal(
  (await db.query("select count(*)::int n from gsc_performance")).rows[0].n,
  1,
);
await assert.rejects(finish(old, 0), /newer import/);
const failure = await start();
await db.query(
  "insert into gsc_import_rows values($1,0,'https://example.test/fail','fail',1,10,0.1,2)",
  [failure],
);
await db.exec(
  `reset role;create function reject_import() returns trigger language plpgsql as $$begin if new.query='fail' then raise exception 'Injected import failure';end if;return new;end$$;create trigger fail_import before insert on gsc_performance for each row execute function reject_import();set role service_role;`,
);
await assert.rejects(finish(failure, 1), /Injected import failure/);
assert.equal(
  (await db.query("select query from gsc_performance")).rows[0].query,
  "new",
);
assert.equal(
  (await db.query("select status from gsc_imports where id=$1", [failure]))
    .rows[0].status,
  "importing",
);
const empty = await start();
await finish(empty, 0);
assert.equal(
  (await db.query("select count(*)::int n from gsc_performance")).rows[0].n,
  0,
);
assert.equal(
  (await db.query("select row_count from gsc_imports where id=$1", [empty]))
    .rows[0].row_count,
  0,
);
console.log(
  "PASS: service-only staged activation, incomplete/failed imports preserve active data, idempotent completion, older import rejected, empty completion recorded",
);
await db.close();
