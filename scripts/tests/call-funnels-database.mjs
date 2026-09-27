import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
const db = new PGlite();
const admin = randomUUID();
const member = randomUUID();
const proof = randomUUID();
const funnel = randomUUID();
const one = async (sql, args = []) => (await db.query(sql, args)).rows[0];
await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
create schema auth; create schema cron;
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
create function public.is_admin(id uuid) returns boolean language sql immutable as $$select id='${admin}'::uuid$$;
create function cron.schedule(text,text,text) returns bigint language sql as $$select 1::bigint$$;
create table offer_proof_items(id uuid primary key,title text,content text,attribution text,source_url text,approved boolean,notes text);
grant usage on schema public,auth to anon,authenticated,service_role;
`);
await db.exec(
  readFileSync("supabase/migrations/20260928090000_call_funnels.sql", "utf8"),
);
await db.exec(
  readFileSync(
    "supabase/migrations/20260928100000_call_funnel_preparation_extras.sql",
    "utf8",
  ),
);
await db.query(
  "insert into offer_proof_items values($1,'Observed result','An approved quote','Member','https://example.com/source',true,'PRIVATE proof note')",
  [proof],
);
const media = { url: "", poster: "", transcript: "" };
const config = {
  version: 1,
  theme: { mode: "dark", font: "brand", accent: "#a78bfa" },
  brand: {
    name: "Call example",
    hostName: "Host",
    hostRole: "Guide",
    hostBio: "",
    hostImage: "",
  },
  invitation: {
    audience: "Owners",
    headline: "See the next step",
    description: "Overview",
    watchPrompt: "Watch",
    video: media,
    promise: "Review the fit",
    cta: "Apply",
    ctaSubline: "",
    reassurance: "",
    proofHeading: "Results",
    closingHeadline: "Apply",
  },
  application: {
    heading: "Your application",
    intro: "Tell us",
    consentText: "I agree to application processing.",
    privacyUrl: "/privacy",
  },
  questions: [
    {
      id: "ready",
      label: "Ready for a conversation?",
      help: "",
      type: "single",
      required: true,
      options: [
        { id: "yes", label: "Ready" },
        { id: "later", label: "Later" },
      ],
    },
    {
      id: "goal",
      label: "Your goal",
      help: "",
      type: "textarea",
      required: true,
      options: [],
      showWhen: { questionId: "ready", optionId: "yes" },
    },
  ],
  qualificationRules: [
    { questionId: "ready", optionId: "later", outcome: "alternative" },
  ],
  booking: {
    url: "https://calendar.example.com/book",
    label: "Choose a time",
    minutes: 30,
    agenda: "Review goals",
  },
  preparation: {
    headline: "Prepare",
    intro: "",
    video: media,
    checklist: ["Bring one question"],
  },
  training: {
    headline: "Training",
    intro: "",
    video: media,
    chapters: [{ id: "intro", title: "Start here", seconds: 0 }],
    notesPrompt: "Notes",
  },
  alternative: {
    headline: "Another option",
    intro: "",
    video: media,
    story: "",
    benefits: [{ title: "Resources", body: "Independent support" }],
    faq: [
      {
        question: "Who is it for?",
        answer: "People who prefer self-paced support.",
      },
    ],
    cta: "Review option",
    url: "/shop",
    price: "",
    billing: "",
    proofIds: [proof],
  },
  proofIds: [proof],
  proofImages: { [proof]: "https://example.com/portrait.jpg" },
  scripts: {
    invitation: "PRIVATE invitation script",
    buyer: "PRIVATE buyer brief",
    wordsPerMinute: 150,
  },
};
const role = async (name, uid = "") =>
  db.exec(`reset role; set role ${name}; set test.uid='${uid}';`);
const save = (
  c = config,
  version = 0,
  publish = false,
  request = randomUUID(),
  active = true,
) =>
  one("select call_funnel_save($1,'example','Example',$2,$3,$4,$5,$6) result", [
    funnel,
    c,
    version,
    publish,
    active,
    request,
  ]);
await role("authenticated", member);
await assert.rejects(save(), /Admins only/);
await role("authenticated", admin);
const request = randomUUID();
const draft = (await save(config, 0, false, request)).result;
assert.equal(draft.version, 1);
assert.equal(draft.active, false);
assert.deepEqual((await save(config, 0, false, request)).result, draft);
await assert.rejects(
  save({ ...config, scripts: {} }, 0, false, request),
  /replay mismatch/,
);
await assert.rejects(save(), /revision conflict/);
await role("anon");
await assert.rejects(
  db.exec("select * from call_funnels"),
  /permission denied/,
);
await assert.rejects(
  db.query("select call_funnel_public_get('example')"),
  /permission denied/,
);
await role("authenticated", member);
assert.equal((await one("select count(*)::int n from call_funnels")).n, 0);
await assert.rejects(
  db.exec("select * from call_funnel_applications"),
  /permission denied/,
);
await assert.rejects(
  db.query("select call_funnel_admin_report($1)", [funnel]),
  /Admins only/,
);
await role("service_role");
assert.equal(
  (await one("select call_funnel_public_get('example') result")).result,
  null,
);
await role("authenticated", admin);
for (const mutate of [
  (c) => {
    c.theme.accent = "red; background:url(https://bad.example)";
  },
  (c) => {
    c.questions[0].options[1].id = "yes";
  },
  (c) => {
    c.questions[1].showWhen.questionId = "goal";
  },
  (c) => {
    c.qualificationRules[0].optionId = "unknown";
  },
  (c) => {
    c.questions[0].type = "email";
  },
  (c) => {
    c.questions[0].id = true;
  },
  (c) => {
    c.questions[0].options[0].id = true;
  },
  (c) => {
    c.training.chapters[0].id = true;
  },
  (c) => {
    c.booking.url = "javascript:alert(1)";
  },
  (c) => {
    c.booking.minutes = "30";
  },
  (c) => {
    c.application.privacyUrl = "";
  },
  (c) => {
    c.scripts.password = "private";
  },
  (c) => {
    c.alternative.url = "//bad.example";
  },
  (c) => {
    c.proofIds = [randomUUID()];
  },
  (c) => {
    c.training.chapters[0].seconds = -1;
  },
]) {
  const bad = structuredClone(config);
  mutate(bad);
  await assert.rejects(save(bad, 1, true), /Invalid|approved/);
}
// Older drafts remain valid; optional modules add strict, independently approved proof.
config.preparation.extras = {
  overview: {
    enabled: true,
    heading: "Offer overview",
    description: "Scope before the call",
    button: "Read the overview",
    url: "https://example.com/offer.pdf",
  },
  objections: {
    enabled: true,
    heading: "Questions",
    intro: "Prepare",
    items: [
      {
        enabled: true,
        question: "What should I bring?",
        answer: "One specific example.",
        video: media,
        captions: "https://example.com/captions.vtt",
      },
    ],
  },
  proofHeading: "Preparation stories",
  proofIds: [proof],
};
config.scripts.inspirationSource = "acquisition";
config.scripts.inspirationPattern = "PRIVATE original adaptation";
config.scripts.experimentNote = "PRIVATE measurement plan";
for (const mutate of [
  (c) => {
    c.preparation.extras = null;
  },
  (c) => {
    c.preparation.extras.overview.url = "http://example.com/offer.pdf";
  },
  (c) => {
    c.preparation.extras.overview.url = "";
  },
  (c) => {
    c.preparation.extras.objections.items[0].answer = "";
  },
  (c) => {
    c.preparation.extras.objections.items[0].captions = "javascript:alert(1)";
  },
  (c) => {
    c.preparation.extras.objections.items = Array(9).fill(
      c.preparation.extras.objections.items[0],
    );
  },
  (c) => {
    c.preparation.extras.proofIds = [randomUUID()];
  },
  (c) => {
    c.scripts.inspirationSource = "unknown";
  },
]) {
  const bad = structuredClone(config);
  mutate(bad);
  await assert.rejects(save(bad, 1, true), /Invalid|approved/);
}
const preparationOnly = randomUUID();
await db.exec("reset role");
await db.query(
  "insert into offer_proof_items values($1,'Preparation only','A relevant approved experience','Member','','true','PRIVATE preparation proof')",
  [preparationOnly],
);
config.preparation.extras.proofIds.push(preparationOnly);
config.proofImages[preparationOnly] =
  "https://example.com/preparation-portrait.jpg";
await role("authenticated", admin);
const published = (await save(config, 1, true)).result;
assert.equal(published.published_version, 2);
await role("service_role");
const publication = (
  await one("select call_funnel_public_get('example') result")
).result;
assert.equal(publication.id, funnel);
assert.equal(publication.revision, 2);
assert.equal(publication.proof.length, 2);
assert.deepEqual(publication.config.preparation.extras.proofIds, [
  proof,
  preparationOnly,
]);
assert.equal(
  publication.config.proofImages[preparationOnly],
  "https://example.com/preparation-portrait.jpg",
);
assert.equal(JSON.stringify(publication).includes("PRIVATE"), false);
assert.equal("scripts" in publication.config, false);
assert.equal("qualificationRules" in publication.config, false);
const token = "a".repeat(64);
const submitRequest = randomUUID();
const contact = { name: "Application fixture", email: "applicant@example.com" };
const answers = { ready: "yes", goal: "I want to improve my process." };
const submit = (
  a = answers,
  t = token,
  r = submitRequest,
  rev = 2,
  ct = contact,
  consent = true,
) =>
  one("select call_funnel_submit('example',$1,$2,$3,$4,$5,$6) result", [
    rev,
    t,
    r,
    a,
    ct,
    consent,
  ]);
await assert.rejects(
  submit(answers, token, submitRequest, 1),
  /revision unavailable/,
);
await assert.rejects(submit({ ready: "yes" }), /Required/);
await assert.rejects(submit({ ...answers, unknown: "private" }), /Unexpected/);
await assert.rejects(
  submit({ ready: "later", goal: "hidden stale text" }),
  /Unexpected/,
);
await assert.rejects(
  submit({ ready: "unknown" }),
  /Invalid application choice/,
);
await assert.rejects(
  submit(answers, token, submitRequest, 2, contact, false),
  /Invalid application request/,
);
await assert.rejects(
  submit(answers, token, submitRequest, 2, { ...contact, email: "invalid" }),
  /Invalid application details/,
);
const submitted = (await submit()).result;
assert.equal(submitted.outcome, "qualified");
assert.equal(submitted.booking.status, "unconfirmed");
assert.equal(submitted.booking.source, null);
assert.equal("answers" in submitted, false);
assert.equal("contact" in submitted, false);
assert.deepEqual((await submit()).result, submitted);
await assert.rejects(
  submit({ ...answers, goal: "changed" }),
  /replay mismatch/,
);
await assert.rejects(submit(answers, "b".repeat(64)), /replay mismatch/);
await assert.rejects(submit(answers, token, randomUUID()), /replay mismatch/);
await assert.rejects(
  one("select call_funnel_application_view($1)", ["b".repeat(64)]),
  /unavailable/,
);
const alternative = (
  await submit({ ready: "later" }, "c".repeat(64), randomUUID())
).result;
assert.equal(alternative.outcome, "alternative");
const now = Date.now();
const event = (
  key,
  type,
  offset = 0,
  reference = "provider-booking-1",
  applicationId = submitted.id,
) =>
  one(
    "select call_funnel_record_event($1,$2,$3,$4,$5,$6,'','signed_webhook',null) result",
    [
      applicationId,
      key,
      type,
      new Date(now + offset).toISOString(),
      ["booked", "rescheduled"].includes(type)
        ? new Date(now + 86400000 + offset).toISOString()
        : null,
      reference,
    ],
  );
await assert.rejects(
  event("alt-booking", "booked", 0, "ref", alternative.id),
  /not qualified/,
);
await assert.rejects(event("early-attended", "attended"), /before attendance/);
const booking = (await event("booking-1", "booked")).result;
assert.deepEqual((await event("booking-1", "booked")).result, booking);
await assert.rejects(
  event("booking-1", "booked", 0, "changed"),
  /replay mismatch/,
);
await event("cancel-1", "cancelled", 2000);
await event("late-booking", "booked", 1000);
let state = (
  await one("select call_funnel_application_view($1) result", [token])
).result;
assert.equal(state.booking.status, "cancelled");
await assert.rejects(
  event("cancelled-attendance", "attended", 2500),
  /active booking before attendance/,
);
await event("reschedule-1", "rescheduled", 3000);
await event("attended-1", "attended", 4000);
await event("provider-sale", "sale", 5000, "provider-order-reference");
state = (await one("select call_funnel_application_view($1) result", [token]))
  .result;
assert.equal(state.booking.status, "booked");
assert.equal(state.booking.source, "signed_webhook");
assert.equal(state.attendance.status, "attended");
assert.equal(state.sale.source, "signed_webhook");
await event("cancel-after-attendance", "cancelled", 4500);
assert.equal(
  (await one("select call_funnel_application_view($1) result", [token])).result
    .attendance.status,
  "unrecorded",
);
await event("reschedule-after-attendance", "rescheduled", 4600);
assert.equal(
  (await one("select call_funnel_application_view($1) result", [token])).result
    .attendance.status,
  "unrecorded",
);
await event("attended-new-slot", "attended", 4700);
await role("authenticated", member);
await assert.rejects(
  one("select call_funnel_admin_event($1,$2,'sale',now(),null,'receipt','')", [
    alternative.id,
    randomUUID(),
  ]),
  /Admins only/,
);
await assert.rejects(event("spoofed", "booked"), /permission denied/);
await role("authenticated", admin);
await assert.rejects(
  one("select call_funnel_admin_event($1,$2,'sale',now())", [
    alternative.id,
    randomUUID(),
  ]),
  /Invalid/,
);
await one(
  "select call_funnel_admin_event($1,$2,'sale',now(),null,'manual-receipt','Recorded by administrator')",
  [alternative.id, randomUUID()],
);
let report = (
  await one("select call_funnel_admin_report($1,1,0) result", [funnel])
).result;
assert.equal(report.total, 2);
assert.equal(report.hasMore, true);
assert.equal(report.applications.length, 1);
assert.equal(report.counts.qualified, 1);
assert.equal(report.counts.alternative, 1);
assert.equal(report.counts.booked, 1);
assert.equal(report.counts.attended, 1);
assert.equal(report.counts.manual_sales, 1);
assert.equal(report.counts.webhook_sales, 1);
assert.equal(
  report.applications[0].questions[0].label,
  config.questions[0].label,
);
assert.equal(JSON.stringify(report).includes(token), false);
assert.equal(JSON.stringify(report).includes("PRIVATE"), false);
// Exercise the complete bounded report under PostgreSQL's executor, including
// the set-based summary; production cardinalities should be profiled separately.
const reportPlan = await one(
  "explain (analyze, buffers, format json) select call_funnel_admin_report($1,50,0)",
  [funnel],
);
assert.equal(reportPlan["QUERY PLAN"][0].Plan["Actual Rows"], 1);
await assert.rejects(
  one("select call_funnel_admin_report($1,101,0)", [funnel]),
  /Invalid report/,
);
const changed = structuredClone(config);
changed.invitation.headline = "New draft";
await save(changed, 2, false);
await role("service_role");
assert.equal(
  (await one("select call_funnel_public_get('example') result")).result.config
    .invitation.headline,
  config.invitation.headline,
);
await role("authenticated", admin);
await save(changed, 3, true);
await role("service_role");
assert.equal(
  (await submit({ ready: "later" }, "d".repeat(64), randomUUID())).result
    .revision,
  2,
);
assert.equal(
  (await one("select call_funnel_public_get('example') result")).result
    .revision,
  4,
);
await db.exec("reset role");
await db.query("update offer_proof_items set approved=false where id=$1", [
  proof,
]);
await db.query("update offer_proof_items set approved=false where id=$1", [
  preparationOnly,
]);
await role("service_role");
const revoked = (
  await one("select call_funnel_application_view($1) result", [token])
).result;
assert.equal(revoked.proof.length, 0);
assert.deepEqual(revoked.config.proofIds, []);
assert.deepEqual(revoked.config.alternative.proofIds, []);
assert.deepEqual(revoked.config.proofImages, {});
assert.deepEqual(revoked.config.preparation.extras.proofIds, []);
await db.query(
  "update call_funnel_applications set expires_at=now()-interval '1 minute' where token_hash=$1",
  [token],
);
await assert.rejects(
  one("select call_funnel_application_view($1)", [token]),
  /expired/,
);
await db.query(
  "update call_funnel_applications set retain_until=now()-interval '1 minute' where token_hash=$1",
  [token],
);
await db.query("select call_funnel_cleanup()");
assert.equal(
  (
    await one(
      "select count(*)::int n from call_funnel_events where application_id=$1",
      [submitted.id],
    )
  ).n,
  0,
);
await role("authenticated", admin);
await save(changed, 4, false, randomUUID(), false);
await role("service_role");
assert.equal(
  (await one("select call_funnel_public_get('example') result")).result,
  null,
);
await assert.rejects(
  submit({ ready: "later" }, "e".repeat(64), randomUUID()),
  /unavailable/,
);
await db.close();
console.log(
  "Call funnel database: publication isolation, qualification, replay binding, booking provenance/order, admin reporting and retention passed.",
);
