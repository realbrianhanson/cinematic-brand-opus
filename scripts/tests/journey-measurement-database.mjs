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
  "20260923171000_measure_about_page.sql",
  "20260925110000_first_ai_build_measurement.sql",
  "20260925160000_offer_journey_measurement.sql",
])
  await db.exec(readFileSync(`supabase/migrations/${file}`, "utf8"));
const token = "a".repeat(64);
const admin = "00000000-0000-4000-8000-000000000001";
const offer = async (slug) =>
  (
    await one(
      "INSERT INTO offers(slug,title,summary,status,asset_path,asset_name) VALUES($1,$1,'Useful','published','file.pdf','file.pdf') RETURNING id",
      [slug],
    )
  ).id;
const parent = await offer("starter"),
  child = await offer("next"),
  unrelated = await offer("other");
await db.query("UPDATE offers SET next_offer_id=$1 WHERE id=$2", [
  child,
  parent,
]);
const event = (type = "upsell_view", overrides = {}) => ({
  id: crypto.randomUUID(),
  type,
  path: "/offer-access",
  offer_id: child,
  parent_offer_id: parent,
  ...overrides,
});
const record = async (session, events, hash = token) =>
  (
    await one("SELECT conversion_record_events($1,$2,$3) ok", [
      session,
      hash,
      JSON.stringify(events),
    ])
  ).ok;
const session = crypto.randomUUID();
await db.exec("SET ROLE service_role");
for (const invalid of [
  event("page_view", { parent_offer_id: undefined }),
  event("upsell_view", { path: "/offer-access#token=secret" }),
  event("upsell_view", { path: "/offer-access?recover=1" }),
  event("upsell_view", { parent_offer_id: undefined }),
  event("upsell_view", { parent_offer_id: child }),
  event("upsell_view", { parent_offer_id: unrelated }),
  event("upsell_view", { placement: "offer" }),
  event("upsell_view", { destination: "external_offer" }),
])
  assert.equal(
    await record(session, [invalid]),
    false,
    "invalid private-route event rejected",
  );
assert.equal(
  await record(session, [event("upsell_accept")]),
  false,
  "no continue without preceding view",
);
assert.equal(
  await record(session, [event("upsell_decline")]),
  false,
  "no decline without preceding view",
);
const view = event();
assert.equal(await record(session, [view, event("upsell_accept")]), true);
assert.equal(await record(session, [view]), true, "retry accepted");
assert.equal(
  (
    await one(
      "SELECT count(*)::int n FROM conversion_events WHERE type='upsell_view'",
    )
  ).n,
  1,
  "idempotent view retry",
);
assert.equal(
  await record(session, [event()], "b".repeat(64)),
  false,
  "capability required",
);
await db.query("UPDATE offers SET status='draft' WHERE id=$1", [parent]);
assert.equal(
  await record(session, [event()]),
  false,
  "published parent required",
);
await db.query("UPDATE offers SET status='published' WHERE id=$1", [parent]);
await db.query("UPDATE offers SET status='draft' WHERE id=$1", [child]);
assert.equal(
  await record(session, [event()]),
  false,
  "published child required",
);
await db.query("UPDATE offers SET status='published' WHERE id=$1", [child]);
const order = async (
  offerId,
  parentId = null,
  amount = 0,
  currency = "usd",
  status = "fulfilled",
) =>
  (
    await one(
      `INSERT INTO offer_orders(offer_id,parent_order_id,email,status,token_hash,title_snapshot,asset_path_snapshot,asset_name_snapshot,amount_minor,currency,next_offer_id,next_offer_window_minutes,checkout_expires_at,fulfilled_at)
VALUES($1,$2,'fixture@example.test',$3,$4,'Fixture','file.pdf','file.pdf',$5,$6,$7,0,clock_timestamp()+interval '1 hour',CASE WHEN $3 IN ('fulfilled','refunded') THEN clock_timestamp() ELSE NULL END) RETURNING id`,
      [
        offerId,
        parentId,
        status,
        crypto.randomUUID().replaceAll("-", "").repeat(2),
        amount,
        currency,
        offerId === parent ? child : null,
      ],
    )
  ).id;
const bind = async (id, s = session, hash = token) =>
  (await one("SELECT conversion_bind_order($1,'live',$2,$3) ok", [id, s, hash]))
    .ok;
