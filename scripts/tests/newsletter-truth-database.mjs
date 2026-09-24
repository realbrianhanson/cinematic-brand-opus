// Newsletter delivery truth: honest final states, provider errors, safe retry,
// admin-only audience reads and the one-time W34–W38 history correction.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const db = new PGlite();
const q = async (sql, params = []) => (await db.query(sql, params)).rows;
const one = async (sql, params = []) => (await q(sql, params))[0];
const asAdmin = (on) => db.exec(`set test.admin = '${on ? "on" : "off"}'`);

await db.exec(`create role anon; create role authenticated; create role service_role;
create schema auth;
create function auth.uid() returns uuid language sql as $$select '00000000-0000-4000-8000-000000000001'::uuid$$;
create function public.is_admin(uuid) returns boolean language sql as $$select coalesce(current_setting('test.admin', true), '') = 'on'$$;
create table newsletter_sends(id uuid primary key default gen_random_uuid(),week_key text unique,status text,
  updated_at timestamptz default now(),created_at timestamptz default now(),claimed_at timestamptz,
  recipient_count int not null default 0,sent_count int not null default 0);
create table newsletter_subscribers(id uuid primary key default gen_random_uuid(),email text unique,status text,
  confirm_token uuid default gen_random_uuid(),source text,created_at timestamptz not null default now(),
  confirmed_at timestamptz,unsubscribed_at timestamptz,last_confirmation_sent_at timestamptz,
  confirmation_send_count int not null default 0);`);
await db.exec(
  readFileSync(
    "supabase/migrations/20260917070000_newsletter_delivery_receipts.sql",
    "utf8",
  ),
);
await db.exec(`create trigger validate_newsletter_send_status before insert or update on newsletter_sends
  for each row execute function public.validate_newsletter_send_status();`);

// ---- Production-shaped history before the migration ------------------------
await db.exec(`insert into newsletter_sends(week_key,status,recipient_count,sent_count) values
  ('2026-W33','sent',1,1),('2026-W34','sent',1,0),('2026-W35','sent',1,0),('2026-W36','sent',1,0),
  ('2026-W37','sent',3,2),('2026-W38','sent',1,0),('2026-W40','sent',1,0),('2026-W32','sent',0,0);`);
const [brian] = await q(
  `insert into newsletter_subscribers(email,status,source,confirmed_at) values('brian@example.com','confirmed','founder',now()) returning id,confirm_token`,
);
const [w39] = await q(
  `insert into newsletter_sends(week_key,status,recipient_count,sent_count,delivery_template)
   values('2026-W39','needs_review',1,0,'{"from":"Brian <brian@m.example.com>","subject":"S","html":"H"}') returning id`,
);
await q(
  `insert into newsletter_deliveries(send_id,subscriber_id,email,confirm_token,status,attempt_id,attempted_at,detail)
   values($1,$2,'brian@example.com',$3,'failed',gen_random_uuid(),now(),'Provider returned HTTP 403')`,
  [w39.id, brian.id, brian.confirm_token],
);

await db.exec(
  readFileSync(
    "supabase/migrations/20260923140000_newsletter_truth.sql",
    "utf8",
  ),
);

// ---- 1. One-time correction: exact weeks, exact predicates -----------------
const history = Object.fromEntries(
  (
    await q(
      "select week_key,status,last_error from newsletter_sends order by week_key",
    )
  ).map((r) => [r.week_key, r]),
);
for (const week of ["2026-W34", "2026-W35", "2026-W36", "2026-W38"]) {
  assert.equal(history[week].status, "failed", `${week} reached nobody`);
  assert.match(history[week].last_error, /0 of 1/);
}
assert.equal(history["2026-W37"].status, "needs_review", "partial week");
assert.equal(history["2026-W33"].status, "sent", "delivered week untouched");
assert.equal(history["2026-W40"].status, "sent", "outside the corrected range");
assert.equal(history["2026-W32"].status, "sent", "no-recipient row untouched");
assert.equal(history["2026-W39"].status, "needs_review");
const w39Row = await one(
  "select last_error,last_error_status from newsletter_sends where id=$1",
  [w39.id],
);
assert.equal(w39Row.last_error_status, 403, "backfilled provider status");
assert.match(w39Row.last_error, /HTTP 403/);
assert.equal(
  (await one("select provider_status from newsletter_deliveries"))
    .provider_status,
  403,
);
await assert.rejects(
  q("update newsletter_sends set status='bogus' where week_key='2026-W33'"),
  /Invalid newsletter status/,
);

// ---- helpers -----------------------------------------------------------------
async function preview(week) {
  return one(
    "insert into newsletter_sends(week_key,status) values($1,'preview') returning id,updated_at",
    [week],
  );
}
async function prepare(send, lease) {
  return (
    await one("select newsletter_prepare_delivery($1,$2,$3,$4) as r", [
      send.id,
      lease,
      JSON.stringify({ from: "a@b.co", subject: "Hello", html: "Hi" }),
      send.updated_at,
    ])
  ).r;
}
const nextBatch = async (id, lease) =>
  (await one("select newsletter_next_delivery_batch($1,$2) as r", [id, lease]))
    .r;
