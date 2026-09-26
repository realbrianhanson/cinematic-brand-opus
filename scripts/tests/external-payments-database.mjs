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
    "supabase/migrations/20260926190000_external_payment_reconciliation.sql",
    "utf8",
  ),
);
const stamp = (ago) => new Date(Date.now() - ago).toISOString();
const occurred = stamp(3_600_000);
const created = stamp(1_800_000);
const observed = stamp(600_000);
let sequence = 0;
const event = (overrides = {}) => ({
  provider: "stripe",
  account_id: "acct_External",
  mode: "live",
  event_id: `evt_${++sequence}`,
  payload_hash: "a".repeat(64),
  event_type: "checkout.session.completed",
  resolution: "applied",
  provider_created_at: created,
  observed_at: observed,
  ...overrides,
});
const payment = (overrides = {}) => ({
  payment_id: "pi_Purchase",
  charge_id: "ch_Purchase",
  destination: "pushten-membership",
  amount_minor: 99700,
  refunded_minor: 0,
  currency: "USD",
  occurred_at: occurred,
  price_ids: ["price_Annual"],
  refresh_fence: "1",
  ...overrides,
});
const applyRaw = async (receipt, payments) =>
  (
    await one(
      "SELECT public.external_payment_apply_event($1::jsonb,$2::jsonb) result",
      [JSON.stringify(receipt), JSON.stringify(payments)],
    )
  ).result;
const status = async (receipt) =>
  (
    await one(
      "SELECT public.external_payment_event_status($1,$2,$3,$4,$5) result",
      [
        receipt.provider,
        receipt.account_id,
        receipt.mode,
        receipt.event_id,
        receipt.payload_hash,
      ],
    )
  ).result;
const acquire = async (receipt, paymentId) =>
  (
    await one(
      "SELECT public.external_payment_acquire_refresh($1,$2,$3,$4) result",
      [receipt.provider, receipt.account_id, receipt.mode, paymentId],
    )
  ).result;
const release = async (receipt, paymentId, fence) =>
  (
    await one(
      "SELECT public.external_payment_release_refresh($1,$2,$3,$4,$5) result",
      [receipt.provider, receipt.account_id, receipt.mode, paymentId, fence],
    )
  ).result;
// Model the adapter's acquire-before-fetch / finally-release lifecycle. Cases
// testing stale, absent, malformed or expired fences call applyRaw directly.
const apply = async (receipt, payments) => {
  if ((await status(receipt)).status !== "missing")
    return applyRaw(receipt, payments);
  const leases = [];
  try {
    const prepared = [];
    for (const current of payments) {
      const lease = await acquire(receipt, current.payment_id);
      assert.equal(lease.status, "acquired");
      leases.push({ paymentId: current.payment_id, fence: lease.fence });
      prepared.push({ ...current, refresh_fence: lease.fence });
    }
    return await applyRaw(receipt, prepared);
  } finally {
    for (const lease of leases)
      await release(receipt, lease.paymentId, lease.fence);
  }
};
const report = async (days = 30) =>
  (
    await one("SELECT public.admin_external_payment_snapshot($1) result", [
      days,
    ])
  ).result;
const role = async (name, admin = false) => {
  await db.exec(`RESET ROLE; SET ROLE ${name}`);
  await db.query("SELECT set_config('test.user_id',$1,false)", [
    admin ? "00000000-0000-4000-8000-000000000001" : "",
  ]);
};
const adminReport = async (days = 30) => {
  await role("authenticated", true);
  const result = await report(days);
  await role("service_role");
  return result;
};

