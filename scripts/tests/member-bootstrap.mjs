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
create table offer_access_deliveries(id uuid,email text);
create table offer_access_grants(token_hash text);
create table transactional_email_suppressions(email text,reason text);
create table conversion_sessions(id uuid);
create table conversion_events(id uuid);
create table conversion_order_links(id uuid);
create table conversion_order_facts(id uuid);
create table external_conversion_outcomes(id uuid);
create table external_conversion_imports(id uuid);
create schema storage;
create table storage.objects(bucket_id text,name text);`;
for (const [label, seed, count] of [
  ...[
    "conversion_sessions",
    "conversion_events",
    "conversion_order_links",
    "conversion_order_facts",
    "external_conversion_outcomes",
    "external_conversion_imports",
  ].map((table) => [
    table,
    `insert into ${table} values(gen_random_uuid())`,
    `select count(*)::int n from ${table}`,
  ]),
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
    "offer_access_deliveries",
    "insert into offer_access_deliveries values(gen_random_uuid(),'private@example.com')",
    "select count(*)::int n from offer_access_deliveries",
  ],
  [
    "offer_access_grants",
    "insert into offer_access_grants values(repeat('a',64))",
    "select count(*)::int n from offer_access_grants",
  ],
  [
    "transactional_email_suppressions",
    "insert into transactional_email_suppressions values('private@example.com','complained')",
    "select count(*)::int n from transactional_email_suppressions",
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
for (const table of [
  "offer_access_deliveries",
  "offer_access_grants",
  "transactional_email_suppressions",
]) {
  const marked = new PGlite();
  await marked.exec(fixture + commerceFixture);
  await marked.exec(sql);
  await marked.exec(
    table === "offer_access_deliveries"
      ? "insert into offer_access_deliveries values(gen_random_uuid(),'private@example.com')"
      : table === "transactional_email_suppressions"
        ? "insert into transactional_email_suppressions values('private@example.com','complained')"
        : "insert into offer_access_grants values(repeat('a',64))",
  );
  await assert.rejects(
    marked.exec(sql),
    new RegExp(`Refusing bootstrap: ${table}`),
    "inherited marker must not bypass private access-delivery data guard",
  );
  await marked.exec("rollback");
  assert.equal(
    (await marked.query(`select count(*)::int n from ${table}`)).rows[0].n,
    1,
  );
  await marked.close();
}
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
// A current Cloud remix copies conversion schema, but no config rows or cron jobs.
const conversionFixture = `
create table conversion_measurement_config(singleton boolean primary key default true check(singleton),started_at timestamptz not null default clock_timestamp());
create function public.conversion_cleanup() returns void language sql as $$select$$;`;
const cronFixture = `
create schema cron;
create table cron.job(jobid bigint generated always as identity primary key,jobname text unique,schedule text,command text,active boolean not null default true,database text not null default current_database(),username text not null default current_user);
create function cron.schedule(text,text,text) returns bigint language plpgsql as $$
declare job_id bigint;
begin
 insert into cron.job(jobname,schedule,command) values($1,$2,$3)
 on conflict(jobname) do update set schedule=excluded.schedule,command=excluded.command,active=true
 returning jobid into job_id;
 return job_id;