const pay = async (id, mode = "live") => {
  await db.query(
    "UPDATE offer_orders SET stripe_session_id=$2,stripe_payment_intent_id=$3 WHERE id=$1",
    [id, `cs_${id}`, `pi_${id}`],
  );
  await db.query("SELECT conversion_record_payment_mode($1,$2)", [id, mode]);
};
const firstParent = await order(parent),
  firstChild = await order(child, firstParent, 1000);
assert.equal(
  await bind(firstChild),
  true,
  "child binds to prior view of its parent/child snapshot",
);
await pay(firstChild);
assert.equal(
  await bind(firstChild, crypto.randomUUID()),
  false,
  "does not steal immutable order binding",
);
const landing = crypto.randomUUID();
assert.equal(
  await record(landing, [
    {
      id: crypto.randomUUID(),
      type: "offer_view",
      path: "/offers/next",
      offer_id: child,
    },
  ]),
  true,
);
const noStep = await order(child, await order(parent), 1000);
assert.equal(
  await bind(noStep, landing),
  false,
  "landing view cannot qualify child-order attribution",
);
const standalone = await order(child, null, 1000);
assert.equal(
  await bind(standalone, landing),
  true,
  "standalone landing binding unchanged",
);
await pay(standalone);
const wrongParent = await order(child, await order(unrelated), 1000);
assert.equal(
  await bind(wrongParent),
  false,
  "parent snapshot must point to child",
);
const early = await order(child, await order(parent), 1000);
const lateSession = crypto.randomUUID();
assert.equal(await record(lateSession, [event()]), true);
// Explicit timestamps make the ordering test independent of clock resolution.
await db.query(
  "UPDATE offer_orders SET created_at=clock_timestamp()-interval '1 second' WHERE id=$1",
  [early],
);
await db.query(
  "UPDATE conversion_sessions SET started_at=clock_timestamp()-interval '2 seconds' WHERE id=$1",
  [lateSession],
);
assert.equal(
  await bind(early, lateSession),
  false,
  "later view never gets credit",
);
// Public graph changes do not rewrite the immutable bought offer relationship.
await db.query("UPDATE offers SET next_offer_id=$1 WHERE id=$2", [
  unrelated,
  parent,
]);
assert.equal(
  await bind(firstChild),
  true,
  "historical snapshot retained after public graph edit",
);
assert.equal(
  await record(session, [event()]),
  true,
  "the original fulfilled-order follow-up remains measurable after a public graph edit",
);
assert.equal(
  await record(crypto.randomUUID(), [
    event("upsell_view", { parent_offer_id: unrelated }),
  ]),
  false,
  "historical relationship support does not admit arbitrary pairs",
);
await db.query("UPDATE offers SET next_offer_id=$1 WHERE id=$2", [
  child,
  parent,
]);
const freeSession = crypto.randomUUID();
assert.equal(
  await record(freeSession, [event(), event("upsell_accept")]),
  true,
);
const freeChild = await order(child, await order(parent));
assert.equal(await bind(freeChild, freeSession), true);
const declinedSession = crypto.randomUUID();
assert.equal(
  await record(declinedSession, [event(), event("upsell_decline")]),
  true,
);
const testChild = await order(child, await order(parent), 1000);
await bind(testChild);
await pay(testChild, "test");
const unknownChild = await order(child, await order(parent), 1000);
await bind(unknownChild);
const refundedChild = await order(child, await order(parent), 1000);
await bind(refundedChild);
await pay(refundedChild);
await db.query("UPDATE offer_orders SET status='refunded' WHERE id=$1", [
  refundedChild,
]);
const euroChild = await order(child, await order(parent), 1500, "eur");
await bind(euroChild);
await pay(euroChild);
const unmeasured = await order(child, await order(parent), 2000);
await pay(unmeasured);
await db.exec("RESET ROLE; SET ROLE authenticated");
await assert.rejects(
  () => db.query("SELECT admin_offer_journey_snapshot(30)"),
  /Administrator access required/,
);
await db.query("SELECT set_config('test.user_id',$1,false)", [admin]);
await assert.rejects(
  () => db.query("SELECT admin_offer_journey_snapshot(8)"),
  /Choose 7, 30 or 90/,
);
const report = async (days = 30) =>
  (await one("SELECT admin_offer_journey_snapshot($1) report", [days])).report;
