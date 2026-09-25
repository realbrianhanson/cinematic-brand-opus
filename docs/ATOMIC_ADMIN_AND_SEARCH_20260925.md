# Atomic admin saves and Search Console imports

## Changes

- Widget movement now runs as one admin-only database transaction. It checks the two displayed order values and their current adjacency, normalizes tied order values, and swaps both neighbors together. A stale neighbor or failed write leaves the whole order unchanged. The browser reloads the confirmed order and releases controls on failure or timeout.
- Brand & publishing saves public identity and private strategy/settings in one transaction. Both loaded timestamps must still match. An error, invalid private field, missing row, or stale session cannot leave only the public half saved. Only the form's explicit fields can be changed; automation and speaking configuration remain untouched. The browser keeps draft text after rejection.
- Site Config includes the exact Search Console property. Domain properties (`sc-domain:example.com`) and HTTPS URL-prefix properties (including path prefixes) are supported. A blank value preserves the existing Site URL fallback. The property remains in the admin-only settings table.
- Search Console rows are uploaded to isolated staging tables. Only a service-role completion transaction can replace an active period, and it verifies the complete expected row count first. A failed provider request, chunk insert, or activation leaves the previous complete period intact. Activation is idempotent, rejects an older concurrent import for the same period, and records successful zero-row imports.
- The performance report uses completed-import metadata for empty periods and displays import failures/in-progress state and the active property. Incomplete snapshots are never promoted into report data. New provider and database calls have explicit request deadlines.

## Validation

- `scripts/tests/atomic-admin-database.mjs`: isolated PostgreSQL coverage for anonymous/null-user denial, atomic public/private rollback, stale settings versions, field allowlists, preserved unrelated private settings, tied widget ordering, cross-zone rejection, stale order rejection, and injected second-widget-write rollback.
- `scripts/tests/atomic-gsc-database.mjs`: isolated PostgreSQL coverage for service-only activation, partial import rejection, last-good preservation, lost-response idempotency, stale concurrent import rejection, injected activation rollback, and successful empty import.
- `scripts/tests/admin-overview-database.mjs`: existing report scenarios plus completed-empty period metadata and latest failed-import status.
- Six GSC behavior tests cover property resolution, multi-chunk staging before activation, later-chunk failure, empty completion, provider/malformed-data failure, and an uncertain activation response.
- Existing widget, site settings, property-validation, and performance-dashboard tests continue to pass. Full TypeScript check and the Deno check for `gsc-sync` pass.

## Deployment and remaining limits

Apply `20260925100000_atomic_admin_writes.sql` and `20260925101000_atomic_gsc_imports.sql`, then deploy `gsc-sync` and its shared `gscImport.ts`, before releasing the new admin controls. Neither migration rewrites existing settings or historical performance rows. New writes use the transactional paths; older already-open admin tabs can still call the previous direct-update paths until refreshed.

No live data, settings, imports, Google requests, or permissions were changed during local verification. A real Google sync requires the configured service account to have access to the exact selected property; this has not been exercised here. An interrupted worker can leave an `importing` status/staging rows; the report shows that state while retaining complete data, and a fresh run uses a separate import. Import-history/staging retention is a future housekeeping improvement.

Stale settings are rejected without overwriting the saved version. The current UI asks the administrator to reload saved values and reapply their draft; it does not automatically merge conflicting fields or provide crash recovery. A timeout can leave the outcome uncertain, but it cannot commit half a transaction; the administrator should reload before retrying.
