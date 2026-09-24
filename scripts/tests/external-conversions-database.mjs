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
`);
await db.exec(
  readFileSync(
    "supabase/migrations/20260924100000_external_conversion_reconciliation.sql",
    "utf8",
  ),
);
const occurred = new Date(Date.now() - 3_600_000).toISOString();
const updated = new Date(Date.now() - 1_800_000).toISOString();
const row = (overrides = {}) => ({
  provider: "provider-export",
  record_id: "reg-1",
  outcome: "registration",
  destination: "summit-october",
  occurred_at: occurred,
  provider_updated_at: updated,
  status: "confirmed",
  mode: "live",
  amount_minor: null,
  currency: null,
  source: "email",
  medium: "newsletter",
  campaign: "fall-summit",
  ...overrides,
});
const importRows = async (rows, reference = "provider-export-2026") =>
  (
    await one(
      "SELECT public.admin_import_external_conversions($1::jsonb,$2) result",
      [JSON.stringify(rows), reference],
    )
  ).result;
const report = async (days = 30) =>
  (
    await one("SELECT public.admin_external_conversion_snapshot($1) result", [
      days,
    ])
  ).result;
await db.exec("SET ROLE anon");
await assert.rejects(() => importRows([row()]), /permission denied/);
await assert.rejects(() => report(), /permission denied/);
await assert.rejects(
  () => db.query("SELECT * FROM external_conversion_outcomes"),
  /permission denied/,
);
await db.exec("RESET ROLE; SET ROLE authenticated");
await assert.rejects(() => importRows([row()]), /Admin access required/);
await assert.rejects(() => report(), /Admin access required/);
await db.query(
  "SELECT set_config('test.user_id','00000000-0000-4000-8000-000000000002',false)",
);
await assert.rejects(() => report(), /Admin access required/);
await db.query(
  "SELECT set_config('test.user_id','00000000-0000-4000-8000-000000000001',false)",
);
await assert.rejects(
  () => db.query("SELECT * FROM external_conversion_outcomes"),
  /permission denied/,
);
await assert.rejects(
  () => db.query("DELETE FROM external_conversion_imports"),
  /permission denied/,
);
assert.equal((await report()).registrations, 0);
assert.deepEqual((await report()).imports, []);
const first = await importRows([row()]);
assert.equal(first.inserted, 1);
assert.equal(
  (await importRows([row()])).unchanged,
  1,
  "same record can be retried without duplication",
);
assert.equal((await report()).registrations, 1);
await assert.rejects(
  () => importRows([row({ campaign: "changed" })]),
  /same provider update time/,
  "same provider version cannot silently overwrite a different fact",
);
await assert.rejects(
  () => importRows([row({ record_id: "new" }), row({ campaign: "changed" })]),
  /same provider update time/,
);
assert.equal(
  (await report()).registrations,
  1,
  "an import with a later conflict is wholly rolled back",
);
const correction = row({
  status: "cancelled",
  provider_updated_at: new Date(Date.now() - 600_000).toISOString(),
});
assert.equal((await importRows([correction])).updated, 1);
assert.equal((await report()).registrations, 0);
assert.equal((await report()).cancelled_or_refunded, 1);
assert.equal(
  (await importRows([row()])).stale,
  1,
  "an old export cannot resurrect a cancelled registration",
);
assert.equal((await report()).registrations, 0);
const usd = row({
  record_id: "purchase-usd",
  outcome: "purchase",
  amount_minor: 700,
  currency: "USD",
});
const eur = row({
  record_id: "purchase-eur",
  outcome: "purchase",
  amount_minor: 1000,
  currency: "EUR",
  campaign: null,
});
const test = row({
  record_id: "test",
  outcome: "purchase",
  amount_minor: 9000,
  currency: "USD",
  mode: "test",
});
const unknown = row({ record_id: "unknown", mode: "unknown" });
const old = row({
  record_id: "old",
  occurred_at: new Date(Date.now() - 45 * 86400_000).toISOString(),
});
await importRows([usd, eur, test, unknown, old]);
let snapshot = await report();
assert.equal(snapshot.purchases, 2);
assert.equal(snapshot.registrations, 0);
assert.equal(snapshot.excluded_test_or_unknown, 2);
assert.equal(snapshot.without_campaign, 1);
assert.deepEqual(snapshot.revenue_by_currency, [
  { currency: "EUR", amount_minor: 1000 },
  { currency: "USD", amount_minor: 700 },
]);
assert.equal(snapshot.campaign_groups, 2);
assert.equal(
  snapshot.campaigns.find((value) => value.campaign === null).purchases,
  1,
);
assert.equal(
  (await report(90)).registrations,
  1,
  "outcome date, not import date, controls the range",
);
assert.equal(snapshot.imports[0].row_count, 5);
assert.equal(snapshot.imports[0].reference, "provider-export-2026");
assert.equal(
  "imported_by" in snapshot.imports[0],
  false,
  "aggregate report does not expose user IDs",
);
assert.equal(
  "record_id" in snapshot.campaigns[0],
  false,
  "aggregate campaign results have no provider record IDs",
);
assert.equal(
  "measured_sessions" in snapshot,
  false,
  "operational imports never invent browser attribution",
);
await importRows([
  {
    ...usd,
    status: "refunded",
    provider_updated_at: new Date(Date.now() - 500_000).toISOString(),
  },
]);
snapshot = await report();
assert.equal(snapshot.purchases, 1);
assert.deepEqual(
  snapshot.revenue_by_currency,
  [{ currency: "EUR", amount_minor: 1000 }],
  "full refunds remove the purchase value only from its own currency",
);
for (const bad of [
  row({ email: "private@example.test" }),
  row({ record_id: "private@example.test" }),
  row({ campaign: "https://private.test/contact" }),
  row({ provider: "" }),
  row({ source: 123 }),
  row({ mode: null }),
  row({ occurred_at: null }),
  row({ outcome: "click" }),
  row({ status: "refunded" }),
  row({ currency: "USD" }),
  row({ occurred_at: "2026-09-20" }),
  row({ occurred_at: "2026-02-30T00:00:00Z" }),
  row({ provider_updated_at: "1990-01-01T00:00:00Z" }),
  row({ provider_updated_at: "2099-01-01T00:00:00Z" }),
  row({ outcome: "purchase", amount_minor: 0, currency: "USD" }),
  row({ outcome: "purchase", amount_minor: -100, currency: "USD" }),
  row({ outcome: "purchase", amount_minor: 1.1, currency: "USD" }),
  row({ outcome: "purchase", amount_minor: "700", currency: "USD" }),
  row({
    outcome: "purchase",
    amount_minor: 9_000_000_000_001,
    currency: "USD",
  }),
  row({ outcome: "purchase", amount_minor: 700, currency: "usd" }),
  row({ outcome: "purchase", amount_minor: null, currency: "USD" }),
  [],
  null,
  "invalid",
])
  await assert.rejects(
    () => importRows([bad]),
    /Invalid import row/,
    `invalid row rejected: ${JSON.stringify(bad)}`,
  );
await assert.rejects(() => importRows([row(), row()]), /only once/);
await assert.rejects(() => importRows([]), /1 to 500/);
await assert.rejects(
  () =>
    importRows(
      Array.from({ length: 501 }, (_, n) => row({ record_id: `large-${n}` })),
    ),
  /1 to 500/,
);
await assert.rejects(
  () => importRows([row()], "private@example.test"),
  /export reference/,
);
await assert.rejects(() => report(0), /7, 30 or 90/);
await assert.rejects(() => report(null), /7, 30 or 90/);
assert.equal(
  (await report()).purchases,
  1,
  "rejected imports leave operational totals unchanged",
);
await db.exec("RESET ROLE");
assert.equal(
  (await one("SELECT count(*)::int n FROM external_conversion_outcomes")).n,
  6,
);
assert.equal(
  (
    await one(
      "SELECT count(*)::int n FROM pg_class WHERE relname IN ('external_conversion_outcomes','external_conversion_imports') AND relrowsecurity",
    )
  ).n,
  2,
);
console.log(
  "PASS: private external outcomes, admin-only atomic imports, strict fields, idempotency, conflict/stale reconciliation, refunds, mode/currency separation, provider attribution and reporting coverage.",
);
await db.close();
