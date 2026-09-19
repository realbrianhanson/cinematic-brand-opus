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
  if (item.asset_path)
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
// Apply the catalog migration over existing offers: no campaign is auto-listed.
await db.exec(
  readFileSync(
    "supabase/migrations/20260919123000_offer_shop_catalog.sql",
    "utf8",
  ),
);
assert.deepEqual(
  (
    await db.query(
      "SELECT show_in_shop,shop_category,shop_featured FROM offers",
    )
  ).rows,
  Array.from({ length: 3 }, () => ({
    show_in_shop: false,
    shop_category: "resource",
    shop_featured: false,
  })),
);
await db.exec(
  readFileSync(
    "supabase/migrations/20260919150000_offer_external_listings.sql",
    "utf8",
  ),
);
assert.equal(
  (
    await one(
      "SELECT count(*)::int n FROM offers WHERE checkout_mode='native' AND price_display_mode='fixed' AND external_url IS NULL AND NOT is_affiliate",
    )
  ).n,
  3,
);
await db.exec("SET ROLE anon");
assert.equal(
  (await db.query("SELECT id,title,amount_minor FROM offers")).rows.length,
  2,
);
await reject("SELECT asset_path FROM offers", [], /permission denied/);
await reject("SELECT next_offer_id FROM offers", [], /permission denied/);
await reject("SELECT * FROM offer_orders", [], /permission denied/);
await reject("SELECT * FROM offer_stripe_events", [], /permission denied/);
assert.equal(
  (
    await db.query(
      "SELECT show_in_shop,shop_category,shop_featured FROM offers",
    )
  ).rows.length,
  2,
  "catalog columns are public only on published rows",
);
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

// Catalog inclusion and funnel exclusivity remain enforced for all admin saves.
await reject(
  "UPDATE offers SET shop_category='subscription' WHERE id=$1",
  [free.id],
  /offers_shop_category/,
);
await reject(
  "UPDATE offers SET show_in_shop=true,funnel_only=true WHERE id=$1",
  [free.id],
  /offers_shop_excludes_funnel_only/,
);
await db.exec("RESET ROLE");
const hiddenCampaign = await offer({ shop_featured: true });
const exclusiveUpsell = await offer({ funnel_only: true });
const draftListed = await offer({ status: "draft", show_in_shop: true });
const archivedListed = await offer({ status: "archived", show_in_shop: true });
const listed = [];
for (const category of ["training", "resource", "tool", "course"]) {
  listed.push(
    await offer({
      show_in_shop: true,
      shop_category: category,
      shop_featured: category === "tool",
    }),
  );
}
assert.deepEqual(
  await one(
    "SELECT show_in_shop,shop_category,shop_featured FROM offers WHERE id=$1",
    [hiddenCampaign.id],
  ),
  { show_in_shop: false, shop_category: "resource", shop_featured: true },
  "featured alone does not opt an offer into the Shop",
);
await db.exec(`SET ROLE authenticated;SET test.uid='${admin}'`);
await reject(
  "UPDATE offers SET funnel_only=true WHERE id=$1",
  [listed[0].id],
  /offers_shop_excludes_funnel_only/,
);
await reject(
  "UPDATE offers SET show_in_shop=true WHERE id=$1",
  [exclusiveUpsell.id],
  /offers_shop_excludes_funnel_only/,
);
await reject(
  "UPDATE offers SET funnel_only=true WHERE id=$1",
  [draftListed.id],
  /offers_shop_excludes_funnel_only/,
);
await db.exec("SET ROLE anon");
const catalog = (
  await db.query(
    "SELECT id,shop_category,shop_featured FROM offers WHERE status='published' AND show_in_shop AND NOT funnel_only ORDER BY shop_featured DESC,updated_at DESC,id",
  )
).rows;
assert.deepEqual(
  new Set(catalog.map((item) => item.id)),
  new Set(listed.map((item) => item.id)),
);
assert.equal(catalog[0].shop_category, "tool");
assert.equal(
  (
    await db.query(
      "SELECT id FROM offers WHERE show_in_shop AND shop_category='course' AND NOT funnel_only",
    )
  ).rows[0].id,
  listed[3].id,
);
assert.equal(
  (await db.query("SELECT id FROM offers WHERE id=$1", [hiddenCampaign.id]))
    .rows.length,
  1,
  "unlisted campaigns remain available through their direct published pages",
);
assert.equal(
  (
    await db.query("SELECT id FROM offers WHERE id IN ($1,$2)", [
      draftListed.id,
      archivedListed.id,
    ])
  ).rows.length,
  0,
);
await reject(
  "SELECT asset_path FROM offers WHERE show_in_shop",
  [],
  /permission denied/,
);
await reject(
  "SELECT next_offer_id FROM offers WHERE show_in_shop",
  [],
  /permission denied/,
);
await reject(
  "UPDATE offers SET show_in_shop=true WHERE id=$1",
  [hiddenCampaign.id],
  /permission denied/,
);