for (const caller of ["anon", "authenticated"]) {
  await role(caller, true);
  await assert.rejects(() => apply(event(), [payment()]), /permission denied/);
  await assert.rejects(() => status(event()), /permission denied/);
  await assert.rejects(
    () => acquire(event(), "pi_Forbidden"),
    /permission denied/,
  );
  await assert.rejects(
    () => release(event(), "pi_Forbidden", "1"),
    /permission denied/,
  );
  for (const table of [
    "external_payment_events",
    "external_payments",
    "external_payment_refreshes",
  ]) {
    await assert.rejects(
      () => db.query(`SELECT * FROM public.${table}`),
      /permission denied/,
    );
    await assert.rejects(
      () => db.query(`DELETE FROM public.${table}`),
      /permission denied/,
    );
  }
}
await role("anon");
await assert.rejects(() => report(), /permission denied/);
await role("authenticated");
await assert.rejects(() => report(), /Admin access required/);
await db.query(
  "SELECT set_config('test.user_id','00000000-0000-4000-8000-000000000002',false)",
);
await assert.rejects(() => report(), /Admin access required/);
await role("authenticated", true);
const empty = await report();
assert.deepEqual(empty.live, {
  payments: 0,
  unrefunded_payments: 0,
  partial_refund_payments: 0,
  full_refund_payments: 0,
  revenue_by_currency: [],
});
assert.deepEqual(empty.test, empty.live);
assert.equal(empty.last_received_at, null);
assert.equal(empty.last_processed_at, null);
assert.deepEqual(empty.latest_events, []);
assert.deepEqual(empty.coverage, {
  scope: "verified_callbacks_only",
  complete: false,
  historical_backfill: false,
  browser_attribution: false,
});
await assert.rejects(() => report(0), /7, 30 or 90/);
await assert.rejects(() => report(null), /7, 30 or 90/);
await role("service_role");
await assert.rejects(() => report(), /permission denied/);
await assert.rejects(
  () => db.query("SELECT * FROM public.external_payments"),
  /permission denied/,
  "service ingestion is confined to RPCs even though the role bypasses RLS",
);

const first = event();
assert.deepEqual(await status(first), { status: "missing" });
assert.deepEqual(await apply(first, [payment()]), {
  status: "processed",
  resolution: "applied",
  payment_count: 1,
  inserted: 1,
  updated: 0,
  unchanged: 0,
  refund_decreases: 0,
});
assert.deepEqual(await status(first), {
  status: "processed",
  resolution: "applied",
  payment_count: 1,
});
assert.equal((await apply(first, [payment()])).status, "duplicate");
assert.equal(
  (await apply({ ...first, observed_at: stamp(100_000) }, [payment()])).status,
  "duplicate",
  "retry API observation times do not change the event identity",
);
assert.deepEqual(await status({ ...first, payload_hash: "b".repeat(64) }), {
  status: "conflict",
});
assert.deepEqual(await status({ ...first, mode: "test" }), {
  status: "conflict",
});
for (const change of [
  { payload_hash: "b".repeat(64) },
  { mode: "test" },
  { event_type: "invoice.payment_succeeded" },
  { provider_created_at: stamp(1_700_000) },
])
  await assert.rejects(
    () => apply({ ...first, ...change }, [payment()]),
    /conflicts with a processed event/,
  );
assert.equal((await adminReport()).accepted_event_count, 1);

