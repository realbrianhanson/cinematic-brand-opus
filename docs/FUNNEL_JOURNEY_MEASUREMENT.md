# Connected journey measurement

This report answers where consenting visitors stop taking a next action, which published branches they choose, and whether an offer/provider handoff is clicked. It does **not** measure purchases, bookings, download completion, revenue, or confirmed provider arrival.

## Tracking plan

| Event              | Trigger                                             | Stored properties                                                               |
| ------------------ | --------------------------------------------------- | ------------------------------------------------------------------------------- |
| `step_view`        | A loaded step is rendered and ready for interaction | Published journey/revision and step identifiers                                 |
| `step_continue`    | The functional API confirms advancement             | Same identifiers, approved option ID for choice steps, graph-resolved next step |
| `offer_handoff`    | Click or middle-click on the available offer link   | Same identifiers; destination comes from the published graph                    |
| `provider_handoff` | Click or middle-click on the provider link          | Same identifiers; no provider URL is stored                                     |

The client sends at most ten bounded events in one request. Every action includes its own view to tolerate a lost earlier observation. This is an observation of the displayed step, not proof of reading. An automatically skipped preselected project step is not invented as a view or branch choice. No historical functional progress is backfilled.

## Consent and privacy

The new collector uses the existing optional measurement preference and its separate random session ID/capability. It never receives, reads, joins, or copies `funnel_journey_sessions`, functional tokens, saved answer maps, contact information, free text, full URLs, query strings, referrers, or IP addresses. Only administrator-published option identifiers are accepted; arbitrary answer text is rejected. Canonical-origin, authenticated/admin, QA/preview, bot, DNT and GPC exclusions match the existing conversion collector. A public client can still forge allowed observations; this is browser analytics rather than verified operational activity.

The journey page exposes Measurement preferences. Decline/withdrawal invalidates queued callbacks, stops retries, and uses the existing capability-authenticated forget operation. A trigger erases connected-journey events when that conversion session is revoked. The existing tombstone rejects delayed writes. The existing 90-day conversion cleanup cascades these rows; it never deletes functional progress, an order or a subscription. RLS and grants prevent direct anonymous/authenticated access; only administrators can read aggregate reports.

## Counting and denominators

- Reports cover 7, 30 or 90 UTC calendar days, including today. The cohort is sessions **first observed in that journey and published revision** during the range. One browser can create multiple sessions; these are visits, not unique people.
- Each published revision is separate, including previously published revisions still used by an active journey. Draft revisions and paused journeys cannot receive observations.
- Each reached step, continuation and handoff counts once per measurement session/revision/step. Repeated clicks and reloads do not inflate actions. If a visitor restarts and selects a different branch in that same measurement session, the first recorded continuation is retained. A later measurement session is a separate visit.
- A returning visitor may resume functional progress midway with a new measurement session. Reported entry sessions are only those with an observed entry-step view; resumed visits are not silently treated as full-funnel entrants.
- Each step's denominator is its own reached sessions. Choice counts use that step's continuing sessions. Branches may skip steps, so this report deliberately has no overall linear conversion rate.
- “No next action” means a non-final reached step with neither a Continue nor handoff, after the measurement session is inactive for 30 minutes or reaches its 24-hour lifetime. Unfinished active visits remain separate. This is a drop-off signal, not proof of abandonment. Activity elsewhere on the site can keep the shared session active.
- Continue and handoff can overlap. A handoff alone is a next action, so it is excluded from no-next-action counts. End-step views mean the journey's end was reached, with no commercial outcome implied.
- The top 20 revisions by measured sessions are shown, with the total revision count. Every step in each shown graph appears, even with zero observations. Render order follows the saved graph and does not assert that all visitors took that route.

## Reliability and deployment

The collector independently validates every batch against the server's published graph, revision, step kind and option list. Clients cannot submit a destination, offer identity, payment outcome or timestamps. A service-only SQL function revalidates identifiers, requires explicit consent, locks the optional session, verifies its capability/expiry/revocation, and deduplicates both event IDs and semantic actions. Invalid action batches roll back atomically. Recording is unrelated to functional advancement: a tracking outage must never prevent Continue, reload or a handoff.

The browser's shared optional queue is bounded to 40 supplemental callbacks. It performs at most one identical-payload retry with 2.5-second attempt timeouts. Navigation never waits. The collector caps bodies at 8 KiB, ten events, 600 requests/IP/hour and 120 requests/session/hour using hashes for IP quotas. Tracking failures, blockers, missing consent, network loss and later returns can all produce missing observations.

Apply `20260927110000_funnel_journey_measurement.sql`, deploy `funnel-journey-measurement` (`verify_jwt=false`, independent canonical-origin/privacy checks), and publish the frontend. No new provider, paid dependency, tracking key, consent setting or scheduler is required. Verify the existing conversion retention job. Add the private table to clean-remix guards. Use `?measurement=off` for production QA; never write fabricated production analytics.

Validation is isolated: `scripts/tests/funnel-journey-measurement-database.mjs` tests graph/revision/option validation, consent, capabilities, semantic/event dedup, cohorts, grants, withdrawal and retention. Unit/browser tests mock network requests; no provider or production database is contacted. PGlite tests prove lock-dependent exclusion logic sequentially, not real PostgreSQL parallel scheduling.
