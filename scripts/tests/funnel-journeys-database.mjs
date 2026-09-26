import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
const db = new PGlite();
const admin = "00000000-0000-4000-8000-000000000001";
const member = "00000000-0000-4000-8000-000000000002";
await db.exec(`create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create schema cron;
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
create function public.is_admin(id uuid) returns boolean language sql immutable as $$select id='${admin}'::uuid$$;
create function cron.schedule(text,text,text) returns bigint language sql as $$select 1::bigint$$;
create table offers(id uuid primary key,slug text,title text,status text,kind text,checkout_mode text,funnel_only boolean);
create table site_settings(site_url text,author_name text); grant all on offers to service_role;
grant usage on schema public,auth to anon,authenticated,service_role;`);
await db.exec(
  readFileSync(
    "supabase/migrations/20260926180000_funnel_journeys.sql",
    "utf8",
  ),
);
const one = async (sql, args = []) => (await db.query(sql, args)).rows[0];
const offerId = randomUUID(),
  journey = randomUUID();
const hash = "a".repeat(64);
await db.query(
  "insert into offers values($1,'real-offer','Real offer','published','free','native',false)",
  [offerId],
);
const graph = {
  version: 1,
  entryStepId: "question",
  steps: [
    {
      id: "question",
      kind: "choice",
      title: "Choose support",
      body: "No personal details.",
      options: [
        { id: "help", label: "Offer" },
        { id: "myself", label: "Independent" },
      ],
      branches: { help: "offer" },
      defaultStepId: "finish",
    },
    {
      id: "offer",
      kind: "offer",
      title: "Review offer",
      body: "Open existing offer.",
      offerId,
      nextStepId: "finish",
    },
    {
      id: "finish",
      kind: "end",
      title: "Continue independently",
      body: "Your choice.",
    },
  ],
};
const save = (
  g = graph,
  version = 0,
  publish = false,
  request = randomUUID(),
  title = "Original",
  active = true,
) =>
  one("select funnel_journey_save($1,$2,$3,$4,$5,$6,$7,$8) result", [
    journey,
    "journey",
    title,
    g,
    version,
    publish,
    active,
    request,
  ]);
const role = async (name, uid = "") =>
  db.exec(`reset role; set role ${name}; set test.uid='${uid}';`);
const publicJourney = () =>
  one("select funnel_public_journey('journey') result");
await role("authenticated", member);
await assert.rejects(save(), /Admins only/);
await role("authenticated", admin);
const request = randomUUID();
const first = await save(graph, 0, false, request);
assert.equal(first.result.version, 1);
assert.equal(first.result.active, false);
assert.deepEqual((await save(graph, 0, false, request)).result, first.result);
await assert.rejects(
  save(graph, 0, false, request, "Changed"),
  /replay mismatch/,
);
await assert.rejects(save(graph, 0, false), /revision conflict/);
await role("authenticated", member);
assert.equal((await one("select count(*)::int n from funnel_journeys")).n, 0);
await assert.rejects(
  db.exec("select * from funnel_journey_sessions"),
  /permission denied/,
);
await role("anon");
assert.equal((await publicJourney()).result, null);
await assert.rejects(
  db.exec("select * from funnel_journeys"),
  /permission denied/,
);
await assert.rejects(
  db.query("select funnel_session_start($1,$2)", ["journey", hash]),
  /permission denied/,
);
await role("authenticated", admin);
for (const mutate of [
  (g) => (g.steps[0].branches.help = "missing"),
  (g) => (g.steps[1].nextStepId = "question"),
  (g) => g.steps.push({ id: "unused", kind: "end", title: "Unused", body: "" }),
  (g) => (g.steps[0].branches.unknown = "finish"),
  (g) => (g.steps[0].options[1].id = "help"),
  (g) => (g.steps[0].defaultStepId = "missing"),
  (g) => (g.steps[0].completed = true),
  (g) => (g.steps[0].options[0].email = "private@example.com"),
]) {
  const bad = structuredClone(graph);
  mutate(bad);
  await assert.rejects(
    save(bad, 1, true),
    /Missing destination|cycle|Unreachable|choice|Unsupported|Invalid/,
  );
}
const published = await save(graph, 1, true);
assert.equal(published.result.published_version, 2);
await role("anon");
assert.deepEqual((await publicJourney()).result, {
  slug: "journey",
  title: "Original",
  revision: 2,
});
await role("authenticated", admin);
await assert.rejects(
  db.query("select funnel_session_view($1)", [hash]),
  /permission denied/,
);
const newGraph = structuredClone(graph);
newGraph.steps[0].title = "Private draft question";
await save(newGraph, 2, false, randomUUID(), "Private draft");
await role("anon");
assert.equal((await publicJourney()).result.title, "Original");
await role("service_role");
const started = (
  await one("select funnel_session_start($1,$2) result", ["journey", hash])
).result;
assert.equal(started.step.title, "Choose support");
assert.equal(started.step.branches, undefined);
assert.equal(started.step.defaultStepId, undefined);
assert.deepEqual(
  (await one("select funnel_session_start($1,$2) result", ["journey", hash]))
    .result,
  started,
);
const advance = (answer, version = 0, id = randomUUID(), step = "question") =>
  one("select funnel_session_advance($1,$2,$3,$4,$5) result", [
    hash,
    step,
    answer,
    version,
    id,
  ]);