assert.equal(
  (await apply(event({ event_type: "invoice.payment_succeeded" }), [payment()]))
    .unchanged,
  1,
  "Checkout and its invoice share one canonical payment",
);
assert.equal(
  (
    await apply(event({ event_type: "refund.updated" }), [
      payment({ refunded_minor: 20000 }),
    ])
  ).updated,
  1,
);
let snapshot = await adminReport();
assert.equal(snapshot.live.payments, 1);
assert.equal(snapshot.live.partial_refund_payments, 1);
assert.equal(snapshot.live.full_refund_payments, 0);
assert.deepEqual(snapshot.live.revenue_by_currency, [
  {
    currency: "USD",
    gross_minor: "99700",
    refunded_minor: "20000",
    net_minor: "79700",
  },
]);
assert.equal(
  (
    await apply(
      event({
        event_type: "refund.updated",
        provider_created_at: stamp(2_000_000),
      }),
      [payment()],
    )
  ).refund_decreases,
  1,
  "a new fenced refresh can observe a succeeded refund now requiring action, regardless of event creation order",
);
snapshot = await adminReport();
assert.equal(snapshot.live.partial_refund_payments, 0);
assert.equal(snapshot.live.unrefunded_payments, 1);
assert.equal(snapshot.live.revenue_by_currency[0].refunded_minor, "0");
assert.equal(
  (
    await apply(event({ event_type: "charge.refunded" }), [
      payment({ refunded_minor: 99700 }),
    ])
  ).updated,
  1,
);
snapshot = await adminReport();
assert.equal(snapshot.live.full_refund_payments, 1);
assert.equal(snapshot.live.partial_refund_payments, 0);
assert.equal(snapshot.live.unrefunded_payments, 0);
assert.deepEqual(snapshot.live.revenue_by_currency, [
  {
    currency: "USD",
    gross_minor: "99700",
    refunded_minor: "99700",
    net_minor: "0",
  },
]);
const failedRefund = await apply(event({ event_type: "refund.failed" }), [
  payment(),
]);
assert.equal(failedRefund.updated, 1);
assert.equal(failedRefund.refund_decreases, 1);
snapshot = await adminReport();
assert.equal(snapshot.live.full_refund_payments, 0);
assert.equal(snapshot.live.revenue_by_currency[0].net_minor, "99700");
await apply(event({ event_type: "refund.updated" }), [
  payment({ refunded_minor: 99700 }),
]);
snapshot = await adminReport();

const beforeConflicts = snapshot.accepted_event_count;
for (const change of [
  { charge_id: "ch_Different" },
  { destination: "different-offer" },
  { amount_minor: 99701 },
  { currency: "EUR" },
  { occurred_at: stamp(3_500_000) },
  { price_ids: ["price_Other"] },
]) {
  const conflicted = event();
  await assert.rejects(
    () => apply(conflicted, [payment(change)]),
    /conflicts with saved payment facts or mapping/,
  );
  assert.equal((await status(conflicted)).status, "missing");
}
await assert.rejects(
  () => apply(event({ mode: "test" }), [payment()]),
  /refresh mode conflicts with saved mode/,
  "mode is immutable for a canonical payment within its account",
);
await assert.rejects(
  () =>
    apply(event(), [
      payment({ payment_id: "ch_Purchase", charge_id: "ch_Purchase" }),
    ]),
  /charge conflicts with an existing canonical payment identity/,
  "a charge alias cannot count the same payment twice",
);
const atomic = event();
await assert.rejects(
  () =>
    apply(atomic, [
      payment({ payment_id: "pi_AFirst", charge_id: "ch_AFirst" }),
      payment({ currency: "EUR" }),
    ]),
  /conflicts with saved payment facts or mapping/,
);
assert.equal((await status(atomic)).status, "missing");
snapshot = await adminReport();
assert.equal(snapshot.live.payments, 1);
assert.equal(snapshot.accepted_event_count, beforeConflicts);
assert.equal(
  (await apply(atomic, [payment({ refunded_minor: 99700 })])).unchanged,
  1,
  "a failed transaction leaves the event retryable",
);

