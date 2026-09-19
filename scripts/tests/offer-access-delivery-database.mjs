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
await db.close();
console.log(
  "PASS: private offer email delivery, frozen retries/leases/receipts, recovery isolation and cooldown, hashed grants/expiry, preserved original links, and uncertain-send quarantine.",
);