const record = (
  id,
  lease,
  batch,
  outcome,
  ids = [],
  detail = null,
  status = null,
) =>
  q("select newsletter_record_delivery($1,$2,$3,$4,$5,$6,$7)", [
    id,
    lease,
    batch.attempt_id,
    outcome,
    JSON.stringify(ids),
    detail,
    status,
  ]);
const statusOf = (id) =>
  one(
    "select status,sent_count,recipient_count,last_error,last_error_status from newsletter_sends where id=$1",
    [id],
  );
const uuid = async () => (await one("select gen_random_uuid() as id")).id;

// ---- 2. A provider rejection with nobody reached is 'failed', with detail -----
{
  const send = await preview("2026-W41");
  const lease = await uuid();
  assert.ok(await prepare(send, lease));
  const b = await nextBatch(send.id, lease);
  await record(
    send.id,
    lease,
    b,
    "failed",
    [],
    "Provider returned HTTP 403: The m.example.com domain is not verified",
    403,
  );
  assert.deepEqual(await statusOf(send.id), {
    status: "failed",
    sent_count: 0,
    recipient_count: 1,
    last_error:
      "Provider returned HTTP 403: The m.example.com domain is not verified",
    last_error_status: 403,
  });
  assert.equal(await prepare(send, await uuid()), null, "failed is terminal");
  assert.equal((await statusOf(send.id)).status, "failed");

  // ---- 3. Retry: admin only, idempotent, then delivers and clears the error --
  await asAdmin(false);
  await assert.rejects(
    q("select newsletter_retry_failed_delivery($1)", [send.id]),
    /Admin access required/,
  );
  await asAdmin(true);
  const first = (
    await one("select newsletter_retry_failed_delivery($1) as r", [send.id])
  ).r;
  assert.deepEqual(first, { ok: true, state: "sending", reset: 1 });
  const again = (
    await one("select newsletter_retry_failed_delivery($1) as r", [send.id])
  ).r;
  assert.deepEqual(again, { ok: true, state: "sending", reset: 0 });
  const retryLease = await uuid();
  assert.ok(await prepare(send, retryLease), "retry is not quarantined");
  const rb = await nextBatch(send.id, retryLease);
  assert.equal(rb.recipients.length, 1);
  await record(send.id, retryLease, rb, "accepted", ["receipt-1"]);
  assert.equal(await nextBatch(send.id, retryLease), null);
  assert.deepEqual(await statusOf(send.id), {
    status: "sent",
    sent_count: 1,
    recipient_count: 1,
    last_error: null,
    last_error_status: null,
  });
  const done = (
    await one("select newsletter_retry_failed_delivery($1) as r", [send.id])
  ).r;
  assert.equal(done.ok, false, "a sent issue cannot be retried");
  assert.equal(done.reason, "not_retryable");
}

// ---- 4. Uncertain outcomes stay in review and can never be retried ----------
{
  const send = await preview("2026-W42");
  const lease = await uuid();
  await prepare(send, lease);
  const b = await nextBatch(send.id, lease);
  await record(
    send.id,
    lease,
    b,
    "uncertain",
    [],
    "Provider returned HTTP 503",
    503,
  );
  assert.equal((await statusOf(send.id)).status, "needs_review");
  const r = (
    await one("select newsletter_retry_failed_delivery($1) as r", [send.id])
  ).r;
  assert.equal(r.ok, false);
  assert.equal(r.reason, "uncertain_attempts");
  assert.equal(
    (
      await one("select status from newsletter_deliveries where send_id=$1", [
        send.id,
      ])
    ).status,
    "uncertain",
  );
}

// ---- 5. Legacy rows without receipts are never replayed ----------------------
{
  const [legacy] = await q(
    "select id from newsletter_sends where week_key='2026-W34'",
  );
  const r = (
    await one("select newsletter_retry_failed_delivery($1) as r", [legacy.id])
  ).r;
  assert.deepEqual(r, {
    ok: false,
    state: "failed",
    reason: "no_receipts",
    reset: 0,
  });
}

// ---- 6. Partial delivery is needs_review, not sent ---------------------------
{
  await db.exec(
    `insert into newsletter_subscribers(email,status) select 'bulk-'||i||'@example.com','confirmed' from generate_series(1,149) i`,
  );
  const send = await preview("2026-W43");
  const lease = await uuid();
  await prepare(send, lease);
  const b1 = await nextBatch(send.id, lease);
  await record(
    send.id,
    lease,
    b1,
    "accepted",
    b1.recipients.map((r) => `r-${r.id}`),
  );
  const b2 = await nextBatch(send.id, lease);
  await record(
    send.id,
    lease,
    b2,
    "failed",
    [],
    "Provider returned HTTP 429: slow down",
    429,
  );
  const s = await statusOf(send.id);
  assert.equal(s.status, "needs_review");
  assert.equal(s.sent_count, 100);
  assert.equal(s.recipient_count, 150);
  assert.equal(s.last_error_status, 429);
}