// External/affiliate products are listings, never local payment or delivery orders.
await db.exec("RESET ROLE");
const external = await offer({
  checkout_mode: "external",
  price_display_mode: "provider",
  kind: "paid",
  amount_minor: 0,
  external_url:
    "https://provider.example/course?utm_source=shop&affiliate=brian#details",
  external_button_text: "Visit provider",
  is_affiliate: true,
  affiliate_disclosure: "I may earn a commission.",
  asset_path: null,
  asset_name: null,
  show_in_shop: true,
});
await offer({
  checkout_mode: "external",
  external_url: "https://provider.example/free",
  asset_path: null,
  asset_name: null,
});
await offer({
  checkout_mode: "external",
  kind: "paid",
  amount_minor: 1900,
  external_url: "https://provider.example/fixed",
  asset_path: null,
  asset_name: null,
});
const externalDraft = await offer({
  checkout_mode: "external",
  status: "draft",
  asset_path: null,
  asset_name: null,
});
await reject(
  "UPDATE offers SET status='published' WHERE id=$1",
  [externalDraft.id],
  /offers_ready_to_publish/,
);
for (const url of [
  "http://provider.example",
  "javascript:alert(1)",
  "https:///missing-host",
  "https://user:password@provider.example",
  "https://user@provider.example",
  "https://provider.example\\redirect",
  "https://provider.example/white space",
  "https://provider.example/\nnewline",
  "https://provider.example/\ttab",
  "https://provider.example/\u007fcontrol",
  "https://provider.example:99999",
  "https://[:::]",
  "https://999.999.999.999",
  "https://bad..example",
  "https://-bad.example",
  `https://provider.example/${"x".repeat(2048)}`,
]) {
  await reject(
    "UPDATE offers SET external_url=$1 WHERE id=$2",
    [url, externalDraft.id],
    /check constraint/,
  );
}
for (const url of [
  "https://provider.example",
  "HTTPS://provider.example:443/course?a=1&b=2#details",
  "https://[2001:db8::1]/course",
  "https://127.0.0.1/",
  "https://xn--bcher-kva.example/",
]) {
  assert.equal(
    (await one("SELECT offer_valid_external_url($1) valid", [url])).valid,
    true,
  );
}
await reject(
  "UPDATE offers SET price_display_mode='provider' WHERE id=$1",
  [free.id],
  /check constraint/,
);
await reject(
  "UPDATE offers SET kind='free' WHERE id=$1",
  [external.id],
  /offers_price/,
);
await reject(
  "UPDATE offers SET amount_minor=50 WHERE id=$1",
  [external.id],
  /offers_price/,
);
await reject(
  "UPDATE offers SET price_display_mode='fixed' WHERE id=$1",
  [external.id],
  /offers_price/,
);
await reject(
  "UPDATE offers SET external_button_text=$1 WHERE id=$2",
  ["x".repeat(81), external.id],
  /check constraint/,
);
await reject(
  "UPDATE offers SET affiliate_disclosure=$1 WHERE id=$2",
  ["x".repeat(1001), external.id],
  /check constraint/,
);
await reject(
  "UPDATE offers SET next_offer_id=$1 WHERE id=$2",
  [free.id, external.id],
  /offers_external_no_funnel/,
);
await reject(
  "UPDATE offers SET next_offer_window_minutes=30 WHERE id=$1",
  [external.id],
  /offers_external_no_funnel/,
);
await reject(
  "UPDATE offers SET funnel_only=true WHERE id=$1",
  [externalDraft.id],
  /offers_external_no_funnel/,
);
await reject(
  "UPDATE offers SET next_offer_id=$1 WHERE id=$2",
  [external.id, hiddenCampaign.id],
  /External listings cannot be follow-up targets/,
);
const historicalTarget = await offer();
const historicalParent = await offer({ next_offer_id: historicalTarget.id });
const parentSnapshot = await reserve(historicalParent);
await reject(
  "UPDATE offers SET checkout_mode='external',external_url='https://provider.example' WHERE id=$1",
  [historicalTarget.id],
  /current or historical orders/,
);
await db.query("UPDATE offers SET next_offer_id=NULL WHERE id=$1", [
  historicalParent.id,
]);
await reject(
  "UPDATE offers SET checkout_mode='external',external_url='https://provider.example' WHERE id=$1",
  [historicalTarget.id],
  /current or historical orders/,
);
assert.equal(
  (
    await one("SELECT next_offer_id FROM offer_orders WHERE id=$1", [
      parentSnapshot.id,
    ])
  ).next_offer_id,
  historicalTarget.id,
);

