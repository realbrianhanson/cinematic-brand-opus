import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const db = new PGlite();
await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;
create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
create function public.is_admin(uuid) returns boolean language sql as $$select $1='00000000-0000-0000-0000-000000000001'::uuid$$;
grant usage on schema public,auth to anon,authenticated,service_role;`);
await db.exec(
  readFileSync(
    "supabase/migrations/20260923120000_jev_shadow_scores.sql",
    "utf8",
  ),
);

const row = `insert into jev_shadow_scores(subject_type,subject_id,model,questions_version,relevant_prob,verdict)
  values('opportunity','00000000-0000-0000-0000-0000000000aa','jev','v1',0.9,'pursue')`;

await db.exec("set role service_role");
await db.exec(row);
await assert.rejects(db.exec(row), /duplicate key/);
await assert.rejects(
  db.exec(`insert into jev_shadow_scores(subject_type,subject_id,model,questions_version,relevant_prob)
    values('opportunity',gen_random_uuid(),'jev','v1',1.5)`),
  /check constraint/,
);
await assert.rejects(
  db.exec(`insert into jev_shadow_scores(subject_type,subject_id,model,questions_version)
    values('post',gen_random_uuid(),'jev','v1')`),
  /check constraint/,
);

await db.exec("reset role; set role anon");
await assert.rejects(
  db.query("select * from jev_shadow_scores"),
  /permission denied/,
);

await db.exec(
  "reset role; set role authenticated; set test.uid='00000000-0000-0000-0000-000000000002'",
);
assert.equal(
  (await db.query("select * from jev_shadow_scores")).rows.length,
  0,
);
await assert.rejects(db.exec(row.replace("aa'", "bb'")), /permission denied/);

await db.exec("set test.uid='00000000-0000-0000-0000-000000000001'");
assert.equal(
  (await db.query("select * from jev_shadow_scores")).rows.length,
  1,
);
await assert.rejects(
  db.exec("delete from jev_shadow_scores"),
  /permission denied/,
);

console.log(
  "PASS: jev_shadow_scores is admin-read-only, service-role written, bounded and idempotent",
);
