import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const db = new PGlite();
const admin = "00000000-0000-0000-0000-000000000001";
const other = "00000000-0000-0000-0000-000000000002";
let serial = 10;
const uuid = () =>
  `00000000-0000-0000-0000-${String(serial++).padStart(12, "0")}`;
const token = () => (serial++).toString(16).padStart(64, "0");
const one = async (sql, args = []) => (await db.query(sql, args)).rows[0];
const reject = (sql, args, pattern) =>
  assert.rejects(db.query(sql, args), pattern);
await db.exec(`
  CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
  CREATE SCHEMA auth; CREATE SCHEMA storage;
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('test.uid',true),'')::uuid$$;
  CREATE FUNCTION public.is_admin(uuid) RETURNS boolean LANGUAGE sql AS $$SELECT $1='${admin}'::uuid$$;
  GRANT USAGE ON SCHEMA public,auth,storage TO anon,authenticated,service_role;
  CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
  CREATE TABLE storage.objects(id uuid DEFAULT gen_random_uuid() PRIMARY KEY,bucket_id text,name text,UNIQUE(bucket_id,name));
  ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
  GRANT ALL ON storage.objects TO anon,authenticated,service_role;
`);
await db.exec(
  readFileSync("supabase/migrations/20260919110000_offers_funnels.sql", "utf8"),
);
assert.equal((await one("SELECT public FROM storage.buckets")).public, false);

async function offer(overrides = {}) {
  const id = uuid();
  const item = {
    id,
    slug: `offer-${serial}`,
    title: "Useful guide",
    summary: "A practical guide with a real file.",
    status: "published",
    kind: "free",
    amount_minor: 0,
    asset_path: `${id}/guide.pdf`,
    asset_name: "guide.pdf",
    ...overrides,
  };
  await db.query(
    "INSERT INTO storage.objects(bucket_id,name) VALUES('offer-files',$1)",
    [item.asset_path],
  );
  const keys = Object.keys(item);
  await db.query(
    `INSERT INTO offers(${keys.join(",")}) VALUES(${keys.map((_, i) => `$${i + 1}`).join(",")})`,
    Object.values(item),
  );
  return item;
}
async function reserve(
  item,
  hash = token(),
  parent = null,
  email = "reader@example.com",
  name = "Reader",
) {
  return (
    await one("SELECT offer_reserve_order($1,$2,$3,$4,$5) AS data", [
      item.id,
      hash,
      email,
      name,
      parent,
    ])
  ).data;
}
async function event(id, type, order, extra = {}) {
  return (
    await one("SELECT offer_apply_stripe_event($1,$2,$3,$4,$5,$6,$7) AS data", [
      id,
      type,
      extra.session ?? (order ? `cs_${order.id.replaceAll("-", "")}` : null),
      order?.id ?? null,
      extra.intent ?? (order ? `pi_${order.id.replaceAll("-", "")}` : null),
      extra.amount ?? order?.amount_minor ?? null,
      extra.currency ?? order?.currency ?? null,
    ])
  ).data;
}

const free = await offer();
const draft = await offer({ status: "draft" });
const paid = await offer({
  kind: "paid",
  amount_minor: 2500,
  next_offer_id: free.id,
  next_offer_window_minutes: 30,
});
await db.exec("SET ROLE anon");
assert.equal(
  (await db.query("SELECT id,title,amount_minor FROM offers")).rows.length,
  2,
);
await reject("SELECT asset_path FROM offers", [], /permission denied/);
await reject("SELECT next_offer_id FROM offers", [], /permission denied/);
await reject("SELECT * FROM offer_orders", [], /permission denied/);
await reject("SELECT * FROM offer_stripe_events", [], /permission denied/);
await reject(
  "SELECT offer_reserve_order($1,$2,$3,$4)",
  [free.id, token(), "reader@example.com", ""],
  /permission denied/,
);
assert.equal((await db.query("SELECT * FROM storage.objects")).rows.length, 0);
await db.exec(`SET ROLE authenticated;SET test.uid='${other}'`);
assert.equal((await db.query("SELECT * FROM offers")).rows.length, 0);
assert.equal((await db.query("SELECT * FROM offer_orders")).rows.length, 0);
await reject(
  "INSERT INTO offers(slug) VALUES('unauthorized')",
  [],
  /row-level security/,
);
await reject("SELECT offer_decline_next($1)", [token()], /permission denied/);
await db.exec(`SET test.uid='${admin}'`);
assert.equal((await db.query("SELECT * FROM offers")).rows.length, 3);
const uploadPath = `${uuid()}/new.pdf`;
await db.query(
  "INSERT INTO storage.objects(bucket_id,name) VALUES('offer-files',$1)",
  [uploadPath],
);
assert.equal(
  (await db.query("SELECT * FROM storage.objects WHERE name=$1", [uploadPath]))
    .rows.length,
  1,
);
assert.equal(
  (
    await db.query("DELETE FROM storage.objects WHERE name=$1 RETURNING *", [
      uploadPath,
    ])
  ).rows.length,
  0,
);
assert.equal(
  (
    await db.query(
      "UPDATE storage.objects SET name='changed' WHERE name=$1 RETURNING *",
      [uploadPath],
    )
  ).rows.length,
  0,
);
await reject(
  "INSERT INTO storage.objects(bucket_id,name) VALUES('offer-files','../public.pdf')",
  [],
  /row-level security/,
);
await reject(
  "UPDATE offers SET amount_minor=10,kind='paid' WHERE id=$1",
  [free.id],
  /offers_price/,
);
await reject(
  "UPDATE offers SET status='published',asset_path=NULL WHERE id=$1",
  [draft.id],
  /offers_ready_to_publish/,
);
await reject(
  "UPDATE offers SET next_offer_window_minutes=1 WHERE id=$1",
  [paid.id],
  /check constraint/,
);
await db.exec("RESET ROLE");

