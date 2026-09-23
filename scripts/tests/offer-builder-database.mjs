import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const db = new PGlite();
const admin = "00000000-0000-0000-0000-000000000001";
const other = "00000000-0000-0000-0000-000000000002";
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
for (const migration of [
  "20260919110000_offers_funnels.sql",
  "20260919123000_offer_shop_catalog.sql",
  "20260919150000_offer_external_listings.sql",
  "20260923090000_offer_builder.sql",
]) {
  await db.exec(readFileSync(`supabase/migrations/${migration}`, "utf8"));
}
// PGlite has one database session, so verify the critical lock-order boundary
// directly: every legacy mutation must hold the shared graph lock before any
// BEFORE ROW validation, just as the builder does before SELECT ... FOR UPDATE.
// This trigger sorts before offers_validate_graph, which used to take the lock
// too late for UPDATE and could deadlock against a concurrent builder save.
await db.exec(`
  CREATE FUNCTION public.test_offer_graph_lock_order() RETURNS trigger
  LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $$
  BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM pg_locks WHERE locktype='advisory' AND classid=0
        AND objid=671149920 AND objsubid=1 AND mode='ExclusiveLock'
        AND granted AND pid=pg_backend_pid()
    ) THEN RAISE EXCEPTION 'Offer row reached before graph lock'; END IF;
    IF TG_OP='DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END $$;
  CREATE TRIGGER aa_test_offer_graph_lock_order BEFORE INSERT OR UPDATE OR DELETE
    ON public.offers FOR EACH ROW EXECUTE FUNCTION public.test_offer_graph_lock_order();
  SET ROLE authenticated; SET test.uid='${admin}';
`);
const lockOrderId = randomUUID();
await db.query("INSERT INTO offers(id,slug) VALUES($1,'lock-order-check')", [
  lockOrderId,
]);
await db.query("UPDATE offers SET title='Direct legacy update' WHERE id=$1", [
  lockOrderId,
]);
await db.query("DELETE FROM offers WHERE id=$1", [lockOrderId]);
await db.exec(`
  RESET ROLE;
  DROP TRIGGER aa_test_offer_graph_lock_order ON public.offers;
  DROP FUNCTION public.test_offer_graph_lock_order();
`);
const page = () => ({
  headline: "A useful result",
  subheadline: "Specific copy",
  eyebrow: "",
  ctaText: "Get the guide",
  ctaMicrocopy: "",
  focusMode: true,
  sections: [],
});
const document = (offer = {}) => ({
  offer: {
    title: "Guide",
    slug: "new-guide",
    summary: "A useful guide",
    kind: "paid",
    amount_minor: 0,
    ...offer,
  },
  builder: {
    version: 1,
    strategy: {
      audience: "Private buyer brief",
      traffic: "email",
      problem: "",
      outcome: "",
      mechanism: "",
      deliverables: "",
      objections: "",
      evidence: "Private proof notes",
      adMessage: "",
    },
    presentation: {
      version: 1,
      landing: page(),
      upsell: page(),
      thankYou: {
        headline: "Your guide is ready",
        body: "",
        firstStep: "Start with page one",
      },
    },
    proofIds: [],
  },
});
const rpc = "SELECT offer_builder_save($1,$2,$3,$4,$5,$6) AS data";
const args = (
  id,
  doc,
  previous = null,
  publish = false,
  request = randomUUID(),
) => [
  id,
  JSON.stringify(doc),
  previous?.offer.updated_at ?? null,
  previous?.draft.version ?? null,
  publish,
  request,
];
const save = async (...input) => (await one(rpc, args(...input))).data;
const id = randomUUID();
const incomplete = document();
await db.exec("SET ROLE anon");
for (const table of [
  "offer_builder_drafts",
  "offer_builder_revisions",
  "offer_proof_items",
  "offer_copy_usage",
])
  await reject(`SELECT * FROM ${table}`, [], /permission denied/);
