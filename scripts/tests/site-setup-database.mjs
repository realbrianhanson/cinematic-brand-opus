import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

// Regression: "Apply site setup" must not overwrite the article CTA box or
// the author byline title in owner mode, must snapshot what it replaces, and
// must keep the fresh-member reset behavior.
const db = new PGlite();
const owner = "00000000-0000-0000-0000-000000000001";
const other = "00000000-0000-0000-0000-000000000002";
await db.exec(`create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
create function public.is_admin(uuid) returns boolean language sql as $$select $1='${owner}'::uuid$$;
grant usage on schema public,auth to anon,authenticated;
insert into auth.users values('${owner}'),('${other}');
create table site_settings(id uuid default gen_random_uuid(),site_name text,site_url text,author_name text,author_title text,author_bio text,publisher_name text,publisher_url text,author_credentials text[],author_social_links jsonb,cta_button_text text,cta_url text,cta_headline text,cta_subtext text,cta_social_proof text,updated_at timestamptz default now(),newsletter_from_address text);
insert into site_settings(site_name,site_url,author_name,author_title,author_bio,publisher_name,publisher_url,author_credentials,author_social_links,cta_button_text,cta_url,cta_headline,cta_subtext,cta_social_proof,newsletter_from_address)
values('Brian Hanson','https://brianhanson.com','Brian Hanson','4x Inc. 5000 Entrepreneur','Live bio','Brian Hanson','https://brianhanson.com',ARRAY['Inc. 5000 x4'],'{"linkedin":"brian"}','Reserve Your Free 3-Day Pass','https://summit.example/pass','Free 3-Day AI for Business Summit','Summit subtext','2,000 attendees','preserve@example.com');
`);
for (const file of [
  "20260919091000_site_branding.sql",
  "20260923101000_site_setup_preserve_settings.sql",
])
  await db.exec(readFileSync("supabase/migrations/" + file, "utf8"));

const ownerValue = {
  mode: "owner",
  name: "Brian Hanson",
  role: "Keynote Speaker, Advisor & Operator",
  siteUrl: "https://brianhanson.com",
  accent: "#C9A84C",
  authorBio: "Updated bio",
  offerLabel: "Join Free 3-Day AI Summit",
  offerUrl: "/summit",
  headline: "Put AI to work in your business.",
  description: "Homepage description that is not article CTA copy",
  initials: "BH",
  email: "",
  niche: "AI, Leadership",
  logo: "",
  favicon: "",
  socialImage: "",
};
const row = async () => (await db.query("select * from site_settings")).rows[0];

// History is private: no anon/authenticated access.
await db.exec("set role anon");
await assert.rejects(
  db.query("select * from site_setup_history"),
  /permission denied/,
);
await db.exec(`set role authenticated; set test.uid='${other}'`);
await assert.rejects(
  db.query("select * from site_setup_history"),
  /permission denied/,
);
await assert.rejects(
  db.query("select save_site_branding($1)", [ownerValue]),
  /Administrator required/,
);

// Owner apply keeps article CTA + byline title, updates identity.
await db.exec(`set test.uid='${owner}'`);
await db.query("select save_site_branding($1)", [ownerValue]);
await db.exec("reset role");
let s = await row();
assert.equal(s.author_title, "4x Inc. 5000 Entrepreneur");
assert.equal(s.cta_headline, "Free 3-Day AI for Business Summit");
assert.equal(s.cta_subtext, "Summit subtext");
assert.equal(s.cta_button_text, "Reserve Your Free 3-Day Pass");
assert.equal(s.cta_url, "https://summit.example/pass");
assert.equal(s.cta_social_proof, "2,000 attendees");
assert.deepEqual(s.author_credentials, ["Inc. 5000 x4"]);
assert.deepEqual(s.author_social_links, { linkedin: "brian" });
assert.equal(s.author_bio, "Updated bio");
assert.equal(s.site_name, "Brian Hanson");
assert.equal(s.newsletter_from_address, "preserve@example.com");

// History captured the prior state (no branding row existed yet).
let history = (await db.query("select * from site_setup_history order by id"))
  .rows;