// Graph edits and historical order ancestry have independent cycle checks.
await db
  .query("UPDATE offers SET next_offer_id=$1 WHERE id=$2", [paid.id, free.id])
  .then(
    () => assert.fail("A graph cycle should be rejected"),
    (error) => assert.match(error.message, /cannot contain a cycle/),
  );
await db.exec("SET ROLE service_role");
const rootHash = token();
const order = await reserve(
  free,
  rootHash,
  null,
  " Reader@Example.com ",
  " Reader ",
);
assert.equal(order.status, "fulfilled");
assert.equal(order.email, "reader@example.com");
assert.equal((await reserve(free, rootHash)).id, order.id);
await assert.rejects(reserve(paid, rootHash), /does not match token/);
await assert.rejects(
  reserve(free, rootHash, null, "someone@example.com"),
  /does not match token/,
);
await assert.rejects(reserve(draft), /Offer is unavailable/);
const paymentHash = token();
const pending = await reserve(paid, paymentHash);
assert.equal(pending.status, "pending");
assert.equal(pending.next_offer_deadline, null);
assert.ok(
  Math.abs(
    new Date(pending.checkout_expires_at) -
      new Date(pending.created_at) -
      3600000,
  ) < 1000,
);
const session = `cs_${pending.id.replaceAll("-", "")}`;
const intent = `pi_${pending.id.replaceAll("-", "")}`;
await assert.rejects(
  event("evt_early_refund", "charge.refunded", null, { intent }),
  /Unknown payment intent/,
);
assert.equal(
  (
    await one(
      "SELECT count(*)::int n FROM offer_stripe_events WHERE event_id='evt_early_refund'",
    )
  ).n,
  0,
);
await assert.rejects(
  event("evt_wrong_amount", "checkout.session.completed", pending, {
    amount: 1,
  }),
  /amount or currency/,
);
await assert.rejects(
  event("evt_wrong_currency", "checkout.session.completed", pending, {
    currency: "eur",
  }),
  /amount or currency/,
);
assert.equal(
  (await one("SELECT count(*)::int n FROM offer_stripe_events")).n,
  0,
);
assert.equal(
  (await event("evt_payment", "checkout.session.completed", pending)).status,
  "fulfilled",
);
const fulfilled = await one("SELECT * FROM offer_orders WHERE id=$1", [
  pending.id,
]);
assert.ok(
  Math.abs(
    new Date(fulfilled.next_offer_deadline) -
      new Date(fulfilled.fulfilled_at) -
      1800000,
  ) < 10,
);
// The webhook may arrive before the checkout request records the URL.
await db.query("SELECT offer_record_checkout($1,$2,$3)", [
  pending.id,
  session,
  "https://checkout.stripe.com/c/pay/valid",
]);
await reject(
  "SELECT offer_record_checkout($1,$2,$3)",
  [pending.id, "cs_other", "https://checkout.stripe.com/c/pay/other"],
  /does not match order/,
);
await reject(
  "SELECT offer_record_checkout($1,$2,$3)",
  [pending.id, session, "https://evil.example/checkout"],
  /Invalid checkout session/,
);
assert.equal(
  (await event("evt_payment", "checkout.session.completed", pending)).duplicate,
  true,
);
assert.equal(
  (await event("evt_late_expiry", "checkout.session.expired", pending)).status,
  "fulfilled",
);
assert.equal(
  (await event("evt_early_refund", "charge.refunded", null, { intent })).status,
  "refunded",
);
assert.equal(
  (
    await event(
      "evt_late_success",
      "checkout.session.async_payment_succeeded",
      pending,
    )
  ).status,
  "refunded",
);
assert.equal((await reserve(paid, paymentHash)).status, "refunded");
assert.equal(
  (
    await one("SELECT next_offer_deadline FROM offer_orders WHERE id=$1", [
      pending.id,
    ])
  ).next_offer_deadline.toISOString(),
  fulfilled.next_offer_deadline.toISOString(),
);
await assert.rejects(
  reserve(free, token(), paymentHash),
  /Follow-up offer is unavailable/,
);

