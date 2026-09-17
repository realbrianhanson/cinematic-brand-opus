import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
const db = new PGlite();
await db.exec(`create role anon; create role authenticated; create role service_role;
create schema auth; create function auth.uid() returns uuid language sql as $$select null::uuid$$;
create function public.is_admin(uuid) returns boolean language sql as $$select true$$;
create table newsletter_sends(id uuid primary key default gen_random_uuid(),status text,updated_at timestamptz default now(),claimed_at timestamptz,recipient_count int default 0,sent_count int default 0);
create table newsletter_subscribers(id uuid primary key default gen_random_uuid(),email text,status text,confirm_token uuid default gen_random_uuid());`);
await db.exec(
  readFileSync(
    "supabase/migrations/20260917070000_newsletter_delivery_receipts.sql",
    "utf8",
  ),
);
const q = async (s, p = []) => (await db.query(s, p)).rows;
await db.exec(
  `insert into newsletter_subscribers(email,status) select 'member-'||i||'@example.com','confirmed' from generate_series(1,1101) i;`,
);
const [send] = await q(
  `insert into newsletter_sends(status) values('preview') returning id,updated_at`,
);
const [lease] = await q(`select gen_random_uuid() as id`);
const prepare = async (
  id = send.id,
  token = lease.id,
  date = send.updated_at,
) =>
  q("select newsletter_prepare_delivery($1,$2,$3,$4) as result", [
    id,
    token,
    JSON.stringify({ subject: "Hello", html: "Hi" }),
    date,
  ]);
assert.ok((await prepare())[0].result);
assert.equal(
  (await q("select count(*)::int n from newsletter_deliveries"))[0].n,
  1101,
);
assert.equal(
  (await prepare())[0].result,
  null,
  "active lease cannot be stolen",
);
// Suppression after snapshot but before delivery is honored.
await db.exec(
  `update newsletter_subscribers set status='unsubscribed' where email='member-1@example.com'`,
);
let total = 0;
for (;;) {
  const b = (
    await q("select newsletter_next_delivery_batch($1,$2) as result", [
      send.id,
      lease.id,
    ])
  )[0].result;
  if (!b) break;
  assert.equal(b.recipients.length, 100);
  assert.ok(!b.recipients.some((r) => r.email === "member-1@example.com"));
  await q("select newsletter_record_delivery($1,$2,$3,$4,$5)", [
    send.id,
    lease.id,
    b.attempt_id,
    "accepted",
    JSON.stringify(b.recipients.map((r) => `receipt-${r.id}`)),
  ]);
  total += b.recipients.length;
}
assert.equal(total, 1100);
assert.deepEqual(
  (
    await q("select status,sent_count from newsletter_sends where id=$1", [
      send.id,
    ])
  )[0],
  { status: "sent", sent_count: 1100 },
);
assert.equal((await prepare())[0].result, null, "sent digest cannot restart");
// Crash after attempt claim: an expired lease never causes a blind replay.
const [crash] = await q(
  `insert into newsletter_sends(status) values('preview') returning id,updated_at`,
);
await prepare(crash.id, lease.id, crash.updated_at);
await q("select newsletter_next_delivery_batch($1,$2)", [crash.id, lease.id]);
await q(
  "update newsletter_sends set delivery_lease_until=now()-interval '1 second' where id=$1",
  [crash.id],
);
assert.equal(
  (await prepare(crash.id, lease.id, crash.updated_at))[0].result,
  null,
);
assert.equal(
  (await q("select status from newsletter_sends where id=$1", [crash.id]))[0]
    .status,
  "needs_review",
);
const [changed] = await q(
  `insert into newsletter_sends(status) values('preview') returning id,updated_at`,
);
await assert.rejects(
  prepare(changed.id, lease.id, "2000-01-01T00:00:00Z"),
  /Preview changed/,
);
console.log(
  "PASS: migration, 1101-recipient snapshot, suppression, batch receipts, completion, lease exclusion, crash quarantine, stale preview",
);
await db.close();