const landingReport = (await one("SELECT admin_conversion_snapshot(30) report"))
  .report;
assert.equal(
  landingReport.summary.measured_sessions,
  1,
  "follow-up-only sessions do not dilute public landing-page denominators",
);
assert.equal(
  landingReport.sources.reduce((sum, row) => sum + row.sessions, 0),
  1,
);
let result = await report();
assert.equal(result.steps.length, 1);
assert.deepEqual(result.steps[0], {
  parent_offer_id: parent,
  parent_title: "starter",
  offer_id: child,
  title: "next",
  view_sessions: 4,
  continue_sessions: 2,
  decline_sessions: 1,
  free_claim_sessions: 1,
  paid_order_sessions: 1,
});
assert.equal(
  result.native_steps.length,
  1,
  "unrelated snapshots and standalone orders not included",
);
const native = result.native_steps[0];
assert.equal(native.free_claims, 1);
assert.equal(
  native.paid_orders,
  3,
  "actual live paid follow-ups independent of consent",
);
assert.equal(native.test_paid_orders, 1);
assert.equal(native.unknown_mode_paid_orders, 3);
assert.equal(native.refunded_orders, 1);
assert.deepEqual(
  native.revenue_by_currency,
  [
    { currency: "eur", amount_minor: 1500 },
    { currency: "usd", amount_minor: 3000 },
  ],
  "no mixed currencies, tests, unknown or refunds",
);
assert.ok(Date.parse(result.measurement_started_at) > 0);
assert.ok(!JSON.stringify(result).includes("fixture@example"));
await db.exec("RESET ROLE; SET ROLE service_role");
await db.query(
  "UPDATE conversion_sessions SET started_at=clock_timestamp()-interval '8 days' WHERE id=$1",
  [session],
);
await db.exec("RESET ROLE; SET ROLE authenticated");
const short = await report(7);
assert.equal(short.steps[0].view_sessions, 3);
assert.equal(
  short.steps[0].paid_order_sessions,
  0,
  "outcomes follow session cohort, not fulfillment count",
);
assert.equal(
  short.native_steps[0].paid_orders,
  3,
  "operational totals follow fulfillment period",
);
await db.exec("RESET ROLE; SET ROLE service_role");
await db.query("SELECT conversion_forget_session($1,$2)", [session, token]);
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
  await record(session, [event()]),
  false,
  "revocation tombstone prevents resurrection",
);
await db.query(
  "UPDATE conversion_sessions SET started_at=clock_timestamp()-interval '91 days' WHERE id=$1",
  [freeSession],
);
await db.query("SELECT conversion_cleanup()");
assert.equal(
  (
    await one(
      "SELECT count(*)::int n FROM conversion_events WHERE session_id=$1",
      [freeSession],
    )
  ).n,
  0,
);
assert.equal(
  (
    await one(
      "SELECT count(*)::int n FROM conversion_order_links WHERE session_id=$1",
      [freeSession],
    )
  ).n,
  0,
);
await db.exec("RESET ROLE; SET ROLE authenticated");
result = await report();
assert.equal(result.steps[0].view_sessions, 2);
assert.equal(result.steps[0].paid_order_sessions, 0);
assert.equal(result.steps[0].free_claim_sessions, 0);
assert.equal(
  result.native_steps[0].paid_orders,
  3,
  "forget/retention preserve operational facts",
);
for (const role of ["anon", "authenticated"]) {
  await db.exec(`RESET ROLE; SET ROLE ${role}`);
  for (const table of [
    "conversion_sessions",
    "conversion_events",
    "conversion_order_links",
    "conversion_measurement_config",
  ])
    await assert.rejects(
      () => db.query(`SELECT * FROM ${table}`),
      /permission denied/,
    );
  for (const sql of [
    "conversion_record_events(null,null,'[]','{}')",
    "conversion_bind_order(null,'live')",
  ])
    await assert.rejects(() => db.query(`SELECT ${sql}`), /permission denied/);
  if (role === "anon")
    await assert.rejects(
      () => db.query("SELECT admin_offer_journey_snapshot()"),
      /permission denied/,
    );
}
console.log(
  "PASS: follow-up identities/privacy, published relationship checks, real prior views, immutable child-order binding, consent cohorts, live/free/test/refund/currency outcomes, revocation, retention, and admin/service grants.",
);
await db.close();
