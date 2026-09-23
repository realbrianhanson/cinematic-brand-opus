import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
const db = new PGlite();
const one = async (sql, args = []) => (await db.query(sql, args)).rows[0];
await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
CREATE SCHEMA auth; CREATE SCHEMA storage;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT null::uuid$$;
CREATE FUNCTION public.is_admin(uuid) RETURNS boolean LANGUAGE sql AS $$SELECT false$$;
GRANT USAGE ON SCHEMA public,auth,storage TO anon,authenticated,service_role;
CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
CREATE TABLE storage.objects(id uuid DEFAULT gen_random_uuid() PRIMARY KEY,bucket_id text,name text,UNIQUE(bucket_id,name));
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
GRANT ALL ON storage.objects TO anon,authenticated,service_role;
`);
for (const migration of [
  "20260919110000_offers_funnels.sql",
  "20260919123000_offer_shop_catalog.sql",
  "20260919150000_offer_external_listings.sql",
]) {
  await db.exec(readFileSync(`supabase/migrations/${migration}`, "utf8"));
}
await db.exec(
  "INSERT INTO storage.objects(bucket_id,name) VALUES('offer-files','guide.pdf')",
);
const offerId = (
  await one(
    "INSERT INTO offers(slug,title,summary,status,asset_path,asset_name) VALUES('guide','Guide','Useful guide','published','guide.pdf','guide.pdf') RETURNING id",
  )
).id;
const insertOrder = async (email, status, hash) =>
  (
    await one(
      `INSERT INTO offer_orders(offer_id,email,status,token_hash,title_snapshot,asset_path_snapshot,asset_name_snapshot,amount_minor,currency,next_offer_window_minutes,checkout_expires_at,fulfilled_at) VALUES($1,$2,$3,$4,'Guide','guide.pdf','guide.pdf',0,'usd',0,now()+interval '1 hour',CASE WHEN $3='fulfilled' THEN now() ELSE null END) RETURNING id`,
      [offerId, email, status, hash],
    )
  ).id;
const legacyFulfilled = await insertOrder(
  "legacy@example.com",
  "fulfilled",
  "1".repeat(64),
);
const legacyPending = await insertOrder(
  "legacy-pending@example.com",
  "pending",
  "2".repeat(64),
);
const legacyLong = [];
for (const length of [255, 320])
  legacyLong.push(
    await insertOrder(
      `${"a".repeat(length - 12)}@example.com`,
      "pending",
      length.toString(16).padStart(64, "0"),
    ),
  );
await db.exec(
  readFileSync(
    "supabase/migrations/20260919210000_offer_access_delivery.sql",
    "utf8",
  ),
);
assert.equal(
  (await one("SELECT count(*)::int n FROM offer_access_deliveries")).n,
  0,
  "migration never queues or emails historical fulfilled orders",
);
assert.equal(
  (
    await one("SELECT status,token_hash FROM offer_orders WHERE id=$1", [
      legacyFulfilled,
    ])
  ).token_hash,
  "1".repeat(64),
);
for (const id of [legacyPending, ...legacyLong]) {
  await db.query(
    "UPDATE offer_orders SET status='fulfilled',fulfilled_at=now() WHERE id=$1",
    [id],
  );
  await db.query("UPDATE offer_orders SET status='fulfilled' WHERE id=$1", [
    id,
  ]);
  assert.equal(
    (
      await one(
        "SELECT count(*)::int n FROM offer_access_deliveries WHERE order_ids=ARRAY[$1::uuid]",
        [id],
      )
    ).n,
    1,
    "legacy fulfillment queues exactly once",
  );
}
for (const id of legacyLong) {
  assert.equal(
    (await one("SELECT status FROM offer_orders WHERE id=$1", [id])).status,
    "fulfilled",
    "long legacy addresses do not block fulfillment",
  );
  assert.equal(
    (
      await one(
        "SELECT status FROM offer_access_deliveries WHERE order_ids=ARRAY[$1::uuid]",
        [id],
      )
    ).status,
    "needs_review",
    "unsendable legacy email is quarantined",
  );
}
assert.ok(
  (
    await one(
      "SELECT indexdef FROM pg_indexes WHERE indexname='offer_access_grants_order_idx'",
    )
  ).indexdef.includes("(order_id)"),
);
const original = "a".repeat(64),
  alias = "b".repeat(64);
const order = await insertOrder("reader@example.com", "fulfilled", original);
await insertOrder("reader@example.com", "pending", "c".repeat(64));
await insertOrder("reader@example.com", "refunded", "d".repeat(64));
const otherOrder = await insertOrder(
  "other@example.com",
  "fulfilled",
  "e".repeat(64),
);
await db.exec("SET ROLE service_role");
const prepare = async (id = null, email = null) =>
  (await one("SELECT offer_prepare_access_delivery($1,$2) id", [id, email])).id;
const first = await prepare(order);
assert.equal(await prepare(order), first, "one initial delivery per order");
assert.equal(
  await prepare(null, "unknown@example.com"),
  null,
  "unknown emails never gain a delivery or access",
);
const recovery = await prepare(null, " READER@example.com ");
assert.equal(
  await prepare(null, "reader@example.com"),
  recovery,
  "repeated recovery reuses the hourly delivery",
);
assert.deepEqual(
  (
    await one("SELECT order_ids FROM offer_access_deliveries WHERE id=$1", [
      recovery,
    ])
  ).order_ids,
  [order],
  "pending/refunded/other-email orders are excluded",
);
const claim = (
  await one("SELECT offer_claim_access_delivery($1) value", [first])
).value;
assert.equal(
  (await one("SELECT offer_claim_access_delivery($1) value", [first])).value,
  null,
  "a second sequential lease claim cannot acquire an active lease",
);
await assert.rejects(
  db.query("SELECT offer_freeze_access_delivery($1,$2,$3,$4)", [
    first,
    claim.lease_id,
    "x".repeat(40),
    JSON.stringify([{ order_id: crypto.randomUUID(), token_hash: alias }]),
  ]),
  /Grant order mismatch/,
);
assert.equal(
  (
    await one("SELECT offer_freeze_access_delivery($1,$2,$3,$4) value", [
      first,
      claim.lease_id,
      "encrypted".repeat(8),
      JSON.stringify([{ order_id: order, token_hash: alias }]),
    ])
  ).value,
  true,
);
assert.equal(
  (
    await one("SELECT offer_freeze_access_delivery($1,$2,$3,$4) value", [
      first,
      claim.lease_id,
      "replacement".repeat(8),
      JSON.stringify([{ order_id: order, token_hash: "f".repeat(64) }]),
    ])
  ).value,
  false,
  "frozen payload cannot change",
);
assert.equal(
  (await one("SELECT offer_resolve_access_hash($1) value", [alias])).value,
  original,
  "emailed capability resolves to original order",
);
assert.equal(
  (await one("SELECT offer_resolve_access_hash($1) value", [original])).value,
  original,
  "old links remain valid",
);
assert.equal(
  (await one("SELECT offer_resolve_access_hash($1) value", ["0".repeat(64)]))
    .value,
  null,
);
assert.equal(
  (
    await one(
      "SELECT offer_finish_access_delivery($1,$2,null,'provider_unavailable') value",
      [first, claim.lease_id],
    )
  ).value,
  true,
);
await db.query(
  "UPDATE offer_access_deliveries SET next_attempt_at=now()-interval '1 second' WHERE id=$1",
  [first],
);
const retry = (
  await one("SELECT offer_claim_access_delivery($1) value", [first])
).value;
assert.equal(
  retry.payload_cipher,
  "encrypted".repeat(8),
  "retry preserves frozen provider payload",
);
assert.equal(
  (
    await one(
      "SELECT offer_finish_access_delivery($1,$2,'receipt',null) value",
      [first, claim.lease_id],
    )
  ).value,
  false,
  "stale lease cannot record a receipt",
);
assert.equal(
  (
    await one(
      "SELECT offer_finish_access_delivery($1,$2,'receipt',null) value",
      [first, retry.lease_id],
    )
  ).value,
  true,
);
assert.equal(
  (await one("SELECT offer_claim_access_delivery($1) value", [first])).value,
  null,
  "provider accepted delivery is never resent",
);
await db.query(
  "UPDATE offer_access_grants SET expires_at=now()-interval '1 second' WHERE token_hash=$1",
  [alias],
);
assert.equal(
  (await one("SELECT offer_resolve_access_hash($1) value", [alias])).value,
  null,
  "expired emailed links are rejected",
);
assert.equal(
  (await one("SELECT offer_resolve_access_hash($1) value", [original])).value,
  original,
  "expiry never revokes original private links",
);
await db.query(
  "UPDATE offer_access_deliveries SET first_attempt_at=now()-interval '21 hours' WHERE id=$1",
  [recovery],
);
assert.equal(
  (await one("SELECT offer_claim_access_delivery($1) value", [recovery])).value,
  null,
);
assert.equal(
  (
    await one("SELECT status FROM offer_access_deliveries WHERE id=$1", [
      recovery,
    ])
  ).status,
  "needs_review",
  "ambiguous mail is not replayed past provider idempotency window",
);
const reclaimId = await prepare(otherOrder);
const expiredClaim = (
  await one("SELECT offer_claim_access_delivery($1) value", [reclaimId])
).value;
await db.query(
  "UPDATE offer_access_deliveries SET lease_until=now()-interval '1 second' WHERE id=$1",
  [reclaimId],
);
const reclaimed = (
  await one("SELECT offer_claim_access_delivery($1) value", [reclaimId])
).value;
assert.notEqual(
  reclaimed.lease_id,
  expiredClaim.lease_id,
  "expired lease is reclaimed with a fresh identity",
);
await db.query(
  "UPDATE offer_access_deliveries SET attempts=10,lease_until=now()-interval '1 second' WHERE id=$1",
  [reclaimId],
);
assert.equal(
  (await one("SELECT offer_claim_access_delivery($1) value", [reclaimId]))
    .value,
  null,
);
assert.equal(
  (
    await one("SELECT status FROM offer_access_deliveries WHERE id=$1", [
      reclaimId,
    ])
  ).status,
  "needs_review",
  "ten attempts stop replay",
);
for (const role of ["anon", "authenticated"]) {
  await db.exec(`RESET ROLE;SET ROLE ${role}`);
  for (const table of ["offer_access_deliveries", "offer_access_grants"]) {
    await assert.rejects(
      db.query(`SELECT * FROM ${table}`),
      /permission denied/,
    );
    await assert.rejects(
      db.query(`INSERT INTO ${table} DEFAULT VALUES`),
      /permission denied/,
    );
    await assert.rejects(db.query(`DELETE FROM ${table}`), /permission denied/);
    await assert.rejects(
      db.query(
        `UPDATE ${table} SET ${table === "offer_access_grants" ? "token_hash=token_hash" : "email=email"}`,
      ),
      /permission denied/,
    );
  }
  await assert.rejects(
    db.query("SELECT offer_prepare_access_delivery(null,'reader@example.com')"),
    /permission denied/,
  );
  await assert.rejects(
    db.query("SELECT offer_claim_access_delivery($1)", [first]),
    /permission denied/,
  );
  await assert.rejects(
    db.query("SELECT offer_freeze_access_delivery($1,$2,$3,$4)", [
      first,
      claim.lease_id,
      "x".repeat(40),
      "[]",
    ]),
    /permission denied/,
  );
  await assert.rejects(
    db.query("SELECT offer_finish_access_delivery($1,$2,$3,$4)", [
      first,
      claim.lease_id,
      "receipt",
      null,
    ]),
    /permission denied/,
  );
  await assert.rejects(
    db.query("SELECT offer_resolve_access_hash($1)", [original]),
    /permission denied/,
  );
}
// ---- Automatic retries (20260923141000): upgrade over existing data ----
await db.exec("RESET ROLE");
const initialFor = async (orderId) =>
  (
    await one("SELECT id FROM offer_access_deliveries WHERE dedupe_key=$1", [
      `initial:${orderId}`,
    ])
  ).id;
// Production shape: frozen payload, one legacy attempt days ago, stuck pending.
const stuck = await initialFor(
  await insertOrder("stuck@example.com", "fulfilled", "3".repeat(64)),
);
await db.query(
  "UPDATE offer_access_deliveries SET attempts=1,first_attempt_at=now()-interval '3 days',next_attempt_at=now()-interval '3 days',payload_cipher=$2,last_error='provider_unavailable' WHERE id=$1",
  [stuck, "frozen".repeat(8)],
);
const untouched = await initialFor(
  await insertOrder("fresh@example.com", "fulfilled", "4".repeat(64)),
);
const retrySql = readFileSync(
  "supabase/migrations/20260923141000_offer_access_retry_cron.sql",
  "utf8",
);
await db.exec(retrySql); // No pg_cron here: scheduling is skipped.
await db.exec(retrySql); // Re-running is harmless.
const row = (id) =>
  one("SELECT * FROM offer_access_deliveries WHERE id=$1", [id]);
assert.ok((await row(stuck)).uncertain_since, "legacy attempts are uncertain");
assert.match((await row(stuck)).last_error_detail, /unknown whether Resend/);
assert.equal(
  (await row(untouched)).uncertain_since,
  null,
  "unattempted deliveries are not marked uncertain",
);
await db.exec("SET ROLE service_role");
const claimFor = async (id) =>
  (await one("SELECT offer_claim_access_delivery($1) value", [id])).value;
const record = async (id, lease, outcome, extra = {}) =>
  (
    await one(
      "SELECT offer_record_access_attempt($1,$2,$3,$4,$5,$6,$7,$8) value",
      [
        id,
        lease,
        outcome,
        extra.providerId ?? null,
        extra.error ?? null,
        extra.status ?? null,
        extra.detail ?? null,
        extra.retry ?? null,
      ],
    )
  ).value;
const due = (id) =>
  db.query(
    "UPDATE offer_access_deliveries SET next_attempt_at=now()-interval '1 second' WHERE id=$1",
    [id],
  );
const secondsUntilRetry = async (id) =>
  (
    await one(
      "SELECT round(extract(epoch FROM next_attempt_at-now()))::int s FROM offer_access_deliveries WHERE id=$1",
      [id],
    )
  ).s;

assert.equal(await claimFor(stuck), null);
assert.equal((await row(stuck)).status, "needs_review");
assert.equal((await row(stuck)).last_error, "retry_window_closed");
assert.match(
  (await row(stuck)).last_error_detail,
  /Check the Resend log before requeueing/,
  "possibly-accepted legacy mail is never replayed after the idempotency window",
);
assert.equal(
  (await one("SELECT offer_requeue_access_delivery($1) value", [stuck])).value,
  true,
  "an administrator can requeue after checking the provider log",
);
assert.equal((await row(stuck)).status, "pending");
assert.equal((await row(stuck)).attempts, 0);
assert.equal((await row(stuck)).payload_cipher, "frozen".repeat(8));

// Definite rejections back off, store the status and reason, then fail.
const rejectedClaim = await claimFor(stuck);
assert.equal(rejectedClaim.attempts, 1);
assert.ok(rejectedClaim.last_attempt_at);
assert.equal(
  await record(stuck, rejectedClaim.lease_id, "not_sent", {
    error: "provider_rejected",
    status: 403,
    detail: "Resend refused to send (HTTP 403).\nDomain not verified",
    retry: 300,
  }),
  "pending",
);
let current = await row(stuck);
assert.equal(current.last_provider_status, 403);
assert.equal(current.last_error, "provider_rejected");
assert.equal(
  current.last_error_detail,
  "Resend refused to send (HTTP 403). Domain not verified",
);
assert.equal(current.uncertain_since, null, "a rejection is not uncertain");
assert.ok(Math.abs((await secondsUntilRetry(stuck)) - 300) <= 2);
assert.equal(await claimFor(stuck), null, "backoff blocks early retries");
for (const [retry, expected] of [
  [5, 60],
  [999999, 21600],
]) {
  await due(stuck);
  const lease = (await claimFor(stuck)).lease_id;
  await record(stuck, lease, "not_sent", { error: "provider_rejected", retry });
  assert.ok(
    Math.abs((await secondsUntilRetry(stuck)) - expected) <= 2,
    "retry delay is clamped",
  );
}
await db.exec("RESET ROLE");
await db.query(
  "UPDATE offer_access_deliveries SET attempts=9,next_attempt_at=now()-interval '1 second' WHERE id=$1",
  [stuck],
);
await db.exec("SET ROLE service_role");
const lastClaim = await claimFor(stuck);
assert.equal(lastClaim.attempts, 10);
assert.equal(
  await record(stuck, lastClaim.lease_id, "not_sent", {
    error: "provider_rejected",
    status: 403,
    detail: "Resend refused to send (HTTP 403).",
  }),
  "failed",
);
current = await row(stuck);
assert.equal(current.last_error, "max_attempts_reached");
assert.match(
  current.last_error_detail,
  /^Gave up after 10 attempts; Resend never accepted this email\. Last result: Resend refused/,
);
assert.equal(current.last_provider_status, 403);
await due(stuck);
assert.equal(await claimFor(stuck), null, "failed deliveries stay stopped");
assert.equal(
  (await one("SELECT offer_requeue_access_delivery($1) value", [stuck])).value,
  true,
);

// Uncertain results keep the same key but stop inside the provider window.
const unsureClaim = await claimFor(untouched);
assert.equal(
  await record(untouched, unsureClaim.lease_id, "uncertain", {
    error: "provider_uncertain",
    status: 503,
    detail: "Resend had a server error (HTTP 503).",
    retry: 300,
  }),
  "pending",
);
assert.ok((await row(untouched)).uncertain_since);
await db.exec("RESET ROLE");
await db.query(
  "UPDATE offer_access_deliveries SET uncertain_since=now()-interval '21 hours',next_attempt_at=now()-interval '1 second' WHERE id=$1",
  [untouched],
);
await db.exec("SET ROLE service_role");
assert.equal(await claimFor(untouched), null);
assert.equal((await row(untouched)).status, "needs_review");
assert.equal((await row(untouched)).last_error, "retry_window_closed");

// An interrupted attempt with a frozen payload may have been accepted.
const interruptedOrder = await (async () => {
  await db.exec("RESET ROLE");
  const id = await insertOrder(
    "crash@example.com",
    "fulfilled",
    "5".repeat(64),
  );
  await db.exec("SET ROLE service_role");
  return id;
})();
const interrupted = await initialFor(interruptedOrder);
const crashed = await claimFor(interrupted);
assert.equal(
  (
    await one("SELECT offer_freeze_access_delivery($1,$2,$3,$4) value", [
      interrupted,
      crashed.lease_id,
      "encrypted".repeat(8),
      JSON.stringify([
        { order_id: interruptedOrder, token_hash: "6".repeat(64) },
      ]),
    ])
  ).value,
  true,
);
await db.exec("RESET ROLE");
await db.query(
  "UPDATE offer_access_deliveries SET lease_until=now()-interval '1 second' WHERE id=$1",
  [interrupted],
);
await db.exec("SET ROLE service_role");
const resumed = await claimFor(interrupted);
assert.ok(resumed.uncertain_since, "lapsed frozen attempt becomes uncertain");
assert.equal(resumed.payload_cipher, "encrypted".repeat(8));
assert.equal(
  await record(interrupted, crashed.lease_id, "sent", { providerId: "late" }),
  null,
  "a lapsed lease cannot record a result",
);
await assert.rejects(
  db.query("SELECT offer_record_access_attempt($1,$2,'sent')", [
    interrupted,
    resumed.lease_id,
  ]),
  /Invalid receipt/,
);
await assert.rejects(
  db.query("SELECT offer_record_access_attempt($1,$2,'maybe')", [
    interrupted,
    resumed.lease_id,
  ]),
  /Invalid delivery outcome/,
);
assert.equal(
  await record(interrupted, resumed.lease_id, "sent", {
    providerId: "receipt-2",
    status: 200,
  }),
  "sent",
);
assert.equal((await row(interrupted)).last_error_detail, null);
await due(interrupted);
assert.equal(
  await claimFor(interrupted),
  null,
  "accepted mail is never resent",
);
assert.equal(
  (await one("SELECT offer_requeue_access_delivery($1) value", [interrupted]))
    .value,
  false,
  "accepted mail cannot be requeued",
);

// Blocked recipients stop immediately and cannot be requeued.
await db.exec("RESET ROLE");
const blocked = await initialFor(
  await insertOrder("bounced@example.com", "fulfilled", "7".repeat(64)),
);
await db.exec("SET ROLE service_role");
const blockedClaim = await claimFor(blocked);
assert.equal(
  await record(blocked, blockedClaim.lease_id, "blocked", {
    error: "recipient_suppressed",
    detail: "Not sent: this address previously bounced.",
  }),
  "needs_review",
);
assert.equal(
  (await one("SELECT offer_requeue_access_delivery($1) value", [blocked]))
    .value,
  false,
);

// A not-yet-redeployed offers-api still records through the old signature.
await db.exec("RESET ROLE");
const legacyCaller = await initialFor(
  await insertOrder("old-api@example.com", "fulfilled", "8".repeat(64)),
);
await db.exec("SET ROLE service_role");
const legacyClaim = await claimFor(legacyCaller);
assert.equal(
  (
    await one(
      "SELECT offer_finish_access_delivery($1,$2,null,'provider_unavailable') value",
      [legacyCaller, legacyClaim.lease_id],
    )
  ).value,
  true,
);
assert.equal((await row(legacyCaller)).status, "pending");
assert.ok((await row(legacyCaller)).uncertain_since);

await db.exec("RESET ROLE");
await assert.rejects(
  db.query("UPDATE offer_access_deliveries SET status='bogus' WHERE id=$1", [
    legacyCaller,
  ]),
  /check constraint/,
);
for (const role of ["anon", "authenticated"]) {
  await db.exec(`RESET ROLE;SET ROLE ${role}`);
  await assert.rejects(
    db.query("SELECT offer_record_access_attempt($1,$2,'not_sent')", [
      legacyCaller,
      legacyClaim.lease_id,
    ]),
    /permission denied/,
  );
  await assert.rejects(
    db.query("SELECT offer_requeue_access_delivery($1)", [stuck]),
    /permission denied/,
  );
}
await db.exec("RESET ROLE");

// pg_cron present: exactly one 15-minute job using the cron-secret pattern.
await db.exec(`CREATE SCHEMA cron;
CREATE TABLE cron.job(jobid bigserial PRIMARY KEY,jobname text UNIQUE,schedule text,command text);
CREATE FUNCTION cron.schedule(text,text,text) RETURNS bigint LANGUAGE sql AS $$INSERT INTO cron.job(jobname,schedule,command) VALUES($1,$2,$3) RETURNING jobid$$;
CREATE FUNCTION cron.unschedule(text) RETURNS boolean LANGUAGE sql AS $$DELETE FROM cron.job WHERE jobname=$1 RETURNING true$$;
INSERT INTO cron.job(jobname,schedule,command) VALUES('offer-access-retry-15min','* * * * *','stale');`);
await db.exec(retrySql);
await db.exec(retrySql);
const jobs = (
  await db.query(
    "SELECT schedule,command FROM cron.job WHERE jobname='offer-access-retry-15min'",
  )
).rows;
assert.equal(jobs.length, 1, "re-running replaces rather than duplicates");
assert.equal(jobs[0].schedule, "*/15 * * * *");
for (const fragment of [
  "net.http_post(timeout_milliseconds := 120000",
  "url := 'https://pwjdotliwsulqktavyxf.supabase.co/functions/v1/offers-api'",
  "'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'CRON_INVOCATION_SECRET' LIMIT 1)",
  `body := '{"action":"retry_deliveries"}'::jsonb`,
])
  assert.ok(jobs[0].command.includes(fragment), fragment);
await db.close();
console.log(
  "PASS: private offer email delivery, frozen retries/leases/receipts, recovery isolation and cooldown, hashed grants/expiry, preserved original links, uncertain-send quarantine, backoff/attempt limits with provider reasons, admin requeue, and the 15-minute retry job.",
);