// ---- 7. Nobody eligible means 'failed', never 'sent 0' -----------------------
{
  await db.exec("update newsletter_subscribers set status='unsubscribed'");
  const send = await preview("2026-W44");
  const lease = await uuid();
  await prepare(send, lease);
  assert.equal(await nextBatch(send.id, lease), null);
  const s = await statusOf(send.id);
  assert.equal(s.status, "failed");
  assert.equal(s.sent_count, 0);
  assert.match(s.last_error, /nobody was emailed/i);
}

// ---- 8. A full delivery is 'sent' ----------------------------------------------
{
  await db.exec(
    "update newsletter_subscribers set status='confirmed' where email like 'bulk-%'",
  );
  const send = await preview("2026-W45");
  const lease = await uuid();
  await prepare(send, lease);
  let batch;
  while ((batch = await nextBatch(send.id, lease)))
    await record(
      send.id,
      lease,
      batch,
      "accepted",
      batch.recipients.map((r) => `r-${r.id}`),
    );
  const s = await statusOf(send.id);
  assert.equal(s.status, "sent");
  assert.equal(s.sent_count, 149);
  assert.equal(s.recipient_count, 149);
}

// ---- 9. Admin-only audience read without tokens --------------------------------
{
  await db.exec(`update newsletter_subscribers set status='pending', source='final_cta' where email in ('bulk-1@example.com','bulk-2@example.com');
    update newsletter_subscribers set status='bounced' where email='bulk-3@example.com';
    update newsletter_subscribers set status='unsubscribed' where email='bulk-4@example.com';
    insert into newsletter_subscribers(email,status) values('under_score@example.com','pending');`);
  await asAdmin(false);
  await assert.rejects(
    q("select admin_newsletter_audience()"),
    /Admin access required/,
  );
  await asAdmin(true);
  const all = (await one("select admin_newsletter_audience() as r")).r;
  assert.deepEqual(all.counts, {
    total: 151,
    confirmed: 145,
    pending: 3,
    unsubscribed: 2,
    bounced: 1,
    complained: 0,
    pending_not_emailed: 3,
  });
  assert.equal(all.rows.length, 50, "default page size");
  assert.ok(!("confirm_token" in all.rows[0]), "tokens never leave the DB");
  const pending = (
    await one("select admin_newsletter_audience(null,'pending',10,0) as r")
  ).r;
  assert.equal(pending.matching, 3);
  assert.ok(pending.rows.every((r) => r.status === "pending"));
  const underscore = (
    await one("select admin_newsletter_audience('under_s',null,10,0) as r")
  ).r;
  assert.deepEqual(
    underscore.rows.map((r) => r.email),
    ["under_score@example.com"],
    "LIKE wildcards are escaped",
  );
  const wildcard = (
    await one("select admin_newsletter_audience('%',null,10,0) as r")
  ).r;
  assert.equal(wildcard.matching, 0, "a bare % matches nothing literal");
  const bySource = (
    await one("select admin_newsletter_audience('final_cta',null,10,0) as r")
  ).r;
  assert.equal(bySource.matching, 2);
  await assert.rejects(
    q("select admin_newsletter_audience(null,'deleted',10,0)"),
    /Unknown subscriber status/,
  );
  const capped = (
    await one("select admin_newsletter_audience(null,null,100000,0) as r")
  ).r;
  assert.equal(capped.rows.length, 151, "limit is clamped to 200, all 151 fit");
}

// ---- 10. Grants: RPCs are not callable by anon; internal helper is sealed ----
{
  const grants = await q(`select p.proname,
      has_function_privilege('anon', p.oid, 'execute') as anon,
      has_function_privilege('authenticated', p.oid, 'execute') as auth
    from pg_proc p where p.proname in
      ('admin_newsletter_audience','newsletter_retry_failed_delivery','newsletter_settle_send','newsletter_record_delivery')`);
  for (const g of grants) {
    assert.equal(g.anon, false, `${g.proname} anon`);
    if (g.proname.startsWith("admin_") || g.proname.includes("retry"))
      assert.equal(g.auth, true, `${g.proname} authenticated`);
    else assert.equal(g.auth, false, `${g.proname} authenticated`);
  }
  const definers =
    await q(`select proname, prosecdef, proconfig from pg_proc where proname in
    ('admin_newsletter_audience','newsletter_retry_failed_delivery','newsletter_settle_send')`);
  for (const d of definers) {
    assert.equal(d.prosecdef, true, `${d.proname} security definer`);
    assert.ok(
      (d.proconfig ?? []).some((c) => c.startsWith("search_path=")),
      `${d.proname} pins search_path`,
    );
  }
}

// ---- 11. Re-running the migration is safe (idempotent) ------------------------
await db.exec(
  readFileSync(
    "supabase/migrations/20260923140000_newsletter_truth.sql",
    "utf8",
  ),
);
assert.equal(
  (await one("select status from newsletter_sends where week_key='2026-W40'"))
    .status,
  "sent",
);

console.log(
  "PASS: history correction, provider status capture, failed/partial/zero/full outcomes, admin-only idempotent retry, uncertain lockout, legacy lockout, audience RPC (admin gate, counts, search escaping, no tokens), grants",
);
await db.close();
