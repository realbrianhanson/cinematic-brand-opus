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
CREATE TABLE public.newsletter_subscribers(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),email text UNIQUE,status text);
INSERT INTO public.site_settings_private DEFAULT VALUES;
CREATE FUNCTION public.update_updated_at_column() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at=clock_timestamp(); RETURN NEW; END; $$;
`);
await db.exec(
  readFileSync(
    "supabase/migrations/20260919200000_speaking_inquiries.sql",
    "utf8",
  ),
);
await db.exec(
  readFileSync(
    "supabase/migrations/20260924010000_speaking_notifications.sql",
    "utf8",
  ),
);
await db.exec(
  readFileSync(
    "supabase/migrations/20260924011000_transactional_email_suppression.sql",
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
await db.exec("RESET ROLE");
assert.equal(
  (
    await one(
      "SELECT speaking_notifications_enabled FROM site_settings_private",
    )
  ).speaking_notifications_enabled,
  false,
);
assert.equal(
  (await one("SELECT count(*)::int n FROM speaking_notification_deliveries")).n,
  0,
  "disabled notifications do not backfill old inquiries",
);
await db.exec(
  "UPDATE site_settings_private SET speaking_inquiries_enabled=true,speaking_notifications_enabled=true",
);
await db.exec("SET ROLE service_role");
const notificationRequest = "20000000-0000-4000-8000-000000000001";
await submit(notificationRequest);
await submit(notificationRequest);
assert.equal(
  (await one("SELECT count(*)::int n FROM speaking_notification_deliveries")).n,
  3,
  "exact retries never queue duplicate notifications",
);
const deliveries = (
  await db.query("SELECT * FROM speaking_notification_deliveries")
).rows;
const ownerDelivery = deliveries.find((row) => row.kind === "owner");
const acknowledgement = deliveries.find(
  (row) => row.kind === "acknowledgement",
);
const reminder = deliveries.find((row) => row.kind === "reminder");
const claim = async (id) =>
  (await one("SELECT claim_speaking_notification($1) AS value", [id])).value;
const record = async (id, lease, outcome, provider = null) =>
  (
    await one(
      "SELECT record_speaking_notification($1,$2,$3,$4,'Test failure') AS value",
      [id, lease, outcome, provider],
    )
  ).value;
assert.equal(
  await claim(reminder.id),
  null,
  "reminder is not due before 48 hours",
);
const claimed = await claim(ownerDelivery.id);
assert.equal(claimed.inquiry.email, "organizer@example.com");
assert.equal(
  await claim(ownerDelivery.id),
  null,
  "active lease excludes concurrent workers",
);
assert.equal(
  (
    await one("SELECT freeze_speaking_notification($1,$2,$3) AS value", [
      claimed.id,
      claimed.lease_id,
      JSON.stringify({ to: ["owner@example.com"], text: "Original" }),
    ])
  ).value,
  true,
);
await one("SELECT freeze_speaking_notification($1,$2,$3)", [
  claimed.id,
  claimed.lease_id,
  JSON.stringify({ text: "Changed" }),
]);
assert.equal(await record(claimed.id, claimed.lease_id, "uncertain"), true);
assert.equal(
  await claim(claimed.id),
  null,
  "backoff excludes an immediate retry",
);
await db.query(
  "UPDATE speaking_notification_deliveries SET next_attempt_at=now()-interval '1 minute' WHERE id=$1",
  [claimed.id],
);
const retry = await claim(claimed.id);
assert.equal(
  retry.payload.text,
  "Original",
  "provider retries preserve the exact original email",
);
assert.notEqual(retry.lease_id, claimed.lease_id);
assert.equal(
  await record(claimed.id, claimed.lease_id, "sent", "old-worker"),
  false,
  "stale leases cannot record receipts",
);
assert.equal(
  await record(retry.id, retry.lease_id, "sent", "provider-receipt"),
  true,
);
assert.equal(await claim(retry.id), null, "accepted email is never resent");
await db.query(
  "UPDATE speaking_notification_deliveries SET first_attempt_at=now()-interval '24 hours' WHERE id=$1",
  [acknowledgement.id],
);
assert.equal(await claim(acknowledgement.id), null);
assert.equal(
  (
    await one(
      "SELECT status FROM speaking_notification_deliveries WHERE id=$1",
      [acknowledgement.id],
    )
  ).status,
  "needs_review",
  "uncertain mail stops before provider idempotency expires",
);
await db.query(
  "UPDATE speaking_notification_deliveries SET next_attempt_at=now()-interval '1 minute' WHERE id=$1",
  [reminder.id],
);
await db.query("UPDATE speaking_inquiries SET status='contacted' WHERE id=$1", [
  reminder.inquiry_id,
]);
assert.equal(await claim(reminder.id), null);
assert.equal(
  (
    await one(
      "SELECT status FROM speaking_notification_deliveries WHERE id=$1",
      [reminder.id],
    )
  ).status,
  "cancelled",
  "contacted inquiries do not get reminders",
);
await db.exec("SET ROLE anon");
await assert.rejects(
  db.query("SELECT id FROM speaking_notification_deliveries"),
  /permission denied/,
);
await assert.rejects(claim(reminder.id), /permission denied/);
await db.exec(`SET ROLE authenticated; SET test.uid='${other}'`);
assert.equal(
  (await db.query("SELECT id FROM speaking_notification_deliveries")).rows
    .length,
  0,
);
await db.exec(`SET test.uid='${admin}'`);
assert.equal(
  (await db.query("SELECT id FROM speaking_notification_deliveries")).rows
    .length,
  3,
);
await assert.rejects(
  db.query("SELECT payload FROM speaking_notification_deliveries"),
  /permission denied/,
  "frozen email bodies never enter the admin client",
);
await assert.rejects(
  db.query("UPDATE speaking_notification_deliveries SET status='sent'"),
  /permission denied/,
);
await assert.rejects(claim(reminder.id), /permission denied/);
await assert.rejects(
  db.query("SELECT * FROM transactional_email_suppressions"),
  /permission denied/,
);
await assert.rejects(
  db.query("SELECT transactional_email_is_suppressed('someone@example.com')"),
  /permission denied/,
);
await db.exec("SET ROLE service_role");
await submit("30000000-0000-4000-8000-000000000001");
const cooldown = await one(
  "SELECT d.status,d.last_error FROM speaking_notification_deliveries d JOIN speaking_inquiries i ON i.id=d.inquiry_id WHERE i.request_id=$1 AND d.kind='acknowledgement'",
  ["30000000-0000-4000-8000-000000000001"],
);
assert.equal(
  cooldown.status,
  "cancelled",
  "a second inquiry keeps its owner notification but skips repeated acknowledgement",
);
assert.equal(
  (
    await one(
      "SELECT count(*)::int n FROM speaking_notification_deliveries d JOIN speaking_inquiries i ON i.id=d.inquiry_id WHERE i.request_id=$1 AND d.kind='owner' AND d.status='pending'",
      ["30000000-0000-4000-8000-000000000001"],
    )
  ).n,
  1,
);
await one(
  "SELECT record_transactional_email_suppression(' Organizer@Example.com ','complained')",
);
await one(
  "SELECT record_transactional_email_suppression('organizer@example.com','bounced')",
);
assert.equal(
  (
    await one(
      "SELECT reason FROM transactional_email_suppressions WHERE email='organizer@example.com'",
    )
  ).reason,
  "complained",
  "repeated and out-of-order callbacks never weaken a complaint",
);
assert.equal(
  (
    await one(
      "SELECT transactional_email_is_suppressed(' ORGANIZER@EXAMPLE.COM ') AS value",
    )
  ).value,
  true,
);
await db.exec("RESET ROLE");
assert.equal(
  (await one("SELECT count(*)::int n FROM newsletter_subscribers")).n,
  0,
  "transactional suppression does not enroll a speaking contact in marketing",
);
await db.exec(
  "INSERT INTO newsletter_subscribers(email,status) VALUES('subscriber@example.com','confirmed')",
);
await db.exec("SET ROLE service_role");
await one(
  "SELECT record_transactional_email_suppression('subscriber@example.com','bounced')",
);
await db.exec("RESET ROLE");
assert.equal(
  (
    await one(
      "SELECT status FROM newsletter_subscribers WHERE email='subscriber@example.com'",
    )
  ).status,
  "bounced",
  "an existing marketing subscription is also suppressed",
);
await assert.rejects(
  db.query(
    "SELECT record_transactional_email_suppression('invalid','bounced')",
  ),
  /check constraint/,
);
await assert.rejects(
  db.query(
    "SELECT record_transactional_email_suppression('valid@example.com','invented')",
  ),
  /invalid suppression reason/,
);
await db.close();
console.log(
  "Speaking inquiry database checks passed: intake and mail opt-in, durable dedupe, leases, frozen retries, idempotency expiry, reminder cancellation, and RLS.",
);