end $$;`;
const one = async (database, query) => (await database.query(query)).rows[0];
const current = new PGlite();
await current.exec(fixture + commerceFixture + conversionFixture + cronFixture);
await current.exec(sql);
const start = (
  await one(
    current,
    "select started_at from conversion_measurement_config where singleton",
  )
).started_at;
assert.ok(
  start instanceof Date,
  "current schema-only remix has a real measurement start",
);
const scheduled = await one(
  current,
  "select jobid,jobname,schedule,command,active from cron.job",
);
assert.deepEqual(scheduled, {
  jobid: 1,
  jobname: "conversion-retention-daily",
  schedule: "23 4 * * *",
  command: "SELECT public.conversion_cleanup()",
  active: true,
});
await current.exec(
  "update site_settings set site_name='My Member Brand';update cron.job set active=false",
);
await current.exec(sql);
assert.deepEqual(
  (
    await one(
      current,
      "select started_at from conversion_measurement_config where singleton",
    )
  ).started_at,
  start,
  "rerun preserves measurement start",
);
assert.equal(
  (await one(current, "select count(*)::int n from cron.job")).n,
  1,
  "rerun does not duplicate scheduled cleanup",
);
assert.equal(
  (await one(current, "select active from cron.job")).active,
  true,
  "rerun repairs paused retention",
);
assert.equal(
  (await one(current, "select site_name from site_settings")).site_name,
  "My Member Brand",
  "rerun preserves member settings",
);
await current.exec(
  "delete from conversion_measurement_config;delete from cron.job",
);
await current.exec(sql);
assert.equal(
  (
    await one(
      current,
      "select count(*)::int n from conversion_measurement_config",
    )
  ).n,
  1,
  "an existing clean bootstrap marker does not skip missing config",
);
assert.equal(
  (await one(current, "select count(*)::int n from cron.job")).n,
  1,
  "an existing clean bootstrap marker does not skip missing retention",
);
await current.close();

for (const marked of [false, true]) {
  const noCron = new PGlite();
  await noCron.exec(fixture + commerceFixture);
  if (marked) {
    await noCron.exec(sql);
    await noCron.exec("update site_settings set site_name='Existing Member'");
  }
  await noCron.exec(conversionFixture);
  await assert.rejects(noCron.exec(sql), /requires pg_cron.*90-day retention/);
  await noCron.exec("rollback");
  assert.equal(
    (
      await one(
        noCron,
        "select count(*)::int n from conversion_measurement_config",
      )
    ).n,
    0,
    "missing scheduler cannot initialize measurement",
  );
  assert.equal(
    (await one(noCron, "select count(*)::int n from site_settings")).n,
    marked ? 1 : 0,
    "missing scheduler rolls back fresh neutral setup",
  );
  if (marked)
    assert.equal(
      (await one(noCron, "select site_name from site_settings")).site_name,
      "Existing Member",
    );
  await noCron.close();
}
for (const table of [
  "conversion_sessions",
  "conversion_events",
  "conversion_order_links",
  "conversion_order_facts",
  "external_conversion_outcomes",
  "external_conversion_imports",
]) {
  const marked = new PGlite();
  await marked.exec(
    fixture + commerceFixture + conversionFixture + cronFixture,
  );
  await marked.exec(sql);
  await marked.exec(
    `insert into ${table} values(gen_random_uuid());delete from conversion_measurement_config;delete from cron.job`,
  );
  await assert.rejects(
    marked.exec(sql),
    new RegExp(`Refusing bootstrap: ${table}`),
  );
  await marked.exec("rollback");
  assert.equal(
    (await one(marked, `select count(*)::int n from ${table}`)).n,
    1,
    "inherited private conversion data is preserved",
  );
  assert.equal(
    (
      await one(
        marked,
        "select count(*)::int n from conversion_measurement_config",
      )
    ).n,
    0,
    "inherited data guard runs before configuration seeding even with an existing marker",
  );
  assert.equal(
    (await one(marked, "select count(*)::int n from cron.job")).n,
    0,
    "inherited data guard runs before scheduler writes even with an existing marker",
  );
  await marked.close();
}
for (const [jobName, command, error] of [
  [
    "conversion-retention-daily",
    "SELECT unrelated_operation()",
    /retention job conflicts/,
  ],
  ["owner-newsletter", "SELECT unrelated_operation()", /active jobs exist/],
]) {
  const inheritedJob = new PGlite();
  await inheritedJob.exec(
    fixture + commerceFixture + conversionFixture + cronFixture,
  );
  await inheritedJob.query(
    "insert into cron.job(jobname,schedule,command) values($1,'* * * * *',$2)",
    [jobName, command],
  );
  await assert.rejects(inheritedJob.exec(sql), error);
  await inheritedJob.exec("rollback");
  assert.equal(
    (await one(inheritedJob, "select command from cron.job")).command,
    command,
    "unrecognized scheduler job is never replaced",
  );
  assert.equal(
    (
      await one(
        inheritedJob,
        "select count(*)::int n from conversion_measurement_config",
      )
    ).n,
    0,
  );
  await inheritedJob.close();
}
const knownRetention = new PGlite();
await knownRetention.exec(
  fixture + commerceFixture + conversionFixture + cronFixture,
);
await knownRetention.exec(
  "select cron.schedule('conversion-retention-daily','23 4 * * *','SELECT public.conversion_cleanup()')",
);
await knownRetention.exec(sql);
assert.equal(
  (await one(knownRetention, "select count(*)::int n from cron.job")).n,
  1,
  "a schema installed with its recognized retention job can initialize safely",
);
await knownRetention.close();
console.log(
  "PASS: empty member bootstrap, automation and inquiry intake off, no subscribers, idempotent rerun, populated-owner/offer/order/receipt/private-file/inquiry refusal, preserved inherited data, current conversion config/retention initialization and repair, scheduler refusal, and older schema compatibility",
);
