import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
const db = new PGlite();
const admin = "00000000-0000-0000-0000-000000000001";
const one = async (sql, args = []) => (await db.query(sql, args)).rows[0];
await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS; CREATE SCHEMA auth; CREATE SCHEMA storage;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('test.uid',true),'')::uuid$$;
CREATE FUNCTION public.is_admin(uuid) RETURNS boolean LANGUAGE sql AS $$SELECT $1='${admin}'::uuid$$;
GRANT USAGE ON SCHEMA public,auth,storage TO anon,authenticated,service_role;
CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
CREATE TABLE storage.objects(id uuid DEFAULT gen_random_uuid() PRIMARY KEY,bucket_id text,name text,UNIQUE(bucket_id,name));
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY; GRANT ALL ON storage.objects TO anon,authenticated,service_role;`);
for (const file of [
  "20260919110000_offers_funnels.sql",
  "20260919150000_offer_external_listings.sql",
])
  await db.exec(readFileSync(`supabase/migrations/${file}`, "utf8"));
let serial = 20;
const hash = () => String(serial++).padStart(64, "0");
async function pair(window = 240) {
  const child = await one(
    "INSERT INTO offers(slug,title,summary,status,kind,amount_minor,asset_path,asset_name,funnel_only) VALUES($1,'Original toolkit','Useful toolkit','published','paid',2700,'original/file.pdf','file.pdf',true) RETURNING *",
    [`paid-${serial++}`],
  );
  const parent = await one(
    "INSERT INTO offers(slug,title,summary,status,kind,asset_path,asset_name,next_offer_id,next_offer_window_minutes) VALUES($1,'Free guide','Useful guide','published','free','original/file.pdf','file.pdf',$2,$3) RETURNING *",
    [`parent-${serial++}`, child.id, window],
  );
  const ph = hash(),
    ch = hash();
  const p = (
    await one(
      "SELECT offer_reserve_order($1,$2,'reader@example.com','Reader',null) data",
      [parent.id, ph],
    )
  ).data;
  const c = (
    await one(
      "SELECT offer_reserve_order($1,$2,'reader@example.com','Reader',$3) data",
      [child.id, ch, ph],
    )
  ).data;
  return { p, c, ch };
}
await db.query(
  "INSERT INTO storage.objects(bucket_id,name) VALUES('offer-files','original/file.pdf')",
);
const legacy = await pair();
await db.query(
  "SELECT offer_record_checkout($1,'cs_legacy','https://checkout.stripe.com/legacy','pi_legacy')",
  [legacy.c.id],
);
await db.exec(
  readFileSync(
    "supabase/migrations/20260925120000_offer_checkout_recovery.sql",
    "utf8",
  ),
);
assert.equal(
  (await one("SELECT count(*)::int n FROM offer_checkout_attempts")).n,
  1,
  "Migration backfills prior sessions",
);
const state = async (id) => one("SELECT * FROM offer_orders WHERE id=$1", [id]);
const retry = async (c, session, attempt = 1, intent = null, token = hash()) =>
  (
    await one(
      "SELECT offer_prepare_checkout_retry($1,$2,$3,$4,$5,'https://example.com') data",
      [c.id, session, attempt, intent, token],
    )
  ).data;
const event = async (
  id,
  type,
  c,
  session,
  intent,
  attempt = 1,
  amount = 2700,
) =>
  (
    await one(
      "SELECT offer_apply_stripe_event($1,$2,$3,$4,$5,$6,'usd',$7) data",
      [id, type, session, c.id, intent, amount, attempt],
    )
  ).data;
const retainedToken = hash();
const retried = await retry(
  legacy.c,
  "cs_legacy",
  1,
  "pi_legacy",
  retainedToken,
);
assert.equal(retried.checkout_attempt, 2);
assert.equal(
  (
    await one(
      "SELECT count(*)::int n FROM offer_checkout_attempts WHERE order_id=$1",
      [legacy.c.id],
    )
  ).n,
  2,
  "Prepared attempts are journaled before the provider call",
);
assert.equal(retried.status, "pending");
assert.equal(retried.stripe_session_id, null);
assert.equal(retried.amount_minor, 2700);
assert.equal(retried.asset_path_snapshot, "original/file.pdf");
assert.equal(retried.parent_order_id, legacy.p.id);
assert.equal(retried.token_hash, legacy.ch);
assert.equal(
  (await retry(legacy.c, "cs_legacy", 1, "pi_legacy", retainedToken))
    .checkout_attempt,
  2,
  "Replay cannot reserve an additional attempt",
);
assert.equal(
  (
    await one(
      "SELECT retired_at IS NOT NULL AND unpaid_verified_at IS NOT NULL ok FROM offer_checkout_attempts WHERE order_id=$1 AND attempt=1",
      [legacy.c.id],
    )
  ).ok,
  true,
);
await assert.rejects(
  retry(legacy.c, "cs_legacy", 1, "pi_legacy", hash()),
  /changed/,
);
await assert.rejects(
  db.query(
    "SELECT offer_record_checkout($1,'cs_legacy','https://checkout.stripe.com/legacy','pi_legacy',1)",
    [legacy.c.id],
  ),
  /no longer current/,
);
assert.equal(
  (
    await event(
      "evt_old_expired",
      "checkout.session.expired",
      legacy.c,
      "cs_legacy",
      "pi_legacy",
    )
  ).ignored,
  true,
);
assert.equal(
  (
    await event(
      "evt_old_expired",
      "checkout.session.expired",
      legacy.c,
      "cs_legacy",
      "pi_legacy",
    )
  ).duplicate,
  true,
);
assert.equal((await state(legacy.c.id)).status, "pending");
await assert.rejects(
  event(
    "evt_old_paid",
    "checkout.session.completed",
    legacy.c,
    "cs_legacy",
    "pi_legacy",
  ),
  /requires review/,
);
assert.equal(
  (
    await one(
      "SELECT count(*)::int n FROM offer_stripe_events WHERE event_id='evt_old_paid'",
    )
  ).n,
  0,
  "Contradictory payment remains retryable for review",
);
await assert.rejects(
  event(
    "evt_unknown",
    "checkout.session.expired",
    legacy.c,
    "cs_wrong",
    null,
    1,
  ),
  /does not match/,
);
await assert.rejects(
  event(
    "evt_wrong_price",
    "checkout.session.completed",
    legacy.c,
    "cs_retry",
    "pi_retry",
    2,
    999,
  ),
  /amount or currency/,
);
assert.equal(
  (
    await event(
      "evt_retry_paid",
      "checkout.session.completed",
      legacy.c,
      "cs_retry",
      "pi_retry",
      2,
    )
  ).status,
  "fulfilled",
  "Webhook before record associates the correct attempt",
);
await db.query(
  "SELECT offer_record_checkout($1,'cs_retry','https://checkout.stripe.com/retry','pi_retry',2)",
  [legacy.c.id],
);
assert.equal(
  (
    await one(
      "SELECT count(*)::int n FROM offer_checkout_attempts WHERE order_id=$1",
      [legacy.c.id],
    )
  ).n,
  2,
);
assert.equal(
  (
    await event(
      "evt_old_refund",
      "charge.refunded",
      legacy.c,
      null,
      "pi_legacy",
    )
  ).ignored,
  true,
);
assert.equal(
  (await state(legacy.c.id)).status,
  "fulfilled",
  "Old refund cannot revoke the new purchase",
);
assert.equal(
  (
    await event(
      "evt_retry_refund",
      "charge.refunded",
      legacy.c,
      null,
      "pi_retry",
    )
  ).status,
  "refunded",
);
await assert.rejects(
  retry(legacy.c, "cs_retry", 2, "pi_retry"),
  /cannot be restarted/,
);
assert.equal(
  (await state(legacy.p.id)).status,
  "fulfilled",
  "Parent resource remains untouched",
);

const limited = await pair(45);
await db.query(
  "SELECT offer_record_checkout($1,'cs_window','https://checkout.stripe.com/window')",
  [limited.c.id],
);
const bounded = await retry(limited.c, "cs_window");
assert.equal(
  Date.parse(bounded.checkout_expires_at),
  Date.parse(limited.p.next_offer_deadline),
  "Retry cannot extend the original offer deadline",
);
const short = await pair(30);
await db.query(
  "SELECT offer_record_checkout($1,'cs_short','https://checkout.stripe.com/short')",
  [short.c.id],
);
await assert.rejects(retry(short.c, "cs_short"), /deadline/);
assert.equal(
  (await state(short.c.id)).checkout_attempt,
  1,
  "Rejected retry is atomic",
);
const limit = await pair(0);
for (let attempt = 1; attempt <= 4; attempt++) {
  await db.query("SELECT offer_record_checkout($1,$2,$3,null,$4)", [
    limit.c.id,
    `cs_limit${attempt}`,
    `https://checkout.stripe.com/limit${attempt}`,
    attempt,
  ]);
  if (attempt < 4) await retry(limit.c, `cs_limit${attempt}`, attempt);
}
await assert.rejects(retry(limit.c, "cs_limit4", 4), /cannot be restarted/);
const parentRefund = await pair();
await db.query(
  "SELECT offer_record_checkout($1,'cs_parent','https://checkout.stripe.com/parent')",
  [parentRefund.c.id],
);
await db.query("UPDATE offer_orders SET status='refunded' WHERE id=$1", [
  parentRefund.p.id,
]);
await assert.rejects(retry(parentRefund.c, "cs_parent"), /Parent purchase/);
await assert.rejects(retry({ id: limited.p.id }, "cs_any"), /not a follow-up/);
await assert.rejects(
  db.query("INSERT INTO offer_orders SELECT * FROM offer_orders WHERE id=$1", [
    limited.c.id,
  ]),
  /duplicate key/,
);
for (const role of ["anon", "authenticated"]) {
  await db.exec(`SET ROLE ${role}`);
  await assert.rejects(
    db.query(
      "SELECT offer_prepare_checkout_retry($1,'cs_short',1,null,$2,'https://example.com')",
      [short.c.id, hash()],
    ),
    /permission denied/,
  );
  await assert.rejects(
    db.query(
      "SELECT _offer_record_checkout_v1($1,'cs_short','https://checkout.stripe.com/short')",
      [short.c.id],
    ),
    /permission denied/,
  );
  if (role === "anon")
    await assert.rejects(
      db.query("SELECT * FROM offer_checkout_attempts"),
      /permission denied/,
    );
  else
    assert.equal(
      (await db.query("SELECT * FROM offer_checkout_attempts")).rows.length,
      0,
    );
  await db.exec("RESET ROLE");
}
await db.exec("SET ROLE service_role");
await assert.rejects(
  db.query(
    "SELECT _offer_apply_stripe_event_v1('evt_bypass','checkout.session.expired','cs_any',$1,null,null,null)",
    [short.c.id],
  ),
  /permission denied/,
);
await db.exec("RESET ROLE");
console.log(
  "Checkout recovery database checks passed: attempt fencing, immutable snapshots, old-event/refund isolation, deadline caps, replay, limits, and privileges.",
);
await db.close();
