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
  "20260923090000_offer_builder.sql",
  "20260919210000_offer_access_delivery.sql",
  "20260925120000_offer_checkout_recovery.sql",
  "20260926170000_offer_bumps_downsells.sql",
  "20260926200000_offer_experiments.sql",
  "20260926210000_downsell_measurement.sql",
])
  await db.exec(readFileSync(`supabase/migrations/${file}`, "utf8"));
const admin = "00000000-0000-4000-8000-000000000001";
const token = "a".repeat(64);
const session = crypto.randomUUID();
const offer = (
  await one(
    "INSERT INTO offers(slug,title,summary,status,asset_path,asset_name) VALUES('test-kit','Test Kit','A useful kit','published','kit.pdf','kit.pdf') RETURNING id",
  )
).id;
const copy = {
  headline: "Build your first follow-up tool",
  subheadline: "A simple starting point.",
  ctaText: "Get my kit",
};
const requestId = crypto.randomUUID();
const create = () =>
  one("SELECT admin_offer_experiment_create($1,$2,$3,$4,100,7,$5) id", [
    offer,
    "Clear outcome",
    "A more specific result should improve completed claims.",
    JSON.stringify(copy),
    requestId,
  ]);
await assert.rejects(create(), /Administrator/);
await db.exec(`SET ROLE authenticated; SET test.user_id='${admin}'`);
const experiment = (await create()).id;
assert.equal(
  (await create()).id,
  experiment,
  "uncertain save retry returns same draft",
);
let report = (await one("SELECT admin_offer_experiments() data")).data;
assert.equal(
  report[0].variant_a.ctaText,
  "Send Me the Kit",
  "control matches actual default button",
);
await assert.rejects(
  db.query("SELECT admin_offer_experiment_transition($1,2,'running')", [
    experiment,
  ]),
  /changed/,
);
await db.query("SELECT admin_offer_experiment_transition($1,1,'running')", [
  experiment,
]);
await assert.rejects(
  db.query("SELECT * FROM offer_experiment_assignments"),
  /permission denied/,
);
await db.exec("RESET ROLE; SET ROLE service_role");
const event = {
  id: crypto.randomUUID(),
  type: "offer_view",
  path: "/offers/test-kit",
  offer_id: offer,
};
await db.query("SELECT conversion_record_events($1,$2,$3)", [
  session,
  token,
  JSON.stringify([event]),
]);
const decide = async (hash = token, expose = null, variant = null) =>
  (
    await one("SELECT offer_experiment_decide($1,$2,$3,$4,$5) data", [
      offer,
      session,
      hash,
      expose,
      variant,
    ])
  ).data;
assert.equal(
  await decide("b".repeat(64)),
  null,
  "forged session capability rejected",
);
const assigned = await decide();
assert.ok(["a", "b"].includes(assigned.variant));
assert.deepEqual(
  await decide(),
  assigned,
  "assignment is stable across retries",
);
assert.deepEqual(
  Object.keys(assigned).sort(),
  ["copy", "experiment_id", "exposed", "variant"],
  "no strategy or private source data leaks",
);
assert.equal(assigned.exposed, false);
await db.exec(
  `RESET ROLE; SET ROLE authenticated; SET test.user_id='${admin}'`,
);
report = (await one("SELECT admin_offer_experiments() data")).data;
assert.deepEqual(
  report[0].results,
  [],
  "assignment without visible exposure not counted",
);
await db.exec("RESET ROLE; SET ROLE service_role");
assert.equal((await decide(token, experiment, assigned.variant)).exposed, true);
// Public browser clicks are never enough; only the verified native order state enters outcomes.
await db.exec("RESET ROLE");
const order = (
  await one(
    "INSERT INTO offer_orders(offer_id,token_hash,email,status,title_snapshot,asset_path_snapshot,asset_name_snapshot,amount_minor,currency,checkout_expires_at,fulfilled_at,created_at) VALUES($1,$2,'isolated@example.test','fulfilled','Kit','kit.pdf','kit.pdf',0,'usd',clock_timestamp()+interval '1 hour',clock_timestamp(),clock_timestamp()) RETURNING id",
    [offer, "c".repeat(64)],
  )
).id;
await db.query(
  "INSERT INTO conversion_order_links(order_id,session_id) VALUES($1,$2)",
  [order, session],
);
await db.exec(`SET ROLE authenticated; SET test.user_id='${admin}'`);
report = (await one("SELECT admin_offer_experiments() data")).data;
assert.equal(report[0].results[0].sessions, 1);
assert.equal(report[0].results[0].conversions, 1);
await db.exec("RESET ROLE");
await db.query("UPDATE offer_orders SET status='refunded' WHERE id=$1", [
  order,
]);
await db.exec(`SET ROLE authenticated; SET test.user_id='${admin}'`);
report = (await one("SELECT admin_offer_experiments() data")).data;
assert.equal(report[0].results[0].conversions, 0);
assert.equal(report[0].results[0].refunded_sessions, 1);
await db.exec("RESET ROLE");
await db.query("UPDATE offers SET summary='Changed offer' WHERE id=$1", [
  offer,
]);
assert.equal(
  (await one("SELECT state FROM offer_experiments WHERE id=$1", [experiment]))
    .state,
  "stopped",
  "changing source stops active experiment",
);
await db.exec("SET ROLE service_role");
assert.equal(await decide(), null, "stopped source never assigns");
await db.query("SELECT conversion_forget_session($1,$2)", [session, token]);
assert.equal(
  (await one("SELECT count(*)::int n FROM offer_experiment_assignments")).n,
  0,
  "withdrawal deletes experiment observations",
);
await db.exec("RESET ROLE; SET ROLE anon");
await assert.rejects(
  db.query("SELECT admin_offer_experiments()"),
  /permission denied/,
);
await assert.rejects(
  db.query("SELECT offer_experiment_decide($1,$2,$3)", [offer, session, token]),
  /permission denied/,
);

