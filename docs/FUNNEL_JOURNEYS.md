# Connected qualification journeys

The connected journey is a separate layer above existing offer pages. Administrators can create a private draft, connect stable steps, test answer paths locally and publish a fixed revision. It does not change native resource access, order chains, external checkout or calendar providers.

## Content and routes

- `/admin/funnels` is protected by the existing admin route. The editor provides content steps, bounded single-choice questions, existing published offers, HTTPS provider handoffs and end steps. It shows outgoing connections, supports an entry-step selector and includes a simulator that never creates a visitor session or order.
- `/funnels/:slug` runs published journeys. Choices and progress come from the server. The browser receives only the current step, earlier visited titles, revision and current public offer details.
- The version-1 graph uses stable step IDs and stable answer IDs. Each choice has 2–8 labeled options, an explicit answer-to-destination map and a required default destination. Only valid, selected option IDs may use the default. Missing or invented answers are rejected.
- Every graph has 1–30 steps. Every step must be reachable from the entry. Missing targets, cycles, duplicate IDs, unknown fields and unsupported node types prevent save/publication. The SQL validator repeats the TypeScript validation at the write boundary. Transitive closure is bounded by the graph size rather than enumerating all possible paths.
- Graphs use plain text. No arbitrary HTML, executable conditions, custom SQL, free-text answers, income claims or client payment/booking-completion flags are accepted.

## Drafts, revisions and privacy

`funnel_journeys` stores the current private draft and pointer to its published revision. `funnel_journey_revisions` preserves every saved graph; editing a draft leaves the public snapshot unchanged. Addresses remain stable after the first save. Publishing creates a new immutable snapshot. Existing sessions stay attached to the revision they started on. Pausing prevents both new and existing sessions from advancing.

Private drafts and revision history are readable only by authenticated administrators. Authenticated writes go through `funnel_journey_save`, which checks `is_admin(auth.uid())`. An expected draft version prevents stale overwrites; advisory/row locks serialize competing saves. Durable request IDs bind to the exact save payload so uncertain retries return the same result and changed-payload replays fail.

Anonymous visitors have no direct access to draft, session or transition tables. The public edge handler calls service-only session functions after bounded request validation and IP throttling. Sessions use cryptographically random 256-bit bearer tokens; only a SHA-256 hash is stored in the database. The raw token stays in `sessionStorage`, never a URL. If browser storage is unavailable, the current session still works in memory. It can be restarted if its token is lost.

Only selected option IDs and visited step IDs/titles are saved. No planner business/audience text, name or email is transferred to a journey. Sessions expire after seven days; a daily `funnel-journey-retention-daily` cron job deletes expired sessions and their transition records. The UI states both the expiry and daily cleanup cadence. Draft/revision history and admin request records are retained as configuration history.

`funnel_session_advance` locks the session, compares the current step and expected version, validates the selected choice against the pinned graph and calculates the destination on the server. A transition's request ID is bound to its step, answer and version. Exact retries return their original response; changed answers and competing stale transitions fail. Client requests have a 15-second deadline (public error-body parsing has a separate two-second bound). Read requests also use abort signals. A mutation timeout is treated as uncertain, never proof that the server rejected it. The UI keeps the same request after a transport failure and provides a reload-current-step action for conflicts.

## Offer and provider handoffs

Offer targets must already be published and publicly addressable (`funnel_only=false`) at publication. Their existing native or external `/offers/:slug` pages handle resource access and checkout. If a target is subsequently retired, the runner removes its link and allows the visitor to continue independently.

Provider steps accept HTTPS links without credentials. A click opens the provider in a new tab. Both provider and offer steps explicitly explain that Continue records navigation only. The journey creates no order and does not assert a download, purchase, enrollment or confirmed booking. A future verified-completion node would need a separate provider/native server event contract and proof bound to the session; it must never use a browser boolean.

## First AI Build owner draft

`scripts/maintenance/20260926-first-ai-build-journey-draft.sql` supplies the private `first-ai-build-next-step` draft. It requires the exact Brian Hanson owner site and three existing published offers. It resolves targets by stable offer slug, preserves any existing journey on rerun and makes no published content writes. It has not been applied by this implementation.

The first question selects follow-up, inquiries or onboarding. A second question chooses the desired support: the relevant free follow-up kit, workshop, PushTen or an independent path. Only the follow-up branch offers the follow-up practice kit. The independent path remains available without a purchase. Copy uses existing offer facts and no new price, guarantee, proof claim or earnings threshold. Source material is the existing offer pages and the checked-in starter-kit/shop maintenance scripts; those pages retain their existing sourced proof and current provider details.

The existing free planner still creates its plan locally and immediately. It makes a separate optional availability read after showing the result and reveals a continuation link only when this journey is published. The availability request sends only the fixed journey slug. The continuation URL carries only the bounded project enum (`follow-up`, `inquiries` or `onboarding`). On a fresh flagship session, the runner submits that previously selected option through the normal server-validated transition, so the visitor goes directly to the support question. Unknown values, incompatible graph revisions and ordinary entry links use the normal first question. Sessions are separated by this project enum to avoid resuming a different project’s result. No business or audience text crosses the URL or API. Existing direct offer and guide links remain available if the journey is private, missing or temporarily unavailable.

## Deployment and integration

1. Apply `20260926180000_funnel_journeys.sql`. It expects the existing `offers`, `is_admin`, authentication roles and `pg_cron` installed by the base project. The retention schedule is mandatory: migration failure must not be ignored.
2. Deploy `funnel-journey-api` with JWT verification disabled at the gateway. Public requests are deliberately anonymous; this handler exposes no admin actions. Administrator saves use the signed-in Supabase RPC and database authorization.
3. Add the admin navigation link to `/admin/funnels`. Regenerate routes/database types through the normal project workflow. The client isolates the new contracts until generated types include them.
4. Include `node scripts/tests/funnel-journeys-database.mjs` in the database verification command. Member clone/bootstrap checks must refuse inherited private rows in all five journey tables; an empty clone should have no owner journey seed.
5. Apply the owner draft seed only on the owner project when authorized. Review it in the admin simulator, check the three existing offers, then explicitly publish. The seed itself never publishes.

Validation: graph/request tests; admin connection/simulator/save/retry tests; public answer/progress/retry/resume/provider/retired-offer/private-route tests; planner availability/failure regressions; and a PGlite integration suite for private drafts, role privileges, graph validation, publication snapshots, competing revisions, transition replay, hidden offers, pause, expiry cleanup and idempotent private owner seeding. The tests do not call live payment or booking providers.
