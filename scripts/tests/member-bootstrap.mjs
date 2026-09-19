import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
const fixture = `create role anon;create role authenticated;
create table site_settings(id uuid primary key default gen_random_uuid(),site_name text,site_url text,author_name text,author_title text,author_bio text,publisher_name text,publisher_url text,cta_url text,cta_headline text,cta_subtext text,cta_button_text text,cta_social_proof text,image_generation_enabled boolean,newsletter_from_address text,newsletter_reply_to text,newsletter_postal_address text);
create table site_settings_private(report_enabled boolean,auto_publish_enabled boolean,auto_publish_daily_cap int,auto_publish_min_quality int,voice_profile text,banned_phrases text[],default_expert_pov text);
create table content_schemas(slug text primary key,name text,description text,schema_definition jsonb,title_template text,description_template text,renderer_component text,items_per_section int,is_active boolean);
create table posts(id uuid);create table newsletter_subscribers(email text);`;
const sql = readFileSync("setup/member-bootstrap.sql", "utf8");
const db = new PGlite();
await db.exec(fixture);
await db.exec(sql);
assert.equal(
  (await db.query("select count(*)::int n from site_settings")).rows[0].n,
  1,
);
assert.deepEqual(
  (
    await db.query(
      "select auto_publish_enabled,report_enabled from site_settings_private",
    )
  ).rows[0],
  { auto_publish_enabled: false, report_enabled: false },
);
assert.equal(
  (await db.query("select count(*)::int n from newsletter_subscribers")).rows[0]
    .n,
  0,
);
await db.exec("update site_settings set site_name='My Brand'");
await db.exec(sql);
assert.equal(
  (await db.query("select site_name from site_settings")).rows[0].site_name,
  "My Brand",
  "rerun preserves configured settings",
);
await db.close();
const populated = new PGlite();
await populated.exec(fixture);
await populated.exec(
  "insert into site_settings(site_name)values('Existing Owner')",
);
await assert.rejects(populated.exec(sql), /Refusing bootstrap/);
await populated.exec("rollback");
assert.equal(
  (await populated.query("select site_name from site_settings")).rows[0]
    .site_name,
  "Existing Owner",
);
await populated.close();

// Schemas without the optional commerce/storage tables are covered above. Each
// inherited commerce surface independently refuses setup and preserves its data.
const commerceFixture = `
create table offers(id uuid);
create table offer_orders(id uuid);
create table offer_stripe_events(event_id text);
create schema storage;
create table storage.objects(bucket_id text,name text);`;
for (const [label, seed, count] of [
  [
    "offers",
    "insert into offers values(gen_random_uuid())",
    "select count(*)::int n from offers",
  ],
  [
    "offer_orders",
    "insert into offer_orders values(gen_random_uuid())",
    "select count(*)::int n from offer_orders",
  ],
  [
    "offer_stripe_events",
    "insert into offer_stripe_events values('evt_inherited')",
    "select count(*)::int n from offer_stripe_events",
  ],
  [
    "offer-files",
    "insert into storage.objects values('offer-files','private-guide.pdf')",
    "select count(*)::int n from storage.objects where bucket_id='offer-files'",
  ],
]) {
  const inherited = new PGlite();
  await inherited.exec(fixture + commerceFixture);
  await inherited.exec(seed);
  await assert.rejects(
    inherited.exec(sql),
    new RegExp(`Refusing bootstrap: ${label}`),
  );
  await inherited.exec("rollback");
  assert.equal((await inherited.query(count)).rows[0].n, 1);
  assert.equal(
    (await inherited.query("select count(*)::int n from site_settings")).rows[0]
      .n,
    0,
    "refusal does not initialize settings over inherited commerce data",
  );
  await inherited.close();
}

const cleanCommerce = new PGlite();
await cleanCommerce.exec(fixture + commerceFixture);
await cleanCommerce.exec(
  "insert into storage.objects values('blog-images','public-cover.jpg')",
);
await cleanCommerce.exec(sql);
assert.equal(
  (await cleanCommerce.query("select count(*)::int n from site_settings"))
    .rows[0].n,
  1,
  "empty commerce tables and unrelated public images do not block setup",
);
await cleanCommerce.exec(
  "insert into storage.objects values('offer-files','inherited-guide.pdf')",
);
await assert.rejects(
  cleanCommerce.exec(sql),
  /Refusing bootstrap: offer-files/,
  "an inherited bootstrap marker must not bypass the private-file guard",
);
await cleanCommerce.exec("rollback");
assert.equal(
  (
    await cleanCommerce.query(
      "select count(*)::int n from storage.objects where bucket_id='offer-files'",
    )
  ).rows[0].n,
  1,
);
await cleanCommerce.close();

// Exercise the actual inquiry migration on a current remix; the earlier tests
// still cover older schemas without the optional table and intake setting.
const speakingFixture = `
create role service_role bypassrls;
create schema auth;
create function auth.uid() returns uuid language sql as $$select null::uuid$$;
create function public.is_admin(uuid) returns boolean language sql as $$select false$$;
alter table site_settings_private add column id uuid primary key default gen_random_uuid();
create function public.update_updated_at_column() returns trigger language plpgsql as $$begin new.updated_at=now();return new;end;$$;`;
const speakingMigration = readFileSync(
  "supabase/migrations/20260919200000_speaking_inquiries.sql",
  "utf8",
);
for (const alreadyBootstrapped of [false, true]) {
  const inquiries = new PGlite();
  await inquiries.exec(fixture + speakingFixture);
  await inquiries.exec(speakingMigration);
  if (alreadyBootstrapped) {
    await inquiries.exec(sql);
    assert.equal(
      (
        await inquiries.query(
          "select speaking_inquiries_enabled from site_settings_private",
        )
      ).rows[0].speaking_inquiries_enabled,
      false,
      "fresh member intake stays disabled under the actual schema default",
    );
    await inquiries.exec(
      "update site_settings_private set speaking_inquiries_enabled=true",
    );
    await inquiries.exec(sql);
    assert.equal(
      (
        await inquiries.query(
          "select speaking_inquiries_enabled from site_settings_private",
        )
      ).rows[0].speaking_inquiries_enabled,
      true,
      "an idempotent rerun preserves a member's later intake configuration",
    );
  }
  await inquiries.exec(
    "insert into speaking_inquiries(request_id,payload_hash,name,email,event_name) values(gen_random_uuid(),repeat('a',64),'Existing organizer','organizer@example.com','Existing event')",
  );
  await assert.rejects(
    inquiries.exec(sql),
    /Refusing bootstrap: speaking_inquiries/,
    alreadyBootstrapped
      ? "an inherited bootstrap marker must not bypass the inquiry guard"
      : "inherited inquiries must prevent neutral setup",
  );
  await inquiries.exec("rollback");
  assert.equal(
    (
      await inquiries.query(
        "select count(*)::int n from speaking_inquiries where email='organizer@example.com' and event_name='Existing event'",
      )
    ).rows[0].n,
    1,
    "refusal preserves the original inquiry",
  );
  assert.equal(
    (await inquiries.query("select count(*)::int n from site_settings")).rows[0]
      .n,
    alreadyBootstrapped ? 1 : 0,
    "refusal does not initialize settings over inherited inquiries",
  );
  await inquiries.close();
}
console.log(
  "PASS: empty member bootstrap, automation and inquiry intake off, no subscribers, idempotent rerun, populated-owner/offer/order/receipt/private-file/inquiry refusal, preserved inherited data, and older schema compatibility",
);