await assert.rejects(advance("income-100k"), /Invalid choice/);
await assert.rejects(advance(null), /Invalid choice/);
const rid = randomUUID();
const progressed = await advance("help", 0, rid);
assert.equal(progressed.result.step.id, "offer");
assert.equal(progressed.result.offer.slug, "real-offer");
assert.equal(progressed.result.version, 1);
assert.deepEqual((await advance("help", 0, rid)).result, progressed.result);
await assert.rejects(advance("myself", 0, rid), /replay mismatch/);
await assert.rejects(advance("myself"), /revision conflict/);
await assert.rejects(
  advance("paid", 1, randomUUID(), "offer"),
  /Unexpected answer/,
);
await role("authenticated", admin);
await save(newGraph, 3, true, randomUUID(), "New published");
await role("service_role");
const pinned = (await one("select funnel_session_view($1) result", [hash]))
  .result;
assert.equal(pinned.revision, 2);
assert.equal(pinned.title, "Original");
const fresh = (
  await one("select funnel_session_start($1,$2) result", [
    "journey",
    "b".repeat(64),
  ])
).result;
assert.equal(fresh.revision, 4);
assert.equal(fresh.step.title, "Private draft question");
await db.exec("update offers set status='draft'");
assert.equal(
  (await one("select funnel_session_view($1) result", [hash])).result.offer,
  null,
);
assert.equal(
  (await advance(null, 1, randomUUID(), "offer")).result.step.kind,
  "end",
);
await assert.rejects(advance(null, 2, randomUUID(), "finish"), /ended/);
await role("authenticated", admin);
await assert.rejects(save(graph, 4, true), /publicly available/);
await role("service_role");
await db.exec("update offers set status='published'");
await role("authenticated", admin);
const concurrent = await Promise.allSettled([
  save(graph, 4, false),
  save(graph, 4, false),
]);
assert.equal(concurrent.filter((x) => x.status === "fulfilled").length, 1);
assert.equal(concurrent.filter((x) => x.status === "rejected").length, 1);
await save(graph, 5, false, randomUUID(), "Paused", false);
await role("anon");
assert.equal((await publicJourney()).result, null);
await role("service_role");
await assert.rejects(
  one("select funnel_session_view($1)", [hash]),
  /unavailable/,
);
await db.exec(
  "update funnel_journey_sessions set expires_at=now()-interval '1 day'",
);
await db.exec("select funnel_journey_cleanup()");
assert.equal(
  (await one("select count(*)::int n from funnel_journey_sessions")).n,
  0,
);
assert.equal(
  (await one("select count(*)::int n from funnel_journey_transitions")).n,
  0,
);
await db.exec("reset role");
// Real-content seed is private, refuses member sites, and preserves an existing draft on replay.
const seed = readFileSync(
  "scripts/maintenance/20260926-first-ai-build-journey-draft.sql",
  "utf8",
);
await assert.rejects(db.exec(seed), /only to the Brian/);
await db.exec("rollback");
await db.exec(
  "insert into site_settings values('https://brianhanson.com','Brian Hanson')",
);
for (const slug of [
  "ai-follow-up-starter-kit",
  "app-building-workshop",
  "pushten",
])
  await db.query(
    "insert into offers values($1,$2,$2,'published','free','external',false)",
    [randomUUID(), slug],
  );
await db.exec(seed);
await db.exec(seed);
const seeded = await one(
  "select * from funnel_journeys where slug='first-ai-build-next-step'",
);
assert.equal(seeded.active, false);
assert.equal(seeded.published_version, null);
assert.equal(seeded.version, 1);
assert.equal(seeded.draft_graph.steps.length, 8);
assert.equal(
  (await one("select funnel_public_journey('first-ai-build-next-step') result"))
    .result,
  null,
);
console.log(
  "PASS: graph validation, administrator-only private drafts, publication snapshots, stable revisions, server choices, replay identity, conflicting saves, offer availability, pause, retention and private owner seed.",
);
await db.close();
