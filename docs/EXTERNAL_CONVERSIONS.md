# Confirmed external conversions

The Conversions page can reconcile **verified provider exports** for off-site summit registrations and purchases. This first version is a manual operational ledger, not an installed GHL integration or cross-domain session attribution. It sends no messages, subscribes nobody, and never upgrades an outbound click to a confirmed result.

## Setup and use

1. Apply `20260924100000_external_conversion_reconciliation.sql`, then publish the frontend. No edge function or new secret is required for manual reconciliation.
2. Export confirmed registrations/orders from the actual provider. Include cancellations, full refunds and corrections when reconciling. Confirm which records are live; do not assume unknown/test records are live.
3. In **Admin → Conversions → Confirmed external outcomes**, download the CSV template. Prepare only its 13 columns; remove email, customer name, address, full URLs and other personal information. Raw contact exports are deliberately rejected.
4. Use a consistent `provider` slug and stable `record_id` (registration/order ID, never a person's email or name). The deduplication key is provider + record ID + outcome. Changing the provider label or record ID creates a different record, so keep that mapping consistent across exports. Never import this site's native orders; there is no combined native/external revenue total.
5. Preview the file, enter a short export reference without personal information, verify the checkbox, then import. Each file is at most 500 rows and 256 KiB; the server separately bounds the expanded JSON to 256 KiB, so split a wide export if needed.
6. Repeat with later exports. Identical retries are harmless, older provider updates are ignored, and different facts with the same provider update time are rejected. A newer verified provider update corrects the record. An error rolls back the whole file. Records missing from an export are retained; mark cancelled/refunded records explicitly.

The template has headers only so sample activity cannot accidentally populate production reporting. Example values below are documentation, not imported data.

| Field                          | Meaning                                                                                                                                                                                                                                                                               |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `provider`                     | Stable lowercase slug, e.g. `ghl-summit`. Use only after verifying the actual provider.                                                                                                                                                                                               |
| `record_id`                    | Stable provider registration/order ID. Letters, numbers, `.`, `_`, `:`, `-`, max 128 characters.                                                                                                                                                                                      |
| `outcome`                      | `registration` or `purchase`.                                                                                                                                                                                                                                                         |
| `destination`                  | Stable funnel/event slug, e.g. `summit-october-2026`.                                                                                                                                                                                                                                 |
| `occurred_at`                  | Provider outcome date, full ISO timestamp with explicit time zone, e.g. `2026-09-24T14:30:00Z`.                                                                                                                                                                                       |
| `provider_updated_at`          | Last provider update timestamp. For immutable records use their outcome timestamp. If no update timestamp exists, use the **verified export's actual as-of time**, keeping it identical on retries. Do not invent a newer timestamp merely to force a conflicting correction through. |
| `status`                       | `confirmed`, `cancelled`, or `refunded`. Refunded is only for a fully refunded purchase; it excludes that purchase's entire value.                                                                                                                                                    |
| `mode`                         | `live`, `test`, or `unknown`. Only confirmed live records contribute to the main counts/value.                                                                                                                                                                                        |
| `amount_minor`                 | Positive integer in the currency's minor units, e.g. USD 7.00 = `700`, JPY 700 = `700`, KWD 1.234 = `1234`. Empty for registrations.                                                                                                                                                  |
| `currency`                     | Provider's three-letter uppercase currency code. Empty for registrations.                                                                                                                                                                                                             |
| `source`, `medium`, `campaign` | Optional provider-reported attribution slugs. Lowercase letters, numbers, `_`, `-`, max 64 characters. Empty if unknown. Never map a person or contact ID here.                                                                                                                       |

## Reporting and limitations

- Date ranges use `occurred_at`, not import time: 7, 30 or 90 UTC calendar days including today. Corrections change the current status of the original outcome; refund counts are not a refund-processed date report.
- Provider registrations and purchases are **records, not deduplicated people**. This feature cannot infer whether two providers' IDs refer to the same person or the same transaction.
- Confirmed live purchases are summed separately by currency with each currency's minor-unit exponent. They are recorded value before payment fees, not profit/payout. No currency conversion or combined native/external revenue is calculated.
- Only full refunds are supported. Do not label a partially refunded order as fully refunded or silently edit its gross amount to represent a net refund. Add a separately specified partial-refund accounting model before reporting those amounts here.
- Top 50 provider/destination/source/medium/campaign groups are shown, along with the full group count. Summary totals cover all supplied records in the period. Missing campaign labels remain unknown.
- Provider attribution labels are reported as supplied. They do not prove that a consenting session on this website produced the outcome. There are no session conversion rates, email matching, cookie/session ID forwarding, or guessed first/last-touch attribution for imports.
- The last ten imports show their reference, time, additions, corrections, unchanged retries and ignored stale updates. An import time is not a guarantee of complete provider coverage. Nothing is connected automatically, and zero imported records does not imply zero external conversions.

## Access and privacy

Both ledger and import tables have RLS enabled and no anonymous/authenticated direct table grants. The only authenticated API entry points are `admin_import_external_conversions` and `admin_external_conversion_snapshot`; both independently require `is_admin(auth.uid())`. Reports contain aggregate facts and bounded import history, never provider record IDs or the importing user's ID. Unknown fields, contact-looking IDs, full URL attribution and malformed financial/date data are rejected. Administrator verification is still required: software cannot prove that an arbitrary permitted slug is not someone's name or that an uploaded export is authentic.

Imports are serialized in a database transaction to make conflict resolution deterministic. Status/mode/value/attribution corrections require a later provider update time; exact retries are deduplicated. Logs retain only the export reference and summary counts; outcome rows retain latest facts plus first/last import times and the importing admin ID. This is a reconciliation ledger, not an immutable financial audit trail of every previous value.

Member bootstrap refuses inherited rows in either external-conversion table, including when a copied setup marker exists.

The new operational facts have **no** relationship to optional browser measurement, so they do not change consent collection, consent withdrawal, retention cleanup, native orders, or newsletter subscriptions. Operational records persist until deliberately removed by a database administrator, independent of browser-session retention. Keep source exports privately under the business's record-retention policy; never commit real exports to the repository.

## Future provider callback contract

No unauthenticated callback is exposed and no provider keys were assumed. Before adding automation:

1. Verify the provider account, its event/export API, stable registration/order IDs, full/partial refund semantics, live/test mode and signature scheme using that provider's actual documentation.
2. Use a dedicated server endpoint that validates the provider signature and timestamp, verifies event details against the provider when required, and maps only the allowed fields above. Keep event IDs separate from the stable registration/order IDs used for reconciliation.
3. Add bounded retries and a durable event-inbox idempotency key; reused event IDs with different payloads must be rejected. Reject unsigned, stale, wrong-account and unknown-mode-as-live events. Use a dedicated, server-only ingestion function rather than weakening the admin RPC check.
4. Preserve the current separate operational report. Introducing visitor-level attribution requires its own consent-aware design and validation; do not place raw visitor IDs or contact data in outbound URLs.
5. Test authenticated callbacks, bad signatures, provider retries, out-of-order updates, cancellations, full and partial refunds, currency units and agreement with the provider's own totals before enabling automated coverage labels.

## Checks

- `node scripts/tests/external-conversions-database.mjs`: isolated SQL roles/access, strict inputs, transaction rollback, repeated/stale/conflicting imports, cancellations, refunds, live/test/unknown separation, currencies, date windows and coverage labels.
- `src/lib/__tests__/externalConversions.test.ts`: CSV parsing/privacy guardrails, boundary validation and currency exponents.
- `src/components/admin/__tests__/ExternalConversionPanel.test.tsx`: empty coverage, explicit verification, invalid files and safely retryable failures.

These checks use fixture data only; they import nothing into production and call no paid provider.