await apply(event(), [
  payment({
    payment_id: "pi_Euro",
    charge_id: "ch_Euro",
    amount_minor: 1200,
    currency: "EUR",
    price_ids: ["price_B", "price_A"],
  }),
  payment({
    payment_id: "pi_ZeroDecimal",
    charge_id: "ch_ZeroDecimal",
    amount_minor: 1200,
    currency: "JPY",
  }),
]);
assert.equal(
  (
    await apply(event(), [
      payment({
        payment_id: "pi_Euro",
        charge_id: "ch_Euro",
        amount_minor: 1200,
        currency: "EUR",
        price_ids: ["price_A", "price_B"],
      }),
    ])
  ).unchanged,
  1,
  "price mappings are compared as canonical sets",
);
await apply(event({ mode: "test" }), [
  payment({
    payment_id: "pi_Test",
    charge_id: "ch_Test",
    amount_minor: 700,
  }),
]);
await apply(event({ account_id: "acct_Second" }), [payment()]);
await apply(event(), [
  payment({
    payment_id: "pi_Old",
    charge_id: "ch_Old",
    occurred_at: stamp(45 * 86400_000),
  }),
]);
snapshot = await adminReport();
assert.equal(snapshot.live.payments, 4);
assert.equal(snapshot.test.payments, 1);
assert.equal(snapshot.live.full_refund_payments, 1);
assert.deepEqual(snapshot.test.revenue_by_currency, [
  {
    currency: "USD",
    gross_minor: "700",
    refunded_minor: "0",
    net_minor: "700",
  },
]);
assert.deepEqual(snapshot.live.revenue_by_currency, [
  {
    currency: "EUR",
    gross_minor: "1200",
    refunded_minor: "0",
    net_minor: "1200",
  },
  {
    currency: "JPY",
    gross_minor: "1200",
    refunded_minor: "0",
    net_minor: "1200",
  },
  {
    currency: "USD",
    gross_minor: "199400",
    refunded_minor: "99700",
    net_minor: "99700",
  },
]);
assert.equal((await adminReport(90)).live.payments, 5);
assert.equal(snapshot.destination_group_count, 5);
assert.equal(snapshot.destinations.length, 5);
assert.equal(
  snapshot.accepted_event_count_in_range,
  snapshot.accepted_event_count,
);
for (const resolution of ["unmapped", "unsupported", "not_paid"]) {
  const unapplied = event({ resolution });
  assert.equal((await apply(unapplied, [])).payment_count, 0);
  assert.equal((await status(unapplied)).resolution, resolution);
  assert.equal((await apply(unapplied, [])).status, "duplicate");
}
snapshot = await adminReport();
assert.equal(snapshot.live.payments, 4);
assert.equal(snapshot.resolution_counts.unmapped, 1);
assert.equal(snapshot.resolution_counts.unsupported, 1);
assert.equal(snapshot.resolution_counts.not_paid, 1);
assert.equal(
  snapshot.resolution_counts.applied + 3,
  snapshot.accepted_event_count_in_range,
);
assert(snapshot.event_types.some((r) => r.mode === "test"));
assert(snapshot.event_types.some((r) => r.resolution === "unmapped"));
assert(snapshot.last_received_at);
assert(snapshot.last_processed_at);
assert(snapshot.latest_events.some((r) => r.resolution === "unsupported"));
for (const entry of snapshot.latest_events) {
  assert.equal("event_id" in entry, false);
  assert.equal("payload_hash" in entry, false);
}
assert.equal("measured_sessions" in snapshot, false);
assert.equal("native_orders" in snapshot, false);

for (const change of [
  { provider: "other" },
  { account_id: "acct_private@example.test" },
  { account_id: null },
  { mode: "unknown" },
  { event_id: "event-1" },
  { payload_hash: "A".repeat(64) },
  { payload_hash: null },
])
  await assert.rejects(() => status(event(change)), /Invalid external payment/);

for (const bad of [
  null,
  [],
  "invalid",
  event({ provider: "other" }),
  event({ email: "private@example.test" }),
  event({ mode: "unknown" }),
  event({ mode: null }),
  event({ mode: 1 }),
  event({ account_id: "acct_" }),
  event({ event_id: "private@example.test" }),
  event({ payload_hash: "a".repeat(65) }),
  event({ payload_hash: "A".repeat(64) }),
  event({ event_type: "invoice.paid" }),
  event({ resolution: "ignored" }),
  event({ provider_created_at: "2026-02-30T00:00:00Z" }),
  event({ provider_created_at: "1990-01-01T00:00:00Z" }),
  event({ provider_created_at: "2099-01-01T00:00:00Z" }),
  event({ observed_at: occurred }),
  event({ observed_at: "2099-01-01T00:00:00Z" }),
  event({ observed_at: "2026-09-26" }),
  Object.fromEntries(Object.entries(event()).filter(([key]) => key !== "mode")),
])
  await assert.rejects(
    () => applyRaw(bad, [payment()]),
    /Invalid external payment event|cannot call jsonb_each/,
    `invalid event rejected: ${JSON.stringify(bad)}`,
  );