await reject(rpc, args(id, incomplete), /permission denied/);
await db.exec(`SET ROLE authenticated; SET test.uid='${other}'`);
await reject(rpc, args(id, incomplete), /Administrator access/);
assert.equal(
  (await db.query("SELECT * FROM offer_builder_drafts")).rows.length,
  0,
);
await reject("SELECT admin_offer_copy_allow()", [], /Administrator access/);
await reject(
  "INSERT INTO offer_proof_items(title,kind) VALUES('Untrusted','fact')",
  [],
  /row-level security/,
);
await db.exec(`SET test.uid='${admin}'`);
const initialArgs = args(id, incomplete);
const initial = (await one(rpc, initialArgs)).data;
assert.equal(initial.draft.version, 1);
assert.equal(initial.offer.status, "draft");
assert.equal(
  initial.offer.kind,
  "free",
  "incomplete paid config is isolated in working document",
);
assert.equal(initial.draft.document.offer.kind, "paid");
assert.equal(initial.offer.presentation, null);
assert.deepEqual(
  (await one(rpc, initialArgs)).data,
  initial,
  "same request can be retried safely",
);
await reject(
  rpc,
  [
    ...initialArgs.slice(0, 1),
    JSON.stringify(document({ title: "Different" })),
    ...initialArgs.slice(2),
  ],
  /already used for different content/,
);
await reject(
  "UPDATE offer_builder_drafts SET version=900",
  [],
  /permission denied/,
);
await reject("DELETE FROM offer_builder_revisions", [], /permission denied/);
await reject(
  "INSERT INTO offer_builder_revisions(offer_id) VALUES($1)",
  [id],
  /permission denied/,
);
await reject(rpc, args(id, incomplete, initial, true), /offers_price/);
assert.equal(
  (
    await one("SELECT version FROM offer_builder_drafts WHERE offer_id=$1", [
      id,
    ])
  ).version,
  1,
  "failed publication is atomic",
);

const proof = await one(
  "INSERT INTO offer_proof_items(title,kind,content,notes,approved) VALUES('Real customer','testimonial','It helped me organize my work','Private permission notes',true) RETURNING id",
);
const full = document({
  amount_minor: 2500,
  asset_path: `${id}/guide.pdf`,
  asset_name: "guide.pdf",
});
full.builder.proofIds.push(proof.id);
full.builder.presentation.landing.sections.push({
  id: "proof-1",
  type: "proof",
  heading: "What a customer said",
  body: "It helped me organize my work",
  imageUrl: "https://example.com/proof.png",
  caption: "Customer, with permission",
  proofId: proof.id,
});
await db.query(
  "INSERT INTO storage.objects(bucket_id,name) VALUES('offer-files',$1)",
  [`${id}/guide.pdf`],
);
const published = await save(id, full, initial, true);
assert.equal(published.offer.status, "published");
assert.equal(published.offer.amount_minor, 2500);
assert.equal(published.offer.presentation.landing.sections[0].proofId, "");
assert.equal(
  published.draft.document.builder.presentation.landing.sections[0].proofId,
  proof.id,
);
await db.exec("SET ROLE anon");
const publicRow = await one(
  "SELECT id,title,presentation,amount_minor FROM offers WHERE id=$1",
  [id],
);
assert(!JSON.stringify(publicRow).includes("Private"));
assert(!JSON.stringify(publicRow).includes(proof.id));
await reject("SELECT asset_path FROM offers", [], /permission denied/);
await reject("SELECT * FROM offer_builder_revisions", [], /permission denied/);
await db.exec(`SET ROLE authenticated; SET test.uid='${admin}'`);
const changed = structuredClone(full);
changed.offer.title = "Still private title";
changed.offer.slug = "private-slug";
changed.offer.amount_minor = 7500;
changed.offer.asset_path = `${id}/another.pdf`;
changed.builder.presentation.landing.headline = "Private future headline";
const draftSave = await save(id, changed, published);
assert.deepEqual(
  draftSave.offer,
  published.offer,
  "saving draft leaves every offers column including updated_at untouched",
);
assert.equal(draftSave.draft.version, 3);
await reject(rpc, args(id, full, published), /Draft changed elsewhere/);
assert.deepEqual(
  (await one(rpc, initialArgs)).data,
  initial,
  "old completed requests remain idempotent after later revisions",
);

