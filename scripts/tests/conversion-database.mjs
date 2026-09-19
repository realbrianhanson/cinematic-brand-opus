import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
const db = new PGlite();
const one = async (sql, args = []) => (await db.query(sql, args)).rows[0];
await db.exec(`
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
CREATE SCHEMA auth; CREATE SCHEMA storage; CREATE SCHEMA cron;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('test.user_id',true),'')::uuid $$;
CREATE FUNCTION public.is_admin(uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT coalesce($1='00000000-0000-4000-8000-000000000001'::uuid,false) $$;
CREATE TABLE cron.job(jobname text PRIMARY KEY,schedule text,command text);
CREATE FUNCTION cron.schedule(text,text,text) RETURNS bigint LANGUAGE plpgsql AS $$ BEGIN INSERT INTO cron.job VALUES($1,$2,$3) ON CONFLICT(jobname) DO UPDATE SET schedule=excluded.schedule,command=excluded.command;RETURN 1;END $$;
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
  "20260919220000_conversion_measurement.sql",
])
  await db.exec(readFileSync(`supabase/migrations/${file}`, "utf8"));
assert.equal(
  (await one("SELECT count(*)::int n FROM conversion_sessions")).n,
  0,
  "no backfill",
);
assert.equal(
  (
    await one(
      "SELECT command FROM cron.job WHERE jobname='conversion-retention-daily'",
    )
  ).command,
  "SELECT public.conversion_cleanup()",
  "actual scheduled cleanup installed",
);
const offer = async (slug, kind = "free", currency = "usd") =>
  (
    await one(
      "INSERT INTO offers(slug,title,summary,status,asset_path,asset_name,kind,amount_minor,currency) VALUES($1,$1,'Useful','published','guide.pdf','guide.pdf',$2,$3,$4) RETURNING id",
      [slug, kind, kind === "free" ? 0 : 1000, currency],
    )
  ).id;
const free = await offer("guide"),
  paid = await offer("course", "paid"),
  eur = await offer("euro", "paid", "eur"),
  other = await offer("other");
const draft = (
  await one(
    "INSERT INTO offers(slug,title) VALUES('draft','Draft') RETURNING id",
  )
).id;
const makeEvent = (type = "offer_view", id = free, slug = "guide") => ({
  id: crypto.randomUUID(),
  type,
  path:
    type === "offer_view"
      ? `/offers/${slug}`
      : type === "shop_view"
        ? "/shop"
        : "/",
  ...(type === "offer_view" ? { offer_id: id } : {}),
});
const token = "a".repeat(64),
  wrong = "b".repeat(64);
const session = crypto.randomUUID(),
  second = crypto.randomUUID();
await db.exec("SET ROLE service_role");
const record = async (
  id,
  events,
  hash = token,
  attribution = { source: "email", medium: "newsletter", campaign: "starter" },
) =>
  (
    await one("SELECT conversion_record_events($1,$2,$3,$4) ok", [
      id,
      hash,
      JSON.stringify(events),
      JSON.stringify(attribution),
    ])
  ).ok;
const event = makeEvent();
assert.equal(
  await record(session, [
    event,
    makeEvent("page_view"),
    makeEvent("shop_view"),
  ]),
  true,
);
assert.equal(
  await record(session, [event], token, { source: "replacement" }),
  true,
);
assert.equal(
  (await one("SELECT count(*)::int n FROM conversion_events")).n,
  3,
  "idempotent event retry",
);
assert.equal(
  (await one("SELECT source FROM conversion_sessions WHERE id=$1", [session]))
    .source,
  "email",
  "attribution immutable",
);
assert.equal(
  await record(session, [makeEvent()], wrong),
  false,
  "session capability required",
);
assert.equal(
  await record(crypto.randomUUID(), [makeEvent("offer_view", draft, "draft")]),
  false,
  "published offer required",
);
assert.equal(
  await record(crypto.randomUUID(), [
    { ...makeEvent(), path: "/offers/other" },
  ]),
  false,
  "offer id must match its public URL",
);
for (const path of [
  "/admin",
  "/offer-access",
  "/offers/preview/abc",
  "/?email=person@example.com",
  "/#token=secret",
])
  assert.equal(
    await record(crypto.randomUUID(), [{ ...makeEvent("page_view"), path }]),
    false,
    `private route rejected: ${path}`,
  );
assert.equal(
  await record(
    crypto.randomUUID(),
    Array.from({ length: 11 }, () => makeEvent("page_view")),
  ),
  false,
  "batch bounded",
);
const sanitized = crypto.randomUUID();
await record(sanitized, [makeEvent("page_view")], token, {
  source: "person@example.com",
  medium: "https://secret",
  campaign: "a".repeat(65),
});
assert.deepEqual(
  await one(
    "SELECT source,medium,campaign FROM conversion_sessions WHERE id=$1",
    [sanitized],
  ),
  { source: "direct", medium: "none", campaign: "none" },
);
for (const reason of ["idle", "absolute"]) {
  const id = crypto.randomUUID();
  await record(id, [makeEvent("page_view")]);
  await db.query(
    `UPDATE conversion_sessions SET ${reason === "idle" ? "last_seen_at=now()-interval '31 minutes'" : "started_at=now()-interval '25 hours'"} WHERE id=$1`,
    [id],
  );
  assert.equal(
    await record(id, [makeEvent("page_view")]),
    false,
    `${reason} expiry cannot resurrect session`,
  );
}
const order = async (
  offerId,
  mode = "live",
  status = "fulfilled",
  amount = 0,
  currency = "usd",
) => {
  const id = (
    await one(
      `INSERT INTO offer_orders(offer_id,email,status,token_hash,title_snapshot,asset_path_snapshot,asset_name_snapshot,amount_minor,currency,next_offer_window_minutes,checkout_expires_at,fulfilled_at) VALUES($1,'fixture@example.test',$2,$3,'Fixture','guide.pdf','guide.pdf',$4,$5,0,now()+interval '1 hour',CASE WHEN $2 IN ('fulfilled','refunded') THEN clock_timestamp() ELSE NULL END) RETURNING id`,
      [
        offerId,
        status,
        crypto.randomUUID().replaceAll("-", "").repeat(2),
        amount,
        currency,
      ],
    )
  ).id;
  await one("SELECT conversion_bind_order($1,$2) ok", [id, mode]);
  if (amount > 0 && ["fulfilled", "refunded"].includes(status)) {
    await db.query(
      "UPDATE offer_orders SET stripe_session_id=$2,stripe_payment_intent_id=$3 WHERE id=$1",
      [id, `cs_${id}`, `pi_${id}`],
    );
    await one("SELECT conversion_record_payment_mode($1,$2)", [id, mode]);
  }
  return id;
};
const bind = async (id, s = session, hash = token) =>
  (await one("SELECT conversion_bind_order($1,'live',$2,$3) ok", [id, s, hash]))
    .ok;
const freeOrder = await order(free);
assert.equal(
  await bind(freeOrder),
  true,
  "actual viewed offer can be attributed",
);
const repeatedFreeOrder = await order(free);
assert.equal(await bind(repeatedFreeOrder), true);
await record(second, [makeEvent()]);
assert.equal(
  await bind(freeOrder, second),
  false,
  "order attribution cannot be reassigned",
);
assert.equal(
  await bind(await order(other)),
  false,
  "unrelated offer view cannot convert",
);
assert.equal(
  await bind(await order(free), session, wrong),
  false,
  "claim cannot forge session id alone",
);
const oldOrder = await order(free);
await db.query(
  "UPDATE offer_orders SET created_at=now()-interval '1 hour' WHERE id=$1",
  [oldOrder],
);
assert.equal(
  await bind(oldOrder),
  false,
  "replaying existing token cannot credit old order",
);
await record(session, [
  makeEvent("offer_view", paid, "course"),
  makeEvent("offer_view", eur, "euro"),
  { ...makeEvent("outbound_click"), destination: "summit", placement: "hero" },
]);
const paidOrder = await order(paid, "live", "fulfilled", 1000),
  euroOrder = await order(eur, "live", "fulfilled", 2000, "eur");
await bind(paidOrder);
await bind(euroOrder);
await order(paid, "test", "fulfilled", 5000);
await order(paid, "unknown", "fulfilled", 6000);
const pendingOrder = await order(paid, "live", "pending", 1000);
assert.equal(
  (
    await one(
      "SELECT payment_mode FROM conversion_order_facts WHERE order_id=$1",
      [pendingOrder],
    )
  ).payment_mode,
  "unknown",
  "a live configured key at reservation cannot prove an actual live payment",
);
await one("SELECT conversion_record_payment_mode($1,'live')", [pendingOrder]);
assert.equal(
  (
    await one(
      "SELECT payment_mode FROM conversion_order_facts WHERE order_id=$1",
      [pendingOrder],
    )
  ).payment_mode,
  "unknown",
  "unfulfilled orders cannot gain a verified payment mode",
);
await one("SELECT conversion_record_payment_mode($1,'test')", [paidOrder]);
assert.equal(
  (
    await one(
      "SELECT payment_mode FROM conversion_order_facts WHERE order_id=$1",
      [paidOrder],
    )
  ).payment_mode,
  "live",
  "a previously verified mode cannot be changed by a later retry",
);
const refunded = await order(paid, "live", "refunded", 7000);
await bind(refunded);
await one("SELECT conversion_record_download($1)", [freeOrder]);
const firstDownload = (
  await one(
    "SELECT first_download_at FROM conversion_order_facts WHERE order_id=$1",
    [freeOrder],
  )
).first_download_at;
await one("SELECT conversion_record_download($1)", [freeOrder]);
assert.deepEqual(
  (
    await one(
      "SELECT first_download_at FROM conversion_order_facts WHERE order_id=$1",
      [freeOrder],
    )
  ).first_download_at,
  firstDownload,
  "download counts once per order",
);
await one("SELECT conversion_record_download($1)", [refunded]);
assert.equal(
  (
    await one(
      "SELECT first_download_at FROM conversion_order_facts WHERE order_id=$1",
      [refunded],
    )
  ).first_download_at,
  null,
  "refunded order cannot gain download event",
);
await db.exec("RESET ROLE;SET ROLE authenticated");
await assert.rejects(
  db.query("SELECT admin_conversion_snapshot(30)"),
  /Administrator/,
);
await db.exec("SET test.user_id='00000000-0000-4000-8000-000000000001'");
const snapshot = async (days = 30) =>
  (await one("SELECT admin_conversion_snapshot($1) report", [days])).report;
await assert.rejects(snapshot(365), /7, 30 or 90/);
let report = await snapshot();
assert.equal(report.summary.attributed_free_claim_sessions, 1);
assert.equal(
  report.summary.attributed_paid_order_sessions,
  1,
  "two live orders still one converted session",
);
assert.equal(report.native_totals.paid_orders, 2);
assert.equal(report.native_totals.test_paid_orders, 1);
assert.equal(report.native_totals.unknown_mode_paid_orders, 1);
assert.equal(report.native_totals.refunded_orders, 1);
assert.equal(report.native_totals.download_links_issued, 1);
assert.deepEqual(
  report.native_totals.revenue_by_currency,
  [
    { currency: "eur", amount_minor: 2000 },
    { currency: "usd", amount_minor: 1000 },
  ],
  "currencies never added; test/unknown/refunded omitted",
);
assert.equal(report.daily.length, 30);
assert.equal(report.range.timezone, "UTC");
assert.equal(
  report.offers.find((r) => r.offer_id === free).free_claim_sessions,
  1,
);
assert.equal(
  report.offers.find((r) => r.offer_id === free).free_claims,
  2,
  "offer aggregates preserve multiple orders without inflating converted sessions",
);
assert.equal(
  report.sources.find((r) => r.source === "email").free_claims,
  2,
  "session preaggregation preserves every confirmed claim",
);
assert.equal(
  report.sources.find((r) => r.source === "email").paid_orders,
  2,
  "session preaggregation preserves live orders across offers",
);
assert.equal(report.offers.find((r) => r.offer_id === paid).paid_orders, 1);
assert.deepEqual(report.placements, [
  { placement: "hero", destination: "summit", clicks: 1, sessions: 1 },
]);
assert.equal(
  report.coverage.unattributed_free_claims,
  3,
  "real outcomes without qualifying link stay unattributed",
);
await db.exec("RESET ROLE;SET ROLE service_role");
await db.query(
  "UPDATE conversion_sessions SET started_at=now()-interval '8 days' WHERE id=$1",
  [session],
);
await db.exec("RESET ROLE;SET ROLE authenticated");
report = await snapshot(7);
assert.equal(
  report.summary.attributed_paid_order_sessions,
  0,
  "prior-period session is not included in current cohort funnel",
);
assert.equal(
  report.native_totals.paid_orders,
  2,
  "native period totals remain independent",
);
assert.equal(
  report.coverage.unattributed_paid_orders,
  0,
  "older known session is attributed, not falsely labelled unknown",
);
await db.exec("RESET ROLE;SET ROLE service_role");
await one("SELECT conversion_forget_session($1,$2)", [session, wrong]);
assert.equal(
  (
    await one(
      "SELECT count(*)::int n FROM conversion_order_links WHERE session_id=$1",
      [session],
    )
  ).n,
  5,
);
await one("SELECT conversion_forget_session($1,$2)", [session, token]);
assert.equal(
  await record(session, [makeEvent()]),
  false,
  "in-flight browser batch cannot recreate revoked session",
);
assert.equal(
  (
    await one(
      "SELECT count(*)::int n FROM conversion_events WHERE session_id=$1",
      [session],
    )
  ).n,
  0,
);
assert.equal(
  (
    await one(
      "SELECT count(*)::int n FROM conversion_order_links WHERE session_id=$1",
      [session],
    )
  ).n,
  0,
);
assert.equal(
  (
    await one("SELECT count(*)::int n FROM offer_orders WHERE id=$1", [
      paidOrder,
    ])
  ).n,
  1,
  "revocation preserves purchase",
);
assert.equal(
  (
    await one(
      "SELECT payment_mode FROM conversion_order_facts WHERE order_id=$1",
      [paidOrder],
    )
  ).payment_mode,
  "live",
);
await db.query(
  "UPDATE conversion_sessions SET started_at=now()-interval '91 days' WHERE id=$1",
  [second],
);
await one("SELECT conversion_cleanup()");
assert.equal(
  (
    await one(
      "SELECT count(*)::int n FROM conversion_events WHERE session_id=$1",
      [second],
    )
  ).n,
  0,
  "scheduled retention cascades events",
);
const neverRecordedSession = crypto.randomUUID();
await one("SELECT conversion_forget_session($1,$2)", [
  neverRecordedSession,
  token,
]);
assert.equal(
  await record(neverRecordedSession, [makeEvent("page_view")]),
  false,
  "withdrawal before first record prevents late initial collection",
);
for (const role of ["anon", "authenticated"]) {
  await db.exec(`RESET ROLE;SET ROLE ${role}`);
  for (const table of [
    "conversion_measurement_config",
    "conversion_sessions",
    "conversion_events",
    "conversion_order_links",
    "conversion_order_facts",
  ]) {
    await assert.rejects(
      db.query(`SELECT * FROM ${table}`),
      /permission denied/,
    );
    await assert.rejects(
      db.query(`INSERT INTO ${table} DEFAULT VALUES`),
      /permission denied/,
    );
    await assert.rejects(db.query(`DELETE FROM ${table}`), /permission denied/);
  }
  for (const call of [
    "conversion_record_events(null,null,'[]','{}')",
    "conversion_bind_order(null,'live')",
    "conversion_record_download(null)",
    "conversion_record_payment_mode(null,'live')",
    "conversion_forget_session(null,null)",
    "conversion_cleanup()",
  ])
    await assert.rejects(db.query(`SELECT ${call}`), /permission denied/);
}
await db.close();
console.log(
  "PASS: private conversion measurement, capability binding, event retries, expiry, order immutability, native/test/refund/currency separation, cohort reports, revocation, and scheduled retention.",
);