for (const bad of [
  null,
  [],
  "invalid",
  payment({ email: "private@example.test" }),
  payment({ payment_id: "private@example.test" }),
  payment({ payment_id: null }),
  payment({ charge_id: "pi_NotCharge" }),
  payment({ payment_id: "ch_Other" }),
  payment({ destination: "https://example.test" }),
  payment({ amount_minor: 0 }),
  payment({ amount_minor: -1 }),
  payment({ amount_minor: 1.1 }),
  payment({ amount_minor: "99700" }),
  payment({ amount_minor: 9_000_000_000_001 }),
  payment({ refunded_minor: -1 }),
  payment({ refunded_minor: 99701 }),
  payment({ refunded_minor: 0.1 }),
  payment({ refunded_minor: "0" }),
  payment({ currency: "usd" }),
  payment({ currency: null }),
  payment({ occurred_at: "2026-02-30T00:00:00Z" }),
  payment({ occurred_at: "1990-01-01T00:00:00Z" }),
  payment({ occurred_at: "2099-01-01T00:00:00Z" }),
  payment({ occurred_at: "2026-09-26" }),
  payment({ price_ids: [] }),
  payment({ price_ids: null }),
  payment({ price_ids: "price_Test" }),
  payment({ price_ids: [null] }),
  payment({ price_ids: [123] }),
  payment({ price_ids: ["price_Annual", "price_Annual"] }),
  payment({ price_ids: ["prod_WrongType"] }),
  payment({ price_ids: Array.from({ length: 101 }, (_, n) => `price_${n}`) }),
  payment({ refresh_fence: "0" }),
  payment({ refresh_fence: "01" }),
  payment({ refresh_fence: "-1" }),
  payment({ refresh_fence: "1.5" }),
  payment({ refresh_fence: "9223372036854775808" }),
  payment({ refresh_fence: 1 }),
  payment({ refresh_fence: null }),
  Object.fromEntries(
    Object.entries(payment()).filter(([key]) => key !== "refresh_fence"),
  ),
  Object.fromEntries(
    Object.entries(payment()).filter(([key]) => key !== "refunded_minor"),
  ),
]) {
  const invalid = event();
  await assert.rejects(
    () => applyRaw(invalid, [bad]),
    /Invalid external payment fields/,
    `invalid payment rejected: ${JSON.stringify(bad)}`,
  );
  assert.equal((await status(invalid)).status, "missing");
}
await assert.rejects(() => applyRaw(event(), null), /must be an array/);
await assert.rejects(() => applyRaw(event(), {}), /must be an array/);
await assert.rejects(() => applyRaw(event(), []), /1 to 20/);
await assert.rejects(
  () => applyRaw(event({ resolution: "unmapped" }), [payment()]),
  /zero unapplied payments/,
);
await assert.rejects(
  () => applyRaw(event(), [payment(), payment()]),
  /only once/,
);
await assert.rejects(
  () => applyRaw(event(), [payment(), payment({ payment_id: "pi_Other" })]),
  /only once/,
);
await assert.rejects(
  () =>
    applyRaw(
      event(),
      Array.from({ length: 21 }, (_, n) =>
        payment({ payment_id: `pi_Large${n}`, charge_id: `ch_Large${n}` }),
      ),
    ),
  /1 to 20/,
);