// Current and historical orders retain snapshots through draft saves and later publication.
await db.exec("SET ROLE service_role");
const order = (
  await one(
    "SELECT offer_reserve_order($1,$2,'buyer@example.com','Buyer',NULL) AS data",
    [id, "a".repeat(64)],
  )
).data;
assert.equal(order.title_snapshot, "Guide");
assert.equal(order.amount_minor, 2500);
await db.exec(`SET ROLE authenticated; SET test.uid='${admin}'`);
const nextPublish = await save(id, changed, draftSave, true);
await db.exec("SET ROLE service_role");
const retained = (
  await one("SELECT to_jsonb(o) AS data FROM offer_orders o WHERE id=$1", [
    order.id,
  ])
).data;
assert.deepEqual(retained, order);
await db.exec(`SET ROLE authenticated; SET test.uid='${admin}'`);
const restored = await save(id, full, nextPublish);
assert.equal(
  restored.offer.title,
  "Still private title",
  "restoring to a draft is not publication",
);
assert.deepEqual(restored.draft.document, full);
assert.equal(
  (
    await one(
      "SELECT count(*)::int n FROM offer_builder_revisions WHERE offer_id=$1",
      [id],
    )
  ).n,
  5,
);
// Direct legacy edits invalidate the caller's offer timestamp without silently overwriting them.
await db.query("UPDATE offers SET summary='Legacy change' WHERE id=$1", [id]);
await reject(rpc, args(id, full, restored), /Offer changed elsewhere/);
const latestOffer = (
  await one("SELECT to_jsonb(o) AS data FROM offers o WHERE id=$1", [id])
).data;
const reconciled = await save(
  id,
  { ...full, offer: { ...full.offer, summary: "Legacy change" } },
  { ...restored, offer: latestOffer },
);
assert.equal(reconciled.draft.base_offer_updated_at, latestOffer.updated_at);

