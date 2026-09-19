import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const db = new PGlite();
const admin = "00000000-0000-0000-0000-000000000001";
const other = "00000000-0000-0000-0000-000000000002";
const request = "10000000-0000-4000-8000-000000000001";
const hash = "ab".repeat(32);
await db.exec(`
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('test.uid',true),'')::uuid$$;
CREATE FUNCTION public.is_admin(uuid) RETURNS boolean LANGUAGE sql AS $$SELECT $1='${admin}'::uuid$$;
GRANT USAGE ON SCHEMA public,auth TO anon,authenticated,service_role;
CREATE TABLE public.site_settings_private(id uuid DEFAULT gen_random_uuid() PRIMARY KEY);
INSERT INTO public.site_settings_private DEFAULT VALUES;
CREATE FUNCTION public.update_updated_at_column() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at=clock_timestamp(); RETURN NEW; END; $$;
`);
await db.exec(
  readFileSync(
    "supabase/migrations/20260919200000_speaking_inquiries.sql",
    "utf8",
  ),
);
const one = async (sql, args = []) => (await db.query(sql, args)).rows[0];
const submit = (id = request, digest = hash, name = "Organizer") =>
  db.query(
    "SELECT public.submit_speaking_inquiry($1,$2,$3,'organizer@example.com','Annual meeting','Autumn','in_person','100 owners','A practical workshop') AS accepted",
    [id, digest, name],
  );
assert.equal(
  (await one("SELECT speaking_inquiries_enabled FROM site_settings_private"))
    .speaking_inquiries_enabled,
  false,
  "new member installations default paused",
);
await db.exec("SET ROLE service_role");
await assert.rejects(submit(), /speaking_inquiries_disabled/);
await db.exec(
  "RESET ROLE; UPDATE site_settings_private SET speaking_inquiries_enabled=true; SET ROLE service_role",
);
assert.equal((await submit()).rows[0].accepted, true);
assert.equal(
  (await submit()).rows[0].accepted,
  true,
  "retry acknowledged without duplicate",
);
assert.equal(
  (await one("SELECT count(*)::int n FROM speaking_inquiries")).n,
  1,
);
await assert.rejects(
  submit(request, "cd".repeat(32)),
  /speaking_request_mismatch/,
);
await assert.rejects(
  submit("10000000-0000-4000-8000-000000000002", hash, " "),
  /check constraint/,
);
await db.exec(
  "RESET ROLE; UPDATE site_settings_private SET speaking_inquiries_enabled=false; SET ROLE service_role",
);
assert.equal(
  (await submit()).rows[0].accepted,
  true,
  "retry still succeeds after intake is paused",
);
await assert.rejects(
  submit("10000000-0000-4000-8000-000000000003"),
  /speaking_inquiries_disabled/,
);
await db.exec("SET ROLE anon");
await assert.rejects(
  db.query("SELECT * FROM speaking_inquiries"),
  /permission denied/,
);
await assert.rejects(submit(), /permission denied/);
await db.exec(`SET ROLE authenticated; SET test.uid='${other}'`);
assert.equal(
  (await db.query("SELECT * FROM speaking_inquiries")).rows.length,
  0,
  "ordinary signed-in users cannot see leads",
);
assert.equal(
  (await db.query("UPDATE speaking_inquiries SET status='spam' RETURNING id"))
    .rows.length,
  0,
);
await assert.rejects(submit(), /permission denied/);
await db.exec(`SET test.uid='${admin}'`);
const original = await one("SELECT * FROM speaking_inquiries");
assert.equal(original.name, "Organizer");
assert.equal(original.status, "new");
const updated = await one(
  "UPDATE speaking_inquiries SET status='contacted',admin_notes='Requested a date' WHERE id=$1 RETURNING *",
  [original.id],
);
assert.equal(updated.status, "contacted");
assert.equal(updated.admin_notes, "Requested a date");
assert.ok(new Date(updated.updated_at) >= new Date(original.updated_at));
await assert.rejects(
  db.query("UPDATE speaking_inquiries SET email='changed@example.com'"),
  /permission denied/,
);
await assert.rejects(
  db.query("UPDATE speaking_inquiries SET payload_hash=$1", ["cd".repeat(32)]),
  /permission denied/,
);
await assert.rejects(
  db.query("UPDATE speaking_inquiries SET status='invented'"),
  /check constraint/,
);
await assert.rejects(
  db.query("UPDATE speaking_inquiries SET admin_notes=$1", ["a".repeat(5001)]),
  /check constraint/,
);
await assert.rejects(
  db.query("DELETE FROM speaking_inquiries"),
  /permission denied/,
);
await assert.rejects(
  db.query(
    "INSERT INTO speaking_inquiries(request_id,payload_hash,name,email,event_name) VALUES($1,$2,'Fake','fake@example.com','Fake')",
    ["10000000-0000-4000-8000-000000000004", hash],
  ),
  /permission denied/,
);
await db.close();
console.log(
  "Speaking inquiry database checks passed: opt-in, retries, mismatch, bounds, RLS and restricted admin updates.",
);