// A maximum-sized invoice remains bounded; monetary aggregates are decimal text.
const batch = Array.from({ length: 20 }, (_, n) =>
  payment({
    payment_id: `pi_Batch${n}`,
    charge_id: `ch_Batch${n}`,
    amount_minor: 9_000_000_000_000,
    currency: "GBP",
  }),
);
assert.equal((await apply(event(), batch)).inserted, 20);
snapshot = await adminReport();
assert.deepEqual(
  snapshot.live.revenue_by_currency.find((r) => r.currency === "GBP"),
  {
    currency: "GBP",
    gross_minor: "180000000000000",
    refunded_minor: "0",
    net_minor: "180000000000000",
  },
);
for (let n = 0; n < 5; n++) await apply(event({ resolution: "not_paid" }), []);
assert.equal((await adminReport()).latest_events.length, 20);

// Expire fixtures without sleeping; production uses the database's 60s lease.
const expireLease = async (receipt, paymentId) => {
  await db.exec("RESET ROLE");
  await db.query(
    "UPDATE public.external_payment_refreshes SET lease_until=clock_timestamp()-interval '1 second' WHERE provider=$1 AND account_id=$2 AND payment_id=$3",
    [receipt.provider, receipt.account_id, paymentId],
  );
  await role("service_role");
};
const fencedEvent = event({ event_type: "refund.updated" });
const fencedPayment = payment({
  payment_id: "pi_Fenced",
  charge_id: "ch_Fenced",
  amount_minor: 100,
  refunded_minor: 80,
  currency: "CAD",
});
await assert.rejects(
  () => applyRaw(fencedEvent, [fencedPayment]),
  /refresh lease is missing, expired or stale/,
  "a payment requires a current refresh lease before facts can be written",
);
assert.equal((await status(fencedEvent)).status, "missing");
const acquisitions = await Promise.all([
  acquire(fencedEvent, fencedPayment.payment_id),
  acquire(fencedEvent, fencedPayment.payment_id),
]);
assert.deepEqual(acquisitions, [
  { status: "acquired", fence: "1" },
  { status: "busy" },
]);
assert.equal(await release(fencedEvent, fencedPayment.payment_id, "2"), false);
assert.equal(
  await release(
    { ...fencedEvent, mode: "test" },
    fencedPayment.payment_id,
    "1",
  ),
  false,
);
assert.deepEqual(await acquire(fencedEvent, fencedPayment.payment_id), {
  status: "busy",
});
await assert.rejects(
  () => acquire({ ...fencedEvent, mode: "test" }, fencedPayment.payment_id),
  /mode conflicts/,
);
await expireLease(fencedEvent, fencedPayment.payment_id);
await assert.rejects(
  () => applyRaw(fencedEvent, [fencedPayment]),
  /refresh lease is missing, expired or stale/,
);
assert.equal((await status(fencedEvent)).status, "missing");
assert.deepEqual(await acquire(fencedEvent, fencedPayment.payment_id), {
  status: "acquired",
  fence: "2",
});
await assert.rejects(
  () => applyRaw(fencedEvent, [fencedPayment]),
  /refresh lease is missing, expired or stale/,
  "an expired older generation cannot use a newer owner's active lease",
);
assert.equal(await release(fencedEvent, fencedPayment.payment_id, "1"), false);
assert.equal(
  (await applyRaw(fencedEvent, [{ ...fencedPayment, refresh_fence: "2" }]))
    .inserted,
  1,
);
assert.equal(await release(fencedEvent, fencedPayment.payment_id, "2"), false);
assert.equal(
  (
    await applyRaw(fencedEvent, [
      { ...fencedPayment, refresh_fence: "not-a-current-fence" },
    ])
  ).status,
  "duplicate",
  "durable event deduplication precedes payment fence validation",
);
const failedFenced = event({
  event_type: "refund.failed",
  provider_created_at: stamp(2_000_000),
});
assert.deepEqual(await acquire(failedFenced, fencedPayment.payment_id), {
  status: "acquired",
  fence: "3",
});
const correction = await applyRaw(failedFenced, [
  { ...fencedPayment, refunded_minor: 0, refresh_fence: "3" },
]);
assert.equal(correction.updated, 1);
assert.equal(correction.refund_decreases, 1);
assert.deepEqual(
  (await adminReport()).live.revenue_by_currency.find(
    (r) => r.currency === "CAD",
  ),
  {
    currency: "CAD",
    gross_minor: "100",
    refunded_minor: "0",
    net_minor: "100",
  },
);
const expiredCallback = event({ event_type: "charge.refunded" });
await assert.rejects(
  () => applyRaw(expiredCallback, [{ ...fencedPayment, refresh_fence: "2" }]),
  /refresh lease is missing, expired or stale/,
  "an old read cannot restore the refund after a newer fenced correction",
);
assert.deepEqual(await acquire(expiredCallback, fencedPayment.payment_id), {
  status: "acquired",
  fence: "4",
});
await expireLease(expiredCallback, fencedPayment.payment_id);
assert.deepEqual(await acquire(expiredCallback, fencedPayment.payment_id), {
  status: "acquired",
  fence: "5",
});
await assert.rejects(
  () => applyRaw(expiredCallback, [{ ...fencedPayment, refresh_fence: "4" }]),
  /refresh lease is missing, expired or stale/,
);
assert.equal(
  await release(expiredCallback, fencedPayment.payment_id, "4"),
  false,
);
assert.deepEqual(await acquire(expiredCallback, fencedPayment.payment_id), {
  status: "busy",
});
assert.equal(
  (
    await applyRaw(expiredCallback, [
      { ...fencedPayment, refunded_minor: 0, refresh_fence: "5" },
    ])
  ).unchanged,
  1,
);
assert.deepEqual(await acquire(expiredCallback, fencedPayment.payment_id), {
  status: "acquired",
  fence: "6",
});
assert.equal(
  await release(expiredCallback, fencedPayment.payment_id, "6"),
  true,
);
assert.equal(
  await release(expiredCallback, fencedPayment.payment_id, "6"),
  false,
);
await assert.rejects(
  () => applyRaw(event(), [{ ...fencedPayment, refresh_fence: "6" }]),
  /refresh lease is missing, expired or stale/,
  "a released token is consumed and cannot be reused",
);