assert.equal(history.length, 1);
assert.equal(history[0].actor, owner);
assert.equal(history[0].mode, "owner");
assert.equal(history[0].branding, null);
assert.equal(history[0].settings.author_bio, "Live bio");
assert.equal(
  history[0].settings.cta_headline,
  "Free 3-Day AI for Business Summit",
);
assert.deepEqual(history[0].settings.author_credentials, ["Inc. 5000 x4"]);

// Owner apply with explicit Brand & publishing values writes them; empty
// explicit values and an empty bio keep the live columns.
await db.exec(`set role authenticated; set test.uid='${owner}'`);
await db.query("select save_site_branding($1)", [
  {
    ...ownerValue,
    authorBio: "",
    bylineTitle: "Founder, AI For Business",
    ctaHeadline: "",
    ctaButtonText: "  ",
    ctaUrl: "/new-offer",
  },
]);
await assert.rejects(
  db.query("select save_site_branding($1)", [
    { ...ownerValue, ctaUrl: "javascript:alert(1)" },
  ]),
  /Invalid call-to-action URL/,
);
await db.exec("reset role");
s = await row();
assert.equal(s.author_title, "Founder, AI For Business");
assert.equal(s.cta_headline, "Free 3-Day AI for Business Summit");
assert.equal(s.cta_button_text, "Reserve Your Free 3-Day Pass");
assert.equal(s.cta_url, "/new-offer");
assert.equal(s.author_bio, "Updated bio");
history = (await db.query("select * from site_setup_history order by id")).rows;
assert.equal(history.length, 2, "rejected apply must not leave history");
assert.equal(history[1].branding.mode, "owner");
assert.equal(history[1].branding.role, ownerValue.role);

// Fresh member reset still clears identity, credentials, and article CTA.
const memberValue = {
  ...ownerValue,
  mode: "member",
  name: "Acme",
  role: "Consultant",
  siteUrl: "https://acme.example",
  authorBio: "Real bio",
  offerLabel: "Explore",
  offerUrl: "/resources",
  headline: "Useful work",
  description: "A practical guide",
};
await db.exec(`set role authenticated; set test.uid='${owner}'`);
await db.query("select save_site_branding($1)", [memberValue]);
await db.exec("reset role");
s = await row();
assert.equal(s.site_name, "Acme");
assert.equal(s.author_title, "Consultant");
assert.equal(s.cta_headline, "Useful work");
assert.equal(s.cta_subtext, "A practical guide");
assert.equal(s.cta_button_text, "Explore");
assert.equal(s.cta_url, "/resources");
assert.equal(s.cta_social_proof, null);
assert.deepEqual(s.author_credentials, []);
assert.deepEqual(s.author_social_links, {});
assert.equal(s.newsletter_from_address, "preserve@example.com");
history = (await db.query("select * from site_setup_history order by id")).rows;
assert.equal(history.length, 3);
assert.equal(history[2].mode, "member");
assert.deepEqual(history[2].settings.author_credentials, ["Inc. 5000 x4"]);
assert.deepEqual(history[2].settings.author_social_links, {
  linkedin: "brian",
});
assert.equal(history[2].settings.author_title, "Founder, AI For Business");

// A later member apply does not reset credentials again.
await db.exec(
  "update site_settings set author_credentials=ARRAY['Member cred']",
);
await db.exec(`set role authenticated; set test.uid='${owner}'`);
await db.query("select save_site_branding($1)", [
  { ...memberValue, role: "Advisor" },
]);
await db.exec("reset role");
s = await row();
assert.deepEqual(s.author_credentials, ["Member cred"]);
assert.equal(s.author_title, "Advisor");

// Grants preserved.
const grants = (
  await db.query(
    "select has_function_privilege('anon','public.save_site_branding(jsonb)','execute') a, has_function_privilege('authenticated','public.save_site_branding(jsonb)','execute') u, (select prosecdef from pg_proc where proname='save_site_branding') d",
  )
).rows[0];
assert.deepEqual(grants, { a: false, u: true, d: true });
await db.close();
console.log(
  "PASS: owner site setup keeps article CTA and byline title, explicit values apply, history snapshots prior state privately, member reset intact.",
);