await db.exec("RESET ROLE");
async function scenario(kind, cases) {
  const slug = `fixture-${crypto.randomUUID()}`;
  const target = (
    await one(
      "INSERT INTO offers(slug,title,summary,status,kind,amount_minor,asset_path,asset_name) VALUES($1,'Test resource','Useful resource','published',$2,$3,'asset.pdf','asset.pdf') RETURNING id",
      [slug, kind, kind === "paid" ? 1000 : 0],
    )
  ).id;
  const extra = (
    await one(
      "INSERT INTO offers(slug,title,summary,status,kind,amount_minor,asset_path,asset_name) VALUES($1,'Extra','Useful extra','published','paid',500,'extra.pdf','extra.pdf') RETURNING id",
      [`${slug}-extra`],
    )
  ).id;
  await db.exec(`SET ROLE authenticated; SET test.user_id='${admin}'`);
  const exp = (
    await one(
      "SELECT admin_offer_experiment_create($1,'Verified outcomes','The alternate message should improve completed outcomes.',$2,100,7) id",
      [target, JSON.stringify(copy)],
    )
  ).id;
  await db.query("SELECT admin_offer_experiment_transition($1,1,'running')", [
    exp,
  ]);
  await db.exec("RESET ROLE; SET ROLE service_role");
  for (const item of cases) {
    const sid = crypto.randomUUID();
    await db.query("SELECT conversion_record_events($1,$2,$3)", [
      sid,
      token,
      JSON.stringify([
        {
          id: crypto.randomUUID(),
          type: "offer_view",
          path: `/offers/${slug}`,
          offer_id: target,
        },
      ]),
    ]);
    const decision = (
      await one("SELECT offer_experiment_decide($1,$2,$3) data", [
        target,
        sid,
        token,
      ])
    ).data;
    if (item.exposed !== false)
      await db.query("SELECT offer_experiment_decide($1,$2,$3,$4,$5)", [
        target,
        sid,
        token,
        exp,
        decision.variant,
      ]);
    await db.exec("RESET ROLE");
    const amount = item.bump ? 500 : kind === "paid" ? 1000 : 0;
    const id = (
      await one(
        "INSERT INTO offer_orders(offer_id,token_hash,email,status,title_snapshot,asset_path_snapshot,asset_name_snapshot,amount_minor,currency,checkout_expires_at,fulfilled_at,created_at) VALUES($1,$2,'isolated@example.test','fulfilled','Test','asset.pdf','asset.pdf',$3,'usd',clock_timestamp()+interval '1 hour',clock_timestamp(),clock_timestamp()+$4::interval) RETURNING id",
        [
          target,
          crypto.randomUUID().replaceAll("-", "").repeat(2),
          amount,
          item.early ? "-1 second" : "0 seconds",
        ],
      )
    ).id;
    if (item.bump)
      await db.query(
        "INSERT INTO offer_order_items(order_id,offer_id,role,title_snapshot,asset_path_snapshot,asset_name_snapshot,amount_minor,currency) VALUES($1,$2,'primary','Free primary','asset.pdf','asset.pdf',0,'usd'),($1,$3,'bump','Optional extra','extra.pdf','extra.pdf',500,'usd')",
        [id, target, extra],
      );
    await db.query(
      "INSERT INTO conversion_order_links(order_id,session_id) VALUES($1,$2)",
      [id, sid],
    );
    await db.query(
      "INSERT INTO conversion_order_facts(order_id,payment_mode) VALUES($1,$2)",
      [id, item.mode || "unknown"],
    );
    await db.exec("SET ROLE service_role");
  }
  await db.exec(
    `RESET ROLE; SET ROLE authenticated; SET test.user_id='${admin}'`,
  );
  const result = (await one("SELECT admin_offer_experiments() data")).data.find(
    (row) => row.id === exp,
  ).results;
  await db.exec("RESET ROLE");
  return result.reduce(
    (total, row) => ({
      sessions: total.sessions + row.sessions,
      conversions: total.conversions + row.conversions,
      test: total.test + row.test_payments,
    }),
    { sessions: 0, conversions: 0, test: 0 },
  );
}
assert.deepEqual(
  await scenario("paid", [
    { mode: "live" },
    { mode: "test" },
    { mode: "unknown" },
    { mode: "live", early: true },
    { mode: "live", exposed: false },
  ]),
  { sessions: 4, conversions: 1, test: 1 },
  "only exposed, subsequent, verified live paid orders convert; test/unknown/before-exposure excluded",
);
assert.deepEqual(
  await scenario("free", [
    { bump: true, mode: "live" },
    { bump: true, mode: "test" },
    { bump: true, mode: "unknown" },
    {},
  ]),
  { sessions: 4, conversions: 2, test: 1 },
  "free primary with live paid bump counts a claim; test and unknown baskets do not",
);

await db.exec("RESET ROLE");
const restricted = (
  await one(
    "INSERT INTO offers(slug,title,summary,status,asset_path,asset_name,funnel_only) VALUES('follow-up-only','Follow-up','Parent access needed','published','asset.pdf','asset.pdf',true) RETURNING id",
  )
).id;
await db.exec(`SET ROLE authenticated; SET test.user_id='${admin}'`);
await assert.rejects(
  db.query(
    "SELECT admin_offer_experiment_create($1,'Not a landing test','Only public landing conversions qualify.',$2)",
    [restricted, JSON.stringify(copy)],
  ),
  /public claim page/,
  "follow-up-only offers cannot enter landing experiments",
);
await db.close();
console.log("Offer experiments database checks passed");