// Converting a standalone listing cannot invalidate an already issued native token.
const converted = await offer();
const convertedHash = token();
const originalOrder = await reserve(converted, convertedHash);
await db.query(
  "UPDATE offers SET checkout_mode='external',external_url='https://provider.example',asset_path=NULL,asset_name=NULL WHERE id=$1",
  [converted.id],
);
await db.exec("SET ROLE service_role");
const countBefore = (await one("SELECT count(*)::int n FROM offer_orders")).n;
await assert.rejects(
  reserve(external),
  /External listings do not support local claims/,
);
await assert.rejects(
  reserve(converted),
  /External listings do not support local claims/,
);
assert.equal(
  (await one("SELECT count(*)::int n FROM offer_orders")).n,
  countBefore,
);
const preserved = await reserve(converted, convertedHash);
assert.equal(preserved.id, originalOrder.id);
assert.equal(preserved.asset_path_snapshot, converted.asset_path);
assert.equal(preserved.status, "fulfilled");
await db.exec("RESET ROLE");
const convertedPaid = await offer({ kind: "paid", amount_minor: 3900 });
const pendingBeforeConversion = await reserve(convertedPaid);
await db.query(
  "UPDATE offers SET checkout_mode='external',price_display_mode='provider',amount_minor=0,external_url='https://provider.example' WHERE id=$1",
  [convertedPaid.id],
);
const pendingAfterConversion = await reserve(
  convertedPaid,
  pendingBeforeConversion.token_hash,
);
assert.equal(pendingAfterConversion.id, pendingBeforeConversion.id);
assert.equal(pendingAfterConversion.amount_minor, 3900);
assert.equal(pendingAfterConversion.status, "pending");
await db.exec("SET ROLE anon");
const publicExternal = await one(
  "SELECT checkout_mode,price_display_mode,external_url,external_button_text,is_affiliate,affiliate_disclosure FROM offers WHERE id=$1",
  [external.id],
);
assert.equal(publicExternal.checkout_mode, "external");
assert.equal(publicExternal.external_url, external.external_url);
assert.equal(publicExternal.is_affiliate, true);
assert.equal(
  (
    await db.query("SELECT external_url FROM offers WHERE id=$1", [
      externalDraft.id,
    ])
  ).rows.length,
  0,
);
await reject(
  "SELECT asset_path FROM offers WHERE id=$1",
  [external.id],
  /permission denied/,
);
await reject("SELECT * FROM offer_orders", [], /permission denied/);
await db.exec("RESET ROLE");
const ownerListings = readFileSync(
  "scripts/maintenance/20260919-brian-shop-listings.sql",
  "utf8",
);
await db.exec(
  "CREATE TABLE public.site_settings(site_url text,author_name text); INSERT INTO site_settings VALUES('https://member.example','Member Owner')",
);
const beforeOwnerSeed = (await one("SELECT count(*)::int n FROM offers")).n;
await assert.rejects(
  db.exec(ownerListings),
  /restricted to the Brian Hanson owner site/,
);
await db.exec("ROLLBACK");
assert.equal(
  (await one("SELECT count(*)::int n FROM offers")).n,
  beforeOwnerSeed,
);
await db.exec(
  "UPDATE site_settings SET site_url='https://brianhanson.com',author_name='Brian Hanson'",
);
await db.exec(ownerListings);
const seeded = (
  await db.query(
    "SELECT slug,checkout_mode,price_display_mode,amount_minor,asset_path,status,show_in_shop,external_url FROM offers WHERE slug IN ('pushten','app-building-workshop') ORDER BY slug",
  )
).rows;
assert.equal(seeded.length, 2);
assert.ok(
  seeded.every(
    (item) =>
      item.checkout_mode === "external" &&
      item.asset_path === null &&
      item.status === "published" &&
      item.show_in_shop,
  ),
);
assert.equal(seeded[0].price_display_mode, "fixed");
assert.equal(seeded[0].amount_minor, 700);
assert.equal(
  seeded[0].external_url,
  "https://go.aiforbusiness.com/push-ten-workshop?_go=brian60",
);
assert.equal(seeded[1].price_display_mode, "provider");
assert.equal(seeded[1].amount_minor, 0);
assert.equal(
  seeded[1].external_url,
  "https://go.aiforbusiness.com/get-pushten",
);
await assert.rejects(db.exec(ownerListings), /listing.*already exists/);
await db.exec("ROLLBACK");
assert.equal(
  (await one("SELECT count(*)::int n FROM offers")).n,
  beforeOwnerSeed + 2,
);
assert.deepEqual(
  (
    await db.query(
      "SELECT slug,checkout_mode,price_display_mode,amount_minor,asset_path,status,show_in_shop,external_url FROM offers WHERE slug IN ('pushten','app-building-workshop') ORDER BY slug",
    )
  ).rows,
  seeded,
);
await db.close();
console.log(
  "PASS: native offer/payment regressions, opt-in Shop privacy, external/affiliate URL and price validation, external claim rejection, funnel/historical-target conversion protection, and preserved native order retries after listing conversion.",
);
