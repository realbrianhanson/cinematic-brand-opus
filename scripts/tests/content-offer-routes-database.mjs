import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const db = new PGlite();
const one = async (sql, args = []) => (await db.query(sql, args)).rows[0];
await db.exec(`
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('test.user_id',true),'')::uuid $$;
CREATE FUNCTION public.is_admin(uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT coalesce($1='00000000-0000-4000-8000-000000000001'::uuid,false) $$;
GRANT USAGE ON SCHEMA public,auth TO anon,authenticated,service_role;
CREATE TABLE public.offers(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),slug text,title text,summary text,kind text DEFAULT 'free',status text,funnel_only boolean DEFAULT false,asset_path text);
`);
await db.exec(
  readFileSync(
    "supabase/migrations/20260924070000_content_offer_routes.sql",
    "utf8",
  ),
);
const insertOffer = async (name, status = "published", funnelOnly = false) =>
  (
    await one(
      "INSERT INTO offers(slug,title,summary,status,funnel_only,asset_path) VALUES($1,$1,'Summary',$2,$3,'PRIVATE.pdf') RETURNING id",
      [name, status, funnelOnly],
    )
  ).id;
const ids = {
  page: await insertOffer("page"),
  type: await insertOffer("resource-type"),
  niche: await insertOffer("industry"),
  fallback: await insertOffer("fallback"),
  draft: await insertOffer("draft", "draft"),
  funnel: await insertOffer("funnel", "published", true),
};
const page = "post:00000000-0000-4000-8000-000000000099";
const resolve = async () =>
  (
    await one(
      "SELECT resolve_content_offer($1,'ai-tools','landscaping') result",
      [page],
    )
  ).result;
const add = (scope, key, offer) =>
  db.query(
    "INSERT INTO content_offer_routes(scope,match_key,label,offer_id) VALUES($1,$2,$1,$3)",
    [scope, key, offer],
  );
assert.equal(
  await resolve(),
  null,
  "no rules retains the frontend global CTA fallback",
);
await db.exec(
  "SET ROLE authenticated; SELECT set_config('test.user_id','00000000-0000-4000-8000-000000000001',false)",
);
await add("default", "*", ids.fallback);
await add("niche", "landscaping", ids.niche);
await add("content_type", "ai-tools", ids.type);
await add("page", page, ids.page);
await assert.rejects(add("niche", "unpublished", ids.draft), /published offer/);
await assert.rejects(
  add("niche", "funnel-only", ids.funnel),
  /published offer/,
);
await assert.rejects(add("default", "bad", ids.fallback), /check constraint/);
await assert.rejects(
  add("page", "post:javascript:alert(1)", ids.page),
  /check constraint/,
);
await assert.rejects(add("default", "*", ids.fallback), /unique constraint/);
await db.exec("SET ROLE anon");
let result = await resolve();
assert.equal(result.offer_id, ids.page, "page override wins");
assert.equal(
  result.asset_path,
  undefined,
  "private offer fields never returned",
);
assert.equal(result.match_key, undefined, "routing registry not returned");
await assert.rejects(
  db.query("SELECT * FROM content_offer_routes"),
  /permission denied/,
);
await assert.rejects(add("niche", "anonymous", ids.page), /permission denied/);
await db.exec("RESET ROLE");
await db.query("UPDATE offers SET status='draft' WHERE id=$1", [ids.page]);
assert.equal(
  (await resolve()).offer_id,
  ids.type,
  "unpublishing skips the page rule",
);
await db.query("UPDATE offers SET funnel_only=true WHERE id=$1", [ids.type]);
assert.equal(
  (await resolve()).offer_id,
  ids.niche,
  "funnel-only offers skipped",
);
await db.query("UPDATE offers SET status='archived' WHERE id=$1", [ids.niche]);
assert.equal(
  (await resolve()).offer_id,
  ids.fallback,
  "default offer wins after topic rules unavailable",
);
await db.query("DELETE FROM offers WHERE id=$1", [ids.fallback]);
assert.equal(
  await resolve(),
  null,
  "deleted offer removes rule and permits global fallback",
);
await db.exec(
  "SET ROLE authenticated; SELECT set_config('test.user_id','00000000-0000-4000-8000-000000000002',false)",
);
assert.equal(
  (await one("SELECT count(*)::int n FROM content_offer_routes")).n,
  0,
  "non-admin cannot read registry",
);
await assert.rejects(
  add("default", "*", ids.funnel),
  /row-level security|published offer/,
);
await db.exec("RESET ROLE");
await db.query("UPDATE offers SET status='published' WHERE id=$1", [ids.page]);
await db.exec("SET ROLE authenticated");
assert.equal(
  (await resolve()).offer_id,
  ids.page,
  "signed-in visitors can resolve public offers",
);
await db.close();
console.log("Content offer routing database checks passed.");
