import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
const db = new PGlite();
await db.exec(`create role anon;create role authenticated;create role service_role;
create table content_opportunities(id uuid primary key default gen_random_uuid(),status text default 'proposed',attempts int default 0,last_attempt_at timestamptz,opportunity_score int default 1);
create table posts(id uuid primary key default gen_random_uuid(),opportunity_id uuid,status text default 'draft',created_at timestamptz default now(),updated_at timestamptz default now(),scheduled_at timestamptz,quality_score numeric,lint_flags jsonb,fact_check jsonb);
create table site_settings_private(auto_publish_enabled boolean,auto_publish_min_quality int,auto_publish_daily_cap int);
insert into site_settings_private values(true,85,2);
create function content_claim_opportunities(integer,integer,integer,integer) returns void language sql as $$select$$;`);
await db.exec(
  readFileSync(
    "supabase/migrations/20260917072000_pipeline_claim_ownership.sql",
    "utf8",
  ),
);
const q = async (s, p = []) => (await db.query(s, p)).rows;
await db.exec(
  `insert into content_opportunities(opportunity_score) select i from generate_series(1,6)i`,
);
const claims = await q("select * from content_claim_opportunities(3,3)");
assert.equal(claims.length, 3);
assert.equal(
  (await q("select * from content_claim_opportunities(3,3)")).length,
  0,
  "in-flight claims consume the shared daily budget",
);
for (const claim of claims) {
  assert.equal(
    (
      await q("select * from content_start_draft($1,$2)", [
        claim.id,
        claim.claim_token,
      ])
    ).length,
    1,
  );
  assert.equal(
    (
      await q("select * from content_start_draft($1,$2)", [
        claim.id,
        claim.claim_token,
      ])
    ).length,
    0,
    "a reservation starts once",
  );
  await assert.rejects(
    q("insert into posts(opportunity_id) values($1)", [claim.id]),
    /Draft claim lost/,
  );
  await q(
    `insert into posts(opportunity_id,draft_claim_token,quality_score,lint_flags,fact_check) values($1,$2,90,'[]','{"claims":[{},{}],"verified_count":2,"unverified_count":0,"contradicted_count":0}')`,
    [claim.id, claim.claim_token],
  );
}
const posts = await q("select id from posts");
const results = [];
for (const p of posts)
  results.push(
    (await q("select content_schedule_checked($1) as r", [p.id]))[0].r,
  );
assert.equal(results.filter((r) => r.decision === "scheduled").length, 2);
assert.equal(results.filter((r) => r.reason === "daily cap reached").length, 1);
const times = await q(
  "select scheduled_at from posts where status='scheduled' order by scheduled_at",
);
assert.equal(
  new Date(times[1].scheduled_at) - new Date(times[0].scheduled_at),
  90 * 60 * 1000,
);
console.log(
  "PASS: pipeline migration, shared reservations, one-start handoff, stale-writer fencing, atomic cap, 90-minute slots",
);
await db.close();
