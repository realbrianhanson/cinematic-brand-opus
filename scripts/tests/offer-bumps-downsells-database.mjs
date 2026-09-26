import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const db = new PGlite();
const admin = randomUUID();
const one = async (sql, args = []) => (await db.query(sql, args)).rows[0];
const hash = () => randomUUID().replaceAll("-", "").repeat(2);
await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
CREATE SCHEMA auth; CREATE SCHEMA storage;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('test.uid',true),'')::uuid$$;
CREATE FUNCTION public.is_admin(uuid) RETURNS boolean LANGUAGE sql AS $$SELECT $1='${admin}'::uuid$$;
GRANT USAGE ON SCHEMA public,auth,storage TO anon,authenticated,service_role;
CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
CREATE TABLE storage.objects(id uuid DEFAULT gen_random_uuid() PRIMARY KEY,bucket_id text,name text,UNIQUE(bucket_id,name));
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY; GRANT ALL ON storage.objects TO anon,authenticated,service_role;`);
for (const file of [
  "20260919110000_offers_funnels.sql",
  "20260919123000_offer_shop_catalog.sql",
  "20260919150000_offer_external_listings.sql",
  "20260923090000_offer_builder.sql",
  "20260919210000_offer_access_delivery.sql",
  "20260925120000_offer_checkout_recovery.sql",
])
  await db.exec(readFileSync(`supabase/migrations/${file}`, "utf8"));

async function offer(amount = 2000, extra = {}) {
  const id = randomUUID();
  const row = {
    id,
    slug: `offer-${id}`,
    title: `Resource ${amount}`,
    summary: "A useful download",
    status: "published",
    kind: amount ? "paid" : "free",
    amount_minor: amount,
    asset_path: `${id}/file.pdf`,
    asset_name: "file.pdf",
    ...extra,
  };
  await db.query(
    "INSERT INTO storage.objects(bucket_id,name) VALUES('offer-files',$1)",
    [row.asset_path],
  );
  const keys = Object.keys(row);
  return one(
    `INSERT INTO offers(${keys.join(",")}) VALUES(${keys.map((_, i) => `$${i + 1}`).join(",")}) RETURNING *`,
    Object.values(row),
  );
}
const legacyOffer = await offer(0);
const legacyToken = hash();
const legacy = (
  await one(
    "SELECT offer_reserve_order($1,$2,'reader@example.com','Reader',null) result",
    [legacyOffer.id, legacyToken],
  )
).result;
const oldOutbox = (
  await one("SELECT count(*)::int n FROM offer_access_deliveries")
).n;
await db.exec(
  readFileSync(
    "supabase/migrations/20260926170000_offer_bumps_downsells.sql",
    "utf8",
  ),
);
assert.equal(
  (await one("SELECT count(*)::int n FROM offer_order_items")).n,
  0,
  "No historical item backfill",
);
assert.equal(
  (await one("SELECT count(*)::int n FROM offer_access_deliveries")).n,
  oldOutbox,
  "No historical email queueing",
);
assert.deepEqual(
  (await one("SELECT offer_order_snapshot($1) result", [legacy.id])).result
    .items,
  [],
);

const cycleA = randomUUID(),
  cycleB = randomUUID();
await assert.rejects(
  db.query(
    "INSERT INTO offers(id,slug,title,next_offer_id) VALUES($1,'cycle-a','Cycle A',$2),($2,'cycle-b','Cycle B',$1)",
    [cycleA, cycleB],
  ),
  /cycle/i,
);
const bump = await offer(500);
const upsell = await offer(3000, { funnel_only: true });
const downsell = await offer(1000, { funnel_only: true });
const base = await offer(2000, {
  bump_offer_id: bump.id,
  next_offer_id: upsell.id,
  downsell_offer_id: downsell.id,
  next_offer_window_minutes: 120,
});
async function reserve(item, token = hash(), parent = null, selected = null) {
  return (
    await one(
      "SELECT offer_reserve_order($1,$2,'reader@example.com','Reader',$3,$4) result",
      [item.id, token, parent, selected],
    )
  ).result;
}
await assert.rejects(
  db.query("UPDATE offers SET amount_minor=99999999 WHERE id=$1", [base.id]),
  /Combined checkout amount/,
);
await assert.rejects(
  db.query("UPDATE offers SET amount_minor=99999999 WHERE id=$1", [bump.id]),
  /Combined checkout amount/,
);
const token = hash();
const basket = await reserve(base, token, null, bump.id);
assert.equal(basket.amount_minor, 2500);
assert.deepEqual(
  basket.items.map((i) => [i.role, i.amount_minor]),
  [
    ["primary", 2000],
    ["bump", 500],
  ],
);
assert.equal((await reserve(base, token, null, bump.id)).id, basket.id);
await assert.rejects(reserve(base, token), /does not match token/);
await assert.rejects(
  reserve(base, hash(), null, upsell.id),
  /bump is unavailable/i,
);
await assert.rejects(
  db.query("UPDATE offer_order_items SET amount_minor=1 WHERE order_id=$1", [
    basket.id,
  ]),
  /immutable/i,
);
await db.query(
  "UPDATE offers SET title='New title',amount_minor=900 WHERE id=$1",
  [bump.id],
);
assert.equal(
  (await reserve(base, token, null, bump.id)).items[1].amount_minor,
  500,
  "Replay retains the original bump price",
);
await db.exec("SET ROLE anon");
await assert.rejects(
  db.query("SELECT * FROM offer_order_items"),
  /permission denied/,
);
await db.exec("RESET ROLE");

let serial = 0;
async function fulfill(order) {
  return one(
    "SELECT offer_apply_stripe_event($1,'checkout.session.completed',$2,$3,$4,$5,'usd',1) result",
    [
      `evt_test${++serial}`,
      `cs_test${serial}`,
      order.id,
      `pi_test${serial}`,
      order.amount_minor,
    ],
  );
}
await assert.rejects(
  one(
    "SELECT offer_apply_stripe_event('evt_wrong','checkout.session.completed','cs_wrong',$1,'pi_wrong',2000,'usd',1)",
    [basket.id],
  ),
  /amount or currency/,
);
await fulfill(basket);
const fulfilled = await one("SELECT * FROM offer_orders WHERE id=$1", [
  basket.id,
]);
const deadline = fulfilled.next_offer_deadline;
const decline = async (parentToken, target) =>
  (await one("SELECT offer_decline_next($1,$2) result", [parentToken, target]))
    .result;
await decline(token, upsell.id);
await decline(token, upsell.id);
let current = await one("SELECT * FROM offer_orders WHERE id=$1", [basket.id]);
assert.ok(current.upsell_declined_at);
assert.equal(
  current.declined_at,
  null,
  "Repeating the upsell decline cannot decline the downsell",
);
assert.deepEqual(
  current.next_offer_deadline,
  deadline,
  "Declining does not reset the deadline",
);
await assert.rejects(
  reserve(upsell, hash(), token),
  /Follow-up offer is unavailable/,
);
const child = await reserve(downsell, hash(), token);
await assert.rejects(decline(token, downsell.id), /already claimed/);
await assert.rejects(reserve(downsell, hash(), token), /already claimed/);
assert.equal(child.parent_order_id, basket.id);
assert.equal(
  (await one("SELECT status FROM offer_orders WHERE id=$1", [basket.id]))
    .status,
  "fulfilled",
);

await one(
  "SELECT offer_apply_stripe_event('evt_refund','charge.refunded',null,null,'pi_test1',null,null,1)",
);
assert.equal(
  (await one("SELECT status FROM offer_orders WHERE id=$1", [basket.id]))
    .status,
  "refunded",
  "A refund revokes the whole basket",
);
assert.equal(
  (
    await one(
      "SELECT count(*)::int n FROM offer_order_items WHERE order_id=$1",
      [basket.id],
    )
  ).n,
  2,
  "Refund retains historical snapshots",
);

const free = await offer(0, {
  bump_offer_id: bump.id,
  next_offer_id: upsell.id,
  downsell_offer_id: downsell.id,
});
const freeToken = hash();
const claimed = await reserve(free, freeToken);
assert.equal(claimed.status, "fulfilled");
assert.equal(claimed.items.length, 1);
const upgraded = await reserve(free, hash(), null, bump.id);
assert.equal(
  upgraded.status,
  "pending",
  "A selected paid bump requires payment even with a free base",
);
await decline(freeToken, upsell.id);
await decline(freeToken, downsell.id);
assert.ok(
  (await one("SELECT declined_at FROM offer_orders WHERE id=$1", [claimed.id]))
    .declined_at,
);
await assert.rejects(
  reserve(downsell, hash(), freeToken),
  /Follow-up offer is unavailable/,
);
await assert.rejects(
  db.query("UPDATE offers SET downsell_offer_id=$1 WHERE id=$2", [
    base.id,
    downsell.id,
  ]),
  /cycle|requires.*follow-up/i,
);
await db.query("UPDATE offers SET status='archived' WHERE id=$1", [bump.id]);
await assert.rejects(
  reserve(base, hash(), null, bump.id),
  /bump is unavailable/i,
);
assert.equal(
  (await reserve(base, token, null, bump.id)).status,
  "refunded",
  "Historical replay survives archival",
);

// The published offer and its private draft remain separate, including new settings.
const page = {
  headline: "",
  subheadline: "",
  eyebrow: "",
  ctaText: "",
  ctaMicrocopy: "",
  focusMode: false,
  sections: [],
};
const doc = {
  offer: {
    title: "Private draft",
    slug: "private-basket",
    bump_offer_id: upsell.id,
    downsell_offer_id: downsell.id,
  },
  builder: {
    version: 1,
    strategy: {
      audience: "Private",
      traffic: "organic",
      problem: "",
      outcome: "",
      mechanism: "",
      deliverables: "",
      objections: "",
      evidence: "",
      adMessage: "",
    },
    proofIds: [],
    presentation: {
      version: 1,
      landing: page,
      upsell: page,
      thankYou: { headline: "", body: "", firstStep: "" },
    },
  },
};
const id = randomUUID();
await db.exec(`SET ROLE authenticated; SET test.uid='${admin}'`);
const saved = (
  await one("SELECT offer_builder_save($1,$2,null,null,false,$3) result", [
    id,
    doc,
    randomUUID(),
  ])
).result;
assert.equal(
  saved.offer.bump_offer_id,
  null,
  "Saving a draft does not alter public commerce settings",
);
assert.equal(saved.draft.document.offer.bump_offer_id, upsell.id);
await db.exec("RESET ROLE");
assert.equal(
  (await one("SELECT status FROM offers WHERE id=$1", [id])).status,
  "draft",
);
// Publication is atomic: invalid target settings cannot change either live data or the saved version.
const publishSource = await offer(0);
const publishDocument = {
  ...doc,
  offer: {
    title: "Published bundle",
    bump_offer_id: upsell.id,
    next_offer_id: upsell.id,
    downsell_offer_id: downsell.id,
  },
};
await db.exec(`SET ROLE authenticated; SET test.uid='${admin}'`);
const published = (
  await one("SELECT offer_builder_save($1,$2,$3,null,true,$4) result", [
    publishSource.id,
    publishDocument,
    publishSource.updated_at,
    randomUUID(),
  ])
).result;
assert.equal(published.offer.bump_offer_id, upsell.id);
assert.equal(published.offer.downsell_offer_id, downsell.id);
const invalidDoc = {
  ...publishDocument,
  offer: { ...publishDocument.offer, downsell_offer_id: upsell.id },
};
await assert.rejects(
  one("SELECT offer_builder_save($1,$2,$3,1,true,$4) result", [
    publishSource.id,
    invalidDoc,
    published.offer.updated_at,
    randomUUID(),
  ]),
  /offers_commerce_links/,
);
assert.equal(
  (
    await one("SELECT version FROM offer_builder_drafts WHERE offer_id=$1", [
      publishSource.id,
    ])
  ).version,
  1,
);
await db.exec("RESET ROLE");
const privateBump = await offer(700, { status: "draft" });
await assert.rejects(
  db.query("UPDATE offers SET bump_offer_id=$1 WHERE id=$2", [
    privateBump.id,
    publishSource.id,
  ]),
  /Publish the checkout extra/,
);
const euro = await offer(1000, { currency: "eur" });
await assert.rejects(
  db.query("UPDATE offers SET bump_offer_id=$1 WHERE id=$2", [
    euro.id,
    publishSource.id,
  ]),
  /same currency/,
);
const projection = (
  await one("SELECT offer_public_bump($1) result", [publishSource.id])
).result;
assert.equal(projection.id, upsell.id);
assert.deepEqual(
  Object.keys(projection).sort(),
  [
    "id",
    "slug",
    "title",
    "summary",
    "cover_url",
    "kind",
    "amount_minor",
    "currency",
  ].sort(),
);
await db.exec("SET ROLE anon");
assert.equal(
  (await one("SELECT offer_public_bump($1) result", [id])).result,
  null,
  "Draft source cannot reveal private settings",
);
assert.equal(
  (await one("SELECT offer_public_bump($1) result", [publishSource.id])).result
    .id,
  upsell.id,
);
await db.exec("RESET ROLE");
const expiredParentToken = hash();
const expiredParent = await reserve(free, expiredParentToken);
await db.query(
  "UPDATE offer_orders SET next_offer_deadline=now()-interval '1 second' WHERE id=$1",
  [expiredParent.id],
);
await assert.rejects(
  reserve(upsell, hash(), expiredParentToken),
  /Follow-up offer is unavailable/,
);
await decline(expiredParentToken, upsell.id);
assert.ok(
  (
    await one("SELECT declined_at FROM offer_orders WHERE id=$1", [
      expiredParent.id,
    ])
  ).declined_at,
  "A late decline ends the invitation without opening an alternative",
);
await assert.rejects(
  reserve(downsell, hash(), expiredParentToken),
  /Follow-up offer is unavailable/,
);
await db.query("UPDATE offers SET status='archived' WHERE id=$1", [upsell.id]);
assert.equal(
  (await one("SELECT offer_public_bump($1) result", [publishSource.id])).result,
  null,
  "Archived extra disappears publicly",
);
// A stale browser cannot extend an expired invitation or claim either branch.
await db.query(
  "UPDATE offer_orders SET next_offer_deadline=now()-interval '1 second' WHERE id=$1",
  [claimed.id],
);
await assert.rejects(
  reserve(downsell, hash(), freeToken),
  /Follow-up offer is unavailable/,
);
await db.close();
console.log("Native bump/downsell database invariants passed.");
