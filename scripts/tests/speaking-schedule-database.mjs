import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const db = new PGlite();
const setup = readFileSync("setup/speaking-notifications-cron.sql", "utf8");
const project = "https://abcdefghijklmnopqrst.supabase.co";
const configured = setup.replace(
  "https://YOUR_PROJECT_REF.supabase.co",
  project,
);
await assert.rejects(db.exec(setup), /Set project_url/);
await assert.rejects(db.exec(configured), /Configure pg_cron/);
await db.exec(`
CREATE SCHEMA cron; CREATE SCHEMA vault; CREATE SCHEMA net;
CREATE TABLE cron.job(jobname text PRIMARY KEY,schedule text,command text);
CREATE TABLE vault.decrypted_secrets(name text,decrypted_secret text);
CREATE TABLE public.site_settings_private(id integer PRIMARY KEY,speaking_notifications_enabled boolean);
INSERT INTO public.site_settings_private VALUES(1,false);
CREATE TABLE public.requests(url text,headers jsonb);
CREATE FUNCTION cron.unschedule(text) RETURNS boolean LANGUAGE plpgsql AS $$
BEGIN DELETE FROM cron.job WHERE jobname=$1; RETURN true; END $$;
CREATE FUNCTION cron.schedule(text,text,text) RETURNS bigint LANGUAGE plpgsql AS $$
BEGIN INSERT INTO cron.job VALUES($1,$2,$3); RETURN 1; END $$;
`);
await assert.rejects(db.exec(configured), /Configure pg_net/);
await db.exec(`
CREATE FUNCTION net.http_post(timeout_milliseconds integer,url text,headers jsonb,body jsonb)
RETURNS bigint LANGUAGE plpgsql AS $$
BEGIN INSERT INTO public.requests VALUES(url,headers); RETURN 1; END $$;
`);
await assert.rejects(db.exec(configured), /CRON_INVOCATION_SECRET/);
await db.exec(
  "INSERT INTO vault.decrypted_secrets VALUES('CRON_INVOCATION_SECRET','local-test-only')",
);
await db.exec(configured);
await db.exec(configured);
const jobs = (await db.query("SELECT * FROM cron.job")).rows;
assert.equal(jobs.length, 1, "setup reruns keep one schedule");
assert.equal(jobs[0].schedule, "*/15 * * * *");
await db.exec(jobs[0].command);
assert.equal(
  (await db.query("SELECT * FROM public.requests")).rows.length,
  0,
  "disabled email makes no HTTP request",
);
await db.exec(
  "UPDATE site_settings_private SET speaking_notifications_enabled=true",
);
await db.exec(jobs[0].command);
const requests = (await db.query("SELECT * FROM public.requests")).rows;
assert.equal(requests.length, 1);
assert.equal(
  requests[0].url,
  project + "/functions/v1/process-speaking-notifications",
);
assert.equal(requests[0].headers["x-cron-secret"], "local-test-only");
await assert.rejects(
  db.exec(
    setup.replace(
      "https://YOUR_PROJECT_REF.supabase.co",
      "https://attacker.example",
    ),
  ),
  /Set project_url/,
);
await db.close();
console.log(
  "PASS: explicit per-project schedule, prerequisite checks, one job after rerun, no HTTP while disabled, destination isolation.",
);