const atomicRefresh = event();
const atomicPayments = ["A", "B"].map((suffix) =>
  payment({
    payment_id: `pi_Atomic${suffix}`,
    charge_id: `ch_Atomic${suffix}`,
  }),
);
for (const current of atomicPayments)
  assert.equal((await acquire(atomicRefresh, current.payment_id)).fence, "1");
await expireLease(atomicRefresh, atomicPayments[1].payment_id);
const beforeAtomic = (await adminReport()).live.payments;
await assert.rejects(
  () => applyRaw(atomicRefresh, atomicPayments),
  /refresh lease is missing, expired or stale/,
);
assert.equal((await status(atomicRefresh)).status, "missing");
assert.equal((await adminReport()).live.payments, beforeAtomic);
assert.deepEqual(await acquire(atomicRefresh, atomicPayments[0].payment_id), {
  status: "busy",
});
assert.equal(
  (await acquire(atomicRefresh, atomicPayments[1].payment_id)).fence,
  "2",
);
assert.equal(
  await release(atomicRefresh, atomicPayments[1].payment_id, "1"),
  false,
);
assert.equal(
  (
    await applyRaw(atomicRefresh, [
      atomicPayments[0],
      { ...atomicPayments[1], refresh_fence: "2" },
    ])
  ).inserted,
  2,
  "a later expired lease rolls back all facts without consuming valid earlier leases",
);
for (const [index, current] of atomicPayments.entries())
  assert.equal(
    await release(atomicRefresh, current.payment_id, String(index + 1)),
    false,
    "successful batch atomically releases every applied lease",
  );