// Only a fulfilled parent can authorize its exact follow-up; one child per parent.
const upsell = await reserve(paid);
await assert.rejects(
  reserve(free, token(), upsell.token_hash),
  /Follow-up offer is unavailable/,
);
await event("evt_parent_paid", "checkout.session.completed", upsell);
await assert.rejects(
  reserve(free, token(), upsell.token_hash, "other@example.com"),
  /Follow-up offer is unavailable/,
);
const child = await reserve(free, token(), upsell.token_hash);
assert.equal(child.parent_order_id, upsell.id);
assert.equal(
  (await reserve(free, child.token_hash, upsell.token_hash)).id,
  child.id,
);
await assert.rejects(
  reserve(free, token(), upsell.token_hash),
  /already claimed/,
);
await reject(
  "SELECT offer_decline_next($1)",
  [upsell.token_hash],
  /already claimed/,
);
const declined = await reserve(paid);
await event("evt_decline_parent", "checkout.session.completed", declined);
await db.query("SELECT offer_decline_next($1)", [declined.token_hash]);
assert.equal(
  (await one("SELECT status FROM offer_orders WHERE id=$1", [declined.id]))
    .status,
  "fulfilled",
);
await assert.rejects(
  reserve(free, token(), declined.token_hash),
  /Follow-up offer is unavailable/,
);
const timed = await reserve(paid);
await event("evt_expiring_parent", "checkout.session.completed", timed);
await db.query(
  "UPDATE offer_orders SET next_offer_deadline=now()-interval '1 second' WHERE id=$1",
  [timed.id],
);
await assert.rejects(
  reserve(free, token(), timed.token_hash),
  /Follow-up offer is unavailable/,
);

const expired = await reserve(paid);
await db.query(
  "UPDATE offer_orders SET checkout_expires_at=now()-interval '1 second' WHERE id=$1",
  [expired.id],
);
await reject(
  "SELECT offer_record_checkout($1,$2,$3)",
  [expired.id, "cs_expired", "https://checkout.stripe.com/c/pay/expired"],
  /Checkout has expired/,
);
await event("evt_expired", "checkout.session.expired", expired);
assert.equal((await reserve(paid, expired.token_hash)).status, "expired");
// A confirmed late payment grants the purchase even if expiry/failure arrived first.
assert.equal(
  (
    await event(
      "evt_delayed_paid",
      "checkout.session.async_payment_succeeded",
      expired,
    )
  ).status,
  "fulfilled",
);

await db.exec("RESET ROLE");
const only = await offer({ funnel_only: true });
const unavailableFile = await offer();
await db.query("DELETE FROM storage.objects WHERE name=$1", [
  unavailableFile.asset_path,
]);
await db.exec("SET ROLE service_role");
await assert.rejects(reserve(only), /requires a previous/);
await assert.rejects(reserve(unavailableFile), /file is unavailable/);
await db.exec("RESET ROLE");
await db.query(
  "UPDATE offers SET title='Changed title',asset_path='new/version.pdf',amount_minor=9000 WHERE id=$1",
  [paid.id],
);
assert.equal(
  (
    await one(
      "SELECT title_snapshot,amount_minor,asset_path_snapshot FROM offer_orders WHERE id=$1",
      [pending.id],
    )
  ).amount_minor,
  2500,
);
assert.equal(
  (
    await one("SELECT asset_path_snapshot FROM offer_orders WHERE id=$1", [
      pending.id,
    ])
  ).asset_path_snapshot,
  paid.asset_path,
);
await reject("DELETE FROM offers WHERE id=$1", [paid.id], /foreign key/);

let next = null;
const chain = [];
for (let i = 0; i < 11; i++) {
  const item = await offer({ next_offer_id: next });
  chain.unshift(item);
  next = item.id;
}
await db.exec("SET ROLE service_role");
let previous = null;
for (const item of chain.slice(0, 10))
  previous = await reserve(item, token(), previous?.token_hash ?? null);
await assert.rejects(
  reserve(chain[10], token(), previous.token_hash),
  /funnel limit/,
);
await db.exec("RESET ROLE");
const b = await offer();
const a = await offer({ next_offer_id: b.id });
const aOrder = await reserve(a);
await db.query("UPDATE offers SET next_offer_id=NULL WHERE id=$1", [a.id]);
await db.query("UPDATE offers SET next_offer_id=$1 WHERE id=$2", [a.id, b.id]);
const bOrder = await reserve(b, token(), aOrder.token_hash);
await assert.rejects(reserve(a, token(), bOrder.token_hash), /funnel limit/);

await db.exec(`SET ROLE authenticated;SET test.uid='${admin}'`);
assert.ok((await db.query("SELECT * FROM offer_orders")).rows.length > 0);
await reject(
  "UPDATE offer_orders SET status='fulfilled'",
  [],
  /permission denied/,
);
await reject("SELECT * FROM offer_stripe_events", [], /permission denied/);
await db.close();
console.log(
  "PASS: offer admin/public isolation, private immutable files, validated publishing, graph/ancestry cycles, immutable fulfillment snapshots, token retries, one-child eligibility, deadlines, checkout races, payment tamper checks, duplicate events, refund revocation, delayed payment recovery, and order retention.",
);
