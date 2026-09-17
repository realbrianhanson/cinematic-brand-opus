import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
const db = new PGlite();
await db.exec(
  "create table seo_metadata(id uuid default gen_random_uuid(),post_id uuid,meta_title text)",
);
await db.exec(
  readFileSync(
    "supabase/migrations/20260917073000_post_seo_identity.sql",
    "utf8",
  ),
);
const id = "00000000-0000-0000-0000-000000000001";
for (const title of ["first", "retry"])
  await db.query(
    "insert into seo_metadata(post_id,meta_title)values($1,$2)on conflict(post_id)do update set meta_title=excluded.meta_title",
    [id, title],
  );
assert.equal(
  (await db.query("select count(*)::int n from seo_metadata")).rows[0].n,
  1,
);
assert.equal(
  (await db.query("select meta_title from seo_metadata")).rows[0].meta_title,
  "retry",
);
const timeoutSQL = readFileSync(
  "supabase/migrations/20260917074000_existing_job_timeouts.sql",
  "utf8",
);
await db.exec(timeoutSQL); // Empty member schemas need no cron extension.
await db.exec(`create schema cron;create table cron.job(jobid bigint,jobname text,command text,schedule text,active boolean);
create function cron.alter_job(job_id bigint,command text)returns void language sql as $$update cron.job j set command=$2 where j.jobid=$1$$;
insert into cron.job values(1,'poll-sources-every-4h','select net.http_post(url := ''https://example.com'',headers := ''{}'');','15 */4 * * *',false),
(2,'send-weekly-newsletter-tuesday','select net.http_post(timeout_milliseconds := 1000,url := ''https://example.com'');','0 14 * * 2',true),
(3,'unrelated','select 1','* * * * *',true);`);
await db.exec(timeoutSQL);
const once = (await db.query("select * from cron.job order by jobid")).rows;
assert.match(once[0].command, /timeout_milliseconds := 120000/);
assert.equal(once[0].active, false);
assert.equal(once[0].schedule, "15 */4 * * *");
assert.match(once[1].command, /timeout_milliseconds := 120000/);
assert.equal(once[2].command, "select 1");
await db.exec(timeoutSQL);
assert.deepEqual(
  (await db.query("select * from cron.job order by jobid")).rows,
  once,
);
console.log(
  "PASS: retry-safe SEO upsert, empty-remix cron no-op, preserved schedules/active flags, idempotent timeouts",
);
await db.close();
