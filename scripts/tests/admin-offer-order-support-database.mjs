import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";

const db = new PGlite();
const admin = randomUUID();
const one = async (sql, args = []) => (await db.query(sql, args)).rows[0];
await db.exec(`
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
CREATE SCHEMA auth; CREATE SCHEMA storage; CREATE SCHEMA cron;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('test.uid',true),'')::uuid $$;
CREATE FUNCTION public.is_admin(uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT coalesce($1='${admin}'::uuid,false) $$;
CREATE FUNCTION cron.schedule(text,text,text) RETURNS bigint LANGUAGE sql AS $$ SELECT 1::bigint $$;
GRANT USAGE ON SCHEMA public,auth,storage TO anon,authenticated,service_role;
CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
CREATE TABLE storage.objects(id uuid DEFAULT gen_random_uuid() PRIMARY KEY,bucket_id text,name text,UNIQUE(bucket_id,name));
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
GRANT ALL ON storage.objects TO anon,authenticated,service_role;
`);
for (const file of [
  "20260919110000_offers_funnels.sql",
  "20260919123000_offer_shop_catalog.sql",
  "20260919150000_offer_external_listings.sql",
  "20260919210000_offer_access_delivery.sql",
  "20260919220000_conversion_measurement.sql",
  "20260923090000_offer_builder.sql",
  "20260925120000_offer_checkout_recovery.sql",
  "20260925140000_offer_delivery_schema_without_schedule.sql",
  "20260926170000_offer_bumps_downsells.sql",
  "20260927120000_admin_offer_order_support.sql",
])
  await db.exec(readFileSync(`supabase/migrations/${file}`, "utf8"));
const primaryOffer = (
  await one(
    "INSERT INTO offers(slug,title,summary) VALUES('support-primary','Primary','Primary guide') RETURNING id",
  )
).id;
const bumpOffer = (
  await one(
    "INSERT INTO offers(slug,title,summary) VALUES('support-extra','Extra','Extra guide') RETURNING id",
  )
).id;
const secret = "private-download-capability";
async function order({
  title = "Primary guide",
  amount = 0,
  status = "fulfilled",
  mode = null,
  name = "Support fixture",
  email = "support@example.com",
  created = "2026-09-26T12:00:00Z",
  parent = null,
} = {}) {
  const id = randomUUID();
  await db.query(
    `INSERT INTO offer_orders(id,offer_id,parent_order_id,token_hash,email,name,status,title_snapshot,asset_path_snapshot,asset_name_snapshot,amount_minor,currency,checkout_expires_at,created_at,fulfilled_at,stripe_checkout_url,stripe_payment_intent_id,checkout_retry_token_hash)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'guide.pdf',$10,'usd',now()+interval '1 hour',$11,CASE WHEN $7='fulfilled' THEN now() ELSE null END,$12,$13,$14)`,
    [
      id,
      primaryOffer,
      parent,
      randomUUID().replaceAll("-", "").repeat(2),
      email,
      name,
      status,
      title,
      secret,
      amount,
      created,
      `https://checkout.stripe.com/${secret}`,
      `pi_${id}`,
      "f".repeat(64),
    ],
  );
  if (mode)
    await db.query(
      "INSERT INTO conversion_order_facts(order_id,payment_mode,first_download_at) VALUES($1,$2,'2026-09-26T13:00:00Z')",
      [id, mode],
    );
  return id;
}
const basket = await order({
  title: "Primary basket",
  amount: 3500,
  mode: "live",
});
// Item insertion order intentionally differs from display order.
await db.query(
  `INSERT INTO offer_order_items(order_id,offer_id,role,title_snapshot,asset_path_snapshot,asset_name_snapshot,amount_minor,currency)
VALUES($1,$2,'bump','Optional 20% extra',$4,'extra.pdf',1500,'usd'),($1,$3,'primary','Primary basket',$4,'primary.pdf',2000,'usd')`,
  [basket, bumpOffer, primaryOffer, secret],
);
const test = await order({ title: "Test payment", amount: 2000, mode: "test" });
const unknown = await order({
  title: "Historical no-facts order",
  amount: 1900,
  status: "refunded",
});
const free = await order({
  title: "Free claim",
  name: "Find Unique Name",
  email: "find-unique@example.com",
});
const freeWithExtra = await order({
  title: "Free primary with paid extra",
  amount: 1500,
  mode: "live",
  parent: free,
});
await db.query(
  `INSERT INTO offer_order_items(order_id,offer_id,role,title_snapshot,asset_path_snapshot,asset_name_snapshot,amount_minor,currency)
VALUES($1,$2,'primary','Free primary',$4,'free.pdf',0,'usd'),($1,$3,'bump','Paid extra',$4,'extra.pdf',1500,'usd')`,
  [freeWithExtra, primaryOffer, bumpOffer, secret],
);
await order({ title: "Literal_under_score" });
await order({ title: "LiteralXunderXscore" });
await order({ title: "Folder\\path" });
await order({ title: "Ordinary 2000 extra" });
for (const status of ["pending", "failed", "expired"])
  await order({ title: `Status ${status}`, status, amount: 1000 });
for (let index = 0; index < 30; index++)
  await order({
    title: `Page fixture ${index}`,
    created: "2026-09-26T14:00:00Z",
  });
const addDelivery = async (id, status, created) =>
  db.query(
    `INSERT INTO offer_access_deliveries(dedupe_key,kind,email,order_ids,status,attempts,payload_cipher,provider_id,last_error,created_at,sent_at)
VALUES($1,'recovery','support@example.com',ARRAY[$2::uuid],$3,2,$4,$5,$6,$7,CASE WHEN $3='sent' THEN '2026-09-26T13:00:00Z'::timestamptz ELSE null END)`,
    [
      randomUUID(),
      id,
      status,
      secret,
      `email_${secret}`,
      secret,
      created.replace("2026", "2050"),
    ],
  );