for (const mutate of [
  (d) => {
    d.builder.presentation.secret = "no";
  },
  (d) => {
    d.builder.presentation.landing.secret = "no";
  },
  (d) => {
    d.builder.presentation.landing.sections[0].secret = "no";
  },
  (d) => {
    d.builder.strategy.extra = "no";
  },
  (d) => {
    d.offer.presentation = {};
  },
  (d) => {
    d.offer.id = randomUUID();
  },
  (d) => {
    d.builder.presentation.landing.sections[0].imageUrl = "javascript:alert(1)";
  },
  (d) => {
    d.builder.presentation.landing.sections[0].imageUrl =
      "https://user:pass@example.com/proof";
  },
  (d) => {
    d.builder.presentation.landing.sections[0].body = "x".repeat(6001);
  },
  (d) => {
    d.builder.presentation.landing.sections = Array.from(
      { length: 31 },
      () => d.builder.presentation.landing.sections[0],
    );
  },
  (d) => {
    d.builder.proofIds = ["not-a-uuid"];
  },
  (d) => {
    d.builder.presentation.thankYou = { headline: "", body: "" };
  },
  (d) => {
    d.builder.presentation.landing.focusMode = null;
  },
]) {
  const invalid = structuredClone(full);
  mutate(invalid);
  await reject(
    rpc,
    args(id, invalid, reconciled),
    /Invalid offer builder document/,
  );
}
// Every required nested key rejects missing, null, and container/scalar substitutions.
// Keep commerce keys partial: omission is valid there, but supplied types are checked.
const requiredPaths = [];
function collectPaths(value, path = []) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    for (const [key, child] of Object.entries(value)) {
      const childPath = [...path, key];
      requiredPaths.push(childPath);
      collectPaths(child, childPath);
    }
  } else if (Array.isArray(value)) {
    value.forEach((child, index) => collectPaths(child, [...path, index]));
  }
}
collectPaths(full.builder, ["builder"]);
let negativeShapes = 0;
for (const path of requiredPaths) {
  for (const replacement of [undefined, null, {}, []]) {
    const candidate = structuredClone(full);
    const parent = path
      .slice(0, -1)
      .reduce((value, key) => value[key], candidate);
    const key = path.at(-1);
    const original = parent[key];
    // [] is valid for arrays, and {} is not a valid replacement for these strict objects.
    if (Array.isArray(original) && Array.isArray(replacement)) continue;
    if (replacement === undefined) delete parent[key];
    else parent[key] = replacement;
    assert.equal(
      (
        await one("SELECT offer_builder_document_valid($1) AS valid", [
          JSON.stringify(candidate),
        ])
      ).valid,
      false,
      `Reject ${path.join(".")} = ${JSON.stringify(replacement)}`,
    );
    negativeShapes++;
  }
}
for (const invalidRoot of [null, [], "text", 1, false]) {
  assert.equal(
    (
      await one("SELECT offer_builder_document_valid($1) AS valid", [
        JSON.stringify(invalidRoot),
      ])
    ).valid,
    false,
  );
}
for (const amount of [null, {}, [], "25", true, -1, 1.5, 100000000]) {
  await reject(
    rpc,
    args(id, document({ amount_minor: amount }), reconciled),
    /Invalid offer builder document/,
  );
}
assert(negativeShapes > 100);
// A member with table access still cannot see any records or mutate approved proof.
await db.exec(`SET test.uid='${other}'`);
for (const table of [
  "offer_builder_drafts",
  "offer_builder_revisions",
  "offer_proof_items",
]) {
  assert.equal((await db.query(`SELECT * FROM ${table}`)).rows.length, 0);
}
assert.equal(
  (await db.query("UPDATE offer_proof_items SET approved=true RETURNING id"))
    .rows.length,
  0,
);
await db.exec(`SET test.uid='${admin}'`);
await reject(
  "UPDATE offers SET presentation=$1 WHERE id=$2",
  [JSON.stringify(full.builder.presentation), id],
  /offers_presentation_valid/,
  "even direct writes cannot expose proof identifiers",
);
const badPublic = structuredClone(published.offer.presentation);
badPublic.thankYou.secret = "Private";
await reject(
  "UPDATE offers SET presentation=$1 WHERE id=$2",
  [JSON.stringify(badPublic), id],
  /offers_presentation_valid/,
);
await reject(
  "UPDATE offer_proof_items SET source_url='http://example.com' WHERE id=$1",
  [proof.id],
  /check constraint/,
);
await db.query("UPDATE offer_proof_items SET approved=false WHERE id=$1", [
  proof.id,
]);
assert.equal(
  (await one("SELECT approved FROM offer_proof_items WHERE id=$1", [proof.id]))
    .approved,
  false,
);
await db.query("DELETE FROM offer_proof_items WHERE id=$1", [proof.id]);
assert.equal(
  (await db.query("SELECT id FROM offer_proof_items")).rows.length,
  0,
);
for (let index = 0; index < 12; index++)
  assert.equal(
    (await one("SELECT admin_offer_copy_allow() AS allowed")).allowed,
    true,
  );
assert.equal(
  (await one("SELECT admin_offer_copy_allow() AS allowed")).allowed,
  false,
);
await reject("SELECT * FROM offer_copy_usage", [], /permission denied/);
await db.exec("RESET ROLE");
await db.exec(
  "UPDATE offer_copy_usage SET requested_at=clock_timestamp()-interval '2 minutes'; INSERT INTO offer_copy_usage(admin_id,requested_at) SELECT '00000000-0000-0000-0000-000000000001'::uuid,clock_timestamp()-interval '2 minutes' FROM generate_series(1,88)",
);
await db.exec(`SET ROLE authenticated; SET test.uid='${admin}'`);
assert.equal(
  (await one("SELECT admin_offer_copy_allow() AS allowed")).allowed,
  false,
  "daily usage is enforced across requests",
);
await db.close();
console.log(
  "Offer builder database: private drafts, bounded schema, CAS, publication, immutable history, proof permissions, order snapshots, and durable AI limits passed.",
);