for (const change of [
  { provider: "other" },
  { account_id: null },
  { account_id: "acct_private@example.test" },
  { mode: null },
  { mode: "unknown" },
]) {
  await assert.rejects(
    () => acquire({ ...fencedEvent, ...change }, fencedPayment.payment_id),
    /Invalid external payment refresh/,
  );
  await assert.rejects(
    () => release({ ...fencedEvent, ...change }, fencedPayment.payment_id, "1"),
    /Invalid external payment refresh/,
  );
}
for (const fence of [null, "0", "01", "-1", "1.5", "9223372036854775808"])
  await assert.rejects(
    () => release(fencedEvent, fencedPayment.payment_id, fence),
    /Invalid external payment refresh/,
  );
await assert.rejects(
  () => acquire(fencedEvent, "private@example.test"),
  /Invalid external payment refresh/,
);
await assert.rejects(
  () => db.query("SELECT * FROM public.external_payment_refreshes"),
  /permission denied/,
);
await db.exec("RESET ROLE");
await db.query(
  "UPDATE public.external_payment_refreshes SET fence=9007199254740991,lease_until=null WHERE provider=$1 AND account_id=$2 AND payment_id=$3",
  [fencedEvent.provider, fencedEvent.account_id, fencedPayment.payment_id],
);
await role("service_role");
assert.equal(
  (await acquire(fencedEvent, fencedPayment.payment_id)).fence,
  "9007199254740992",
);
await release(fencedEvent, fencedPayment.payment_id, "9007199254740992");
assert.equal(
  (await acquire(fencedEvent, fencedPayment.payment_id)).fence,
  "9007199254740993",
);
await release(fencedEvent, fencedPayment.payment_id, "9007199254740993");

await db.exec("RESET ROLE");
// Seed a larger fixture in the isolated database to cross JavaScript's exact
// integer range without requiring thousands of individual provider callbacks.
await db.exec(`
INSERT INTO public.external_payments (
  provider,account_id,payment_id,charge_id,mode,destination,amount_minor,
  refunded_minor,currency,occurred_at,price_ids,first_observed_at,last_observed_at
)
SELECT 'stripe','acct_External','pi_Precision' || n,'ch_Precision' || n,
  'live','pushten-membership',9000000000000,
  CASE WHEN n = 1 THEN 1 ELSE 0 END,'CHF',now() - interval '1 hour',
  ARRAY['price_Annual'],now() - interval '10 minutes',now() - interval '10 minutes'
FROM generate_series(1,1002) n;
`);
snapshot = await adminReport();
assert.deepEqual(
  snapshot.live.revenue_by_currency.find((r) => r.currency === "CHF"),
  {
    currency: "CHF",
    gross_minor: "9018000000000000",
    refunded_minor: "1",
    net_minor: "9017999999999999",
  },
  "totals larger than Number.MAX_SAFE_INTEGER remain exact decimal strings",
);
await db.exec("RESET ROLE");
const saved = await one(
  "SELECT refunded_minor::text,first_observed_at,last_observed_at FROM public.external_payments WHERE account_id='acct_External' AND payment_id='pi_Purchase'",
);
assert.equal(saved.refunded_minor, "99700");
assert(saved.first_observed_at <= saved.last_observed_at);
assert.equal(
  (
    await one(
      "SELECT count(*)::int n FROM pg_class WHERE relname IN ('external_payment_events','external_payments','external_payment_refreshes') AND relrowsecurity",
    )
  ).n,
  3,
);
assert.equal(
  (
    await one(
      "SELECT count(*)::int n FROM public.external_payment_events WHERE inserted+updated+unchanged <> payment_count OR refund_decreases > updated",
    )
  ).n,
  0,
  "every committed receipt accounts for its whole payment batch",
);
console.log(
  "PASS: service-only atomic external payments, private RLS tables, strict minimized fields, durable event retries/conflicts, canonical payment deduplication, immutable mapping, fenced refund refreshes, isolated mode/currency reporting, and honest callback-only coverage.",
);
await db.close();
