import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
const db = new PGlite();
const admin = randomUUID();
await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
CREATE SCHEMA auth; CREATE SCHEMA cron;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('test.uid',true),'')::uuid$$;
CREATE FUNCTION public.is_admin(uuid) RETURNS boolean LANGUAGE sql AS $$SELECT coalesce($1='${admin}'::uuid,false)$$;
CREATE FUNCTION cron.schedule(text,text,text) RETURNS bigint LANGUAGE sql AS $$SELECT 1::bigint$$;
GRANT USAGE ON SCHEMA public,auth TO anon,authenticated,service_role;
CREATE TABLE offers(id uuid PRIMARY KEY,slug text,title text,status text,checkout_mode text,funnel_only boolean);
CREATE TABLE offer_orders(id uuid PRIMARY KEY);
GRANT ALL ON offers TO service_role;`);
for (const file of [
  "20260919220000_conversion_measurement.sql",
  "20260926180000_funnel_journeys.sql",
  "20260927110000_funnel_journey_measurement.sql",
])
  await db.exec(readFileSync(`supabase/migrations/${file}`, "utf8"));
const one = async (sql, args = []) => (await db.query(sql, args)).rows[0];
const offer = randomUUID(),
  journey = randomUUID(),
  token = "a".repeat(64);
await db.query(
  "INSERT INTO offers VALUES($1,'offer','Offer','published','external',false)",
  [offer],
);
const graph = {
  version: 1,
  entryStepId: "question",
  steps: [
    {
      id: "question",
      kind: "choice",
      title: "What next?",
      body: "",
      options: [
        { id: "training", label: "Training" },
        { id: "provider", label: "Provider" },
      ],
      branches: { training: "offer", provider: "provider" },
      defaultStepId: "offer",
    },
    {
      id: "offer",
      kind: "offer",
      title: "Training",
      body: "",
      offerId: offer,
      nextStepId: "end",
    },
    {
      id: "provider",
      kind: "provider",
      title: "Provider",
      body: "",
      url: "https://example.com/booking?private=not-collected",
      nextStepId: "end",
    },
    { id: "end", kind: "end", title: "Finished", body: "" },
  ],
};
const role = async (name, uid = "") =>
  db.exec(`RESET ROLE; SET ROLE ${name}; SET test.uid='${uid}'`);
await role("authenticated", admin);
const save = (expected, publish = true) =>
  one(
    "SELECT funnel_journey_save($1,'example','Example',$2,$3,$4,true,$5) AS value",
    [journey, graph, expected, publish, randomUUID()],
  );
await save(0);
await save(1, false);
await save(2);
const event = (type = "step_view", step_id = "question", more = {}) => ({
  id: randomUUID(),
  slug: "example",
  revision: 1,
  step_id,
  type,
  ...more,
});
const record = async (session, events, hash = token, consent = true) =>
  (
    await one(
      "SELECT funnel_journey_record_measurement($1,$2,$3,'{}',$4) AS value",
      [session, hash, JSON.stringify(events), consent],
    )
  ).value;
const count = async (table) =>
  (await one(`SELECT count(*)::int AS n FROM ${table}`)).n;
await role("service_role");
const session = randomUUID();
for (const bad of [
  event("step_view", "missing"),
  event("step_view", "question", { revision: 2 }),
  event("step_view", "question", { revision: 999 }),
  event("step_view", "question", { answer: "private text" }),
  event("step_continue", "question", { option_id: "email-me" }),
  event("provider_handoff", "question"),
  event("offer_handoff", "provider"),
  event("step_continue", "end"),
])
  assert.equal(
    await record(session, [bad]),
    false,
    "invalid graph/revision/step/action cannot create data",
  );
assert.equal(
  await record(session, [event()], token, false),
  false,
  "consent is explicit even at SQL boundary",
);
assert.equal(await count("conversion_sessions"), 0);
assert.equal(
  await record(session, [
    event("step_continue", "question", { option_id: "training" }),
  ]),
  false,
  "actions require a view",
);
assert.equal(
  await count("conversion_sessions"),
  0,
  "rejected action batch rolls back its session",
);
const first = event();
assert.equal(
  await record(session, [
    first,
    event("step_continue", "question", { option_id: "training" }),
    event("step_view", "offer"),
    event("offer_handoff", "offer"),
  ]),
  true,
  "a pinned older published revision remains measurable",
);
assert.equal(await record(session, [first]), true);
assert.equal(
  await record(session, [
    event(),
    event("step_continue", "question", { option_id: "provider" }),
    event("offer_handoff", "offer"),
  ]),
  true,
  "semantic duplicates do not inflate sessions/actions",
);
assert.equal(await count("funnel_journey_measurement_events"), 4);
assert.equal(
  (
    await one(
      "SELECT option_id,next_step_id FROM funnel_journey_measurement_events WHERE type='step_continue'",
    )
  ).option_id,
  "training",
  "first branch action remains stable",
);
assert.equal(
  await record(session, [event("step_view", "end")], "b".repeat(64)),
  false,
  "session ID alone is not a capability",
);
assert.equal(
  await record(session, [{ ...first, step_id: "end" }]),
  false,
  "mismatching event retry is rejected",
);
const incomplete = randomUUID(),
  resumed = randomUUID(),
  latest = randomUUID();
assert.equal(await record(incomplete, [event()]), true);
assert.equal(
  await record(resumed, [
    event("step_view", "provider"),
    event("provider_handoff", "provider"),
  ]),
  true,
);
assert.equal(
  await record(latest, [event("step_view", "question", { revision: 3 })]),
  true,
);
await db.query(
  "UPDATE conversion_sessions SET started_at=now()-interval '40 minutes',last_seen_at=now()-interval '31 minutes' WHERE id=$1",
  [incomplete],
);
await db.query(
  "UPDATE funnel_journey_measurement_events SET created_at=now()-interval '35 minutes' WHERE session_id=$1",
  [incomplete],
);
assert.equal(
  await record(incomplete, [event("step_view", "end")]),
  false,
  "inactive session cannot resume measurement under old capability",
);
await role("authenticated", admin);
let report = (await one("SELECT admin_funnel_journey_measurement(7) AS value"))
  .value;
assert.equal(
  report.revisions.length,
  2,
  "published revisions remain separate cohorts",
);
const old = report.revisions.find((r) => r.revision === 1);
assert.equal(old.measured_sessions, 3);
assert.equal(
  old.entry_sessions,
  2,
  "resumed visits are not invented entry views",
);
const question = old.steps.find((s) => s.step_id === "question");
assert.equal(question.view_sessions, 2);
assert.equal(question.continue_sessions, 1);
assert.equal(question.no_next_action_sessions, 1);
assert.equal(question.still_active_sessions, 0);
assert.equal(question.branches[0].sessions, 1);
assert.equal(
  old.steps.find((s) => s.step_id === "offer").no_next_action_sessions,
  0,
  "handoff is not misreported as abandonment",
);
assert.equal(
  report.revisions.find((r) => r.revision === 3).steps[0].still_active_sessions,
  1,
);
assert.equal(JSON.stringify(report).includes("private=not-collected"), false);
await assert.rejects(
  one("SELECT admin_funnel_journey_measurement(1)"),
  /Choose 7/,
);
await assert.rejects(
  db.query("SELECT * FROM funnel_journey_measurement_events"),
  /permission denied/,
);
await assert.rejects(record(randomUUID(), [event()]), /permission denied/);
await role("authenticated", randomUUID());
await assert.rejects(
  one("SELECT admin_funnel_journey_measurement()"),
  /Administrator access/,
);
await role("anon");
await assert.rejects(
  one("SELECT admin_funnel_journey_measurement()"),
  /permission denied/,
);
await assert.rejects(record(randomUUID(), [event()]), /permission denied/);
await role("service_role");
await one("SELECT conversion_forget_session($1,$2)", [session, "b".repeat(64)]);
assert.equal(
  (
    await one(
      "SELECT count(*)::int n FROM funnel_journey_measurement_events WHERE session_id=$1",
      [session],
    )
  ).n,
  4,
  "wrong capability cannot erase",
);
await one("SELECT conversion_forget_session($1,$2)", [session, token]);
assert.equal(
  (
    await one(
      "SELECT count(*)::int n FROM funnel_journey_measurement_events WHERE session_id=$1",
      [session],
    )
  ).n,
  0,
);
assert.equal(
  await record(session, [first]),
  false,
  "withdrawal tombstone rejects delayed retries",
);
const beforeRecord = randomUUID();
await one("SELECT conversion_forget_session($1,$2)", [beforeRecord, token]);
assert.equal(
  await record(beforeRecord, [event()]),
  false,
  "withdrawal before first record is permanent",
);
await db.query(
  "UPDATE conversion_sessions SET started_at=now()-interval '91 days' WHERE id=$1",
  [resumed],
);
await one("SELECT conversion_cleanup()");
assert.equal(
  (
    await one(
      "SELECT count(*)::int n FROM funnel_journey_measurement_events WHERE session_id=$1",
      [resumed],
    )
  ).n,
  0,
  "existing cleanup cascades new measurement rows",
);
await db.exec("UPDATE funnel_journeys SET active=false");
assert.equal(
  await record(randomUUID(), [event()]),
  false,
  "paused journeys reject collection",
);
assert.equal(
  await count("funnel_journey_sessions"),
  0,
  "measurement never creates or reads functional sessions",
);
await db.close();
console.log(
  "PASS: connected journey measurement consent, published graph/revision validation, capabilities, dedup, branch cohorts, privacy grants, erasure and retention.",
);