await addDelivery(basket, "sent", "2026-09-26T12:00:00Z");
await addDelivery(basket, "failed", "2026-09-26T13:00:00Z");
await addDelivery(test, "needs_review", "2026-09-26T13:00:00Z");
const snapshot = async (query = "", status = "all", kind = "all", page = 0) =>
  (
    await one("SELECT admin_offer_order_support($1,$2,$3,$4) result", [
      query,
      status,
      kind,
      page,
    ])
  ).result;
const before = await one(
  "SELECT (SELECT count(*) FROM offer_orders)::int orders,(SELECT count(*) FROM offer_access_deliveries)::int deliveries",
);
await db.exec("SET ROLE anon");
await assert.rejects(snapshot(), /permission denied/);
await db.exec(`SET ROLE authenticated; SET test.uid='${randomUUID()}'`);
await assert.rejects(snapshot(), /Administrator access required/);
await db.exec(`SET test.uid='${admin}'`);
const first = await snapshot();
const second = await snapshot("", "all", "all", 1);
assert.equal(first.total, before.orders);
assert.equal(first.items.length, 25);
assert.equal(second.items.length, before.orders - 25);
assert.equal(
  new Set([...first.items, ...second.items].map((item) => item.id)).size,
  before.orders,
  "stable page tie-breaker has no overlaps",
);
assert.deepEqual((await snapshot("", "all", "all", 999)).items, []);
assert.equal(
  (await snapshot("", "all", "all", 999)).total,
  before.orders,
  "empty pages preserve total",
);
let item = (await snapshot(basket)).items[0];
assert.equal(item.amount_minor, 3500);
assert.equal(item.payment_mode, "live");
assert.ok(item.download_link_issued_at);
assert.deepEqual(
  item.items.map((part) => [part.role, part.amount_minor, part.file_name]),
  [
    ["primary", 2000, "primary.pdf"],
    ["bump", 1500, "extra.pdf"],
  ],
);
assert.equal(
  item.delivery.status,
  "failed",
  "latest failed recovery remains visible",
);
assert.equal(
  item.delivery.accepted_at,
  null,
  "failed delivery is not called accepted",
);
assert.equal(item.delivery.attempts, 2);
assert.equal(
  (await snapshot("20% extra")).items[0].id,
  basket,
  "item titles are searchable and percent stays literal",
);
assert.equal((await snapshot("_")).total, 1, "underscore stays literal");
assert.equal((await snapshot("\\")).total, 1, "backslash stays literal");
assert.equal((await snapshot("Find Unique Name")).items[0].id, free);
assert.equal((await snapshot("find-unique@example.com")).items[0].id, free);
assert.equal((await snapshot(test)).items[0].payment_mode, "test");
assert.equal((await snapshot(test)).items[0].delivery.status, "needs_review");
item = (await snapshot(unknown)).items[0];
assert.equal(
  item.payment_mode,
  "unknown",
  "missing facts never imply live payments",
);
assert.equal(item.download_link_issued_at, null);
assert.deepEqual(item.items, [], "historical no-item order still appears");
assert.equal(item.delivery, null, "no email is not reported as sent");
assert.equal(
  (await snapshot(freeWithExtra, "all", "paid")).total,
  1,
  "basket total defines paid filter even with a free primary",
);
assert.equal((await snapshot(freeWithExtra, "all", "free")).total, 0);
assert.equal((await snapshot(freeWithExtra)).items[0].parent_order_id, free);
for (const status of [
  "pending",
  "fulfilled",
  "failed",
  "expired",
  "refunded",
]) {
  const result = await snapshot("", status);
  assert.ok(result.items.length > 0);
  assert.ok(result.items.every((item) => item.status === status));
}
const serialized = JSON.stringify([...first.items, ...second.items]);
for (const privateValue of [
  secret,
  "token_hash",
  "checkout_retry_token_hash",
  "stripe_checkout_url",
  "stripe_payment_intent_id",
  "payload_cipher",
  "last_error",
  "asset_path_snapshot",
  "lease_id",
])
  assert.ok(
    !serialized.includes(privateValue),
    `projection excludes ${privateValue}`,
  );
for (const args of [
  [null, "all", "all", 0],
  ["x".repeat(201), "all", "all", 0],
  ["", null, "all", 0],
  ["", "bogus", "all", 0],
  ["", "all", null, 0],
  ["", "all", "bogus", 0],
  ["", "all", "all", null],
  ["", "all", "all", -1],
  ["", "all", "all", 100001],
])
  await assert.rejects(snapshot(...args), /Invalid order filters/);
await db.exec("RESET ROLE");
const after = await one(
  "SELECT (SELECT count(*) FROM offer_orders)::int orders,(SELECT count(*) FROM offer_access_deliveries)::int deliveries",
);
assert.deepEqual(after, before, "support reads create no orders or emails");
await db.exec("SET enable_seqscan=off");
const membershipPlan = await db.query(
  "EXPLAIN SELECT id FROM offer_access_deliveries WHERE order_ids @> ARRAY[$1::uuid]",
  [basket],
);
assert.ok(
  JSON.stringify(membershipPlan.rows).includes(
    "offer_access_deliveries_order_ids_idx",
  ),
  "delivery membership can use its GIN index",
);
await db.close();
console.log(
  "Admin order support checks passed: authorization, private capability exclusion, literal search, basket amounts/items, modes, delivery states, filters and pagination.",
);
