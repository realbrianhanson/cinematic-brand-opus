# Video + Application funnel

The owner approved the complete template, native qualification, preparation/training, alternate-offer page, evidence layouts and script workspace on September 27, 2026.

For shared market examples and cross-project adaptation notes, see the [Market offer inspiration library](./MARKET_OFFER_LIBRARY.md).

## Design contract

Preserve the book-a-call reference's centered composition: 960px content, 800px video, 45px desktop/30px mobile headline, 20px body, generous space, large CTA and one-question application. White mode uses #ffffff, #172338 ink and #526076 secondary text; dark uses #0b1220, #f7f9fc ink and #b9c5d6 secondary text. The initial accent is #8b5cf6; button text automatically selects a contrasting dark or white color. Accent and heading fonts are editable. Dark is the new-template default. The existing site's design remains intact. Container-based breakpoints make the embedded phone preview use the same layout as an actual phone.

## Integration

Dedicated versioned call-funnel configuration preserves the existing strict offer and connected-journey contracts. Public route `/calls/:slug`; admin `/admin/call-funnels`, linked from the existing funnel and offer builder. Preview routes create no submissions, appointments, payments or email.

Native applications are validated and routed on the server against their immutable revision. Incomplete answer recovery stays in the browser. Private scripts and qualification rules never appear in public configuration. Only approved proof is rendered. The calendar remains the configured provider; opening it is not a booking. Confirmed/recorded outcomes carry their source. Generic signed automation callbacks require a configured secret and provider automation. Team-entered sales are distinct from payment-provider verification.

## Release checklist

- Shared contracts, defaults, strict validation and projection
- Admin draft/save/publish/conflict handling, template picker and proof library
- Visitor invitation/application/review/booking/preparation/training/alternative flow
- Script worksheet and exports
- Application reporting, audited manual outcomes and signed callback endpoint
- Database security, idempotency, retention and regression tests
- Desktop/phone browser checks and independent review
- GitHub merge, additive migration and backend deployment, preview verification

No public frontend Publish, live purchases, customer messages, or production QA applications are authorized for this release.

## Using the template

1. Open `/admin/call-funnels` and choose **Use Video + Application template**. Name the funnel and choose its address. Saving keeps a private draft until explicitly published.
2. Edit Design, Invitation, Application, Booking, Preparation, Training, Alternative, Proof and Scripts. Conditional questions must reference an earlier choice question. Selected answers can route to the alternative offer; all other complete applications follow the qualified-call path. Production qualification is evaluated by the backend against the applicant's original published revision.
3. Add your invitation, preparation and training videos; transcripts and posters are optional. MP4/WebM files support native chapters and resume position. YouTube/Vimeo use their own player controls; their chapters appear as an outline. Other HTTPS video links offer an external playback link. Preview does not load provider players or submit data.
4. Connect the calendar, alternative-offer destination and privacy notice. Select approved proof and add optional portrait URLs. No testimonial is approved by this template automatically. Private scripts and qualification rules never enter public configuration.
5. Test both qualification branches in Preview; use **Restart application** to run another simulation. Check both themes and Desktop/Phone. Publishing produces `/calls/<your-address>`; later draft edits do not alter the published revision until published again.
6. Use Applications to review pinned question/answer labels and record observed outcomes with a reference and note. Integration-reported sales and manually recorded sales have separate counts. These are application/outcome reports, not visitor-to-sale attribution or independently verified payment receipts.

## Calendar/CRM connection

The calendar URL opens the scheduling provider. Opening the link does not mark a call as booked. The provider remains responsible for scheduling, confirmation emails, reminders and cancellation/rescheduling. No GHL, Stripe or calendar account was connected as part of the template implementation.

Automatic status updates require a server-side automation configured with `CALL_FUNNEL_WEBHOOK_SECRET` (at least 32 characters) and the `call-funnel-events` endpoint. The endpoint returns a setup error until the secret exists. Never place the secret in browser code or a calendar URL.

Pass the opaque application ID through the provider's supported application-reference field. The visitor can copy it on the booking page. A static calendar URL alone cannot associate an appointment with an application; email matching is deliberately insufficient. Configure this mapping and test it with an authorized test appointment before relying on automated preparation access.

POST a JSON body containing `eventId`, `applicationId`, `type`, `occurredAt`, `reference`, and `startsAt` for booking/rescheduling. Types are `booked`, `rescheduled`, `cancelled`, `attended`, `no_show` and `sale`. Send UTC ISO timestamps and a stable provider event ID. Headers are `X-Call-Timestamp` (Unix seconds) and `X-Call-Signature` (hex HMAC-SHA256 over `timestamp + '.' + exactRawBody`). Sign a fresh request timestamp for delayed retries while retaining the event's original `occurredAt` and identity. The backend rejects signatures older than five minutes, mismatched replays and invalid transitions; late older events do not replace a newer booking state.

Qualified visitors see preparation/training after the booking is confirmed through configured automation or recorded by the team. Application access lasts seven days in that browser tab. Application records and their audit events are retained for 90 days by the daily cleanup job. The member bootstrap rejects inherited call-funnel records and validates/restores the retention job for clean remixes.

## Validation and delivery evidence

Independent frontend/TypeScript and backend/database reviews completed; their functional findings were corrected and regression-tested. Browser checks exercised qualified and alternative simulations, review/consent, restart, preparation progress and notes, and dark/white designs at desktop, 390px and 320px widths. At narrow phone widths, document content did not overflow and white mode computed to `rgb(255, 255, 255)`.

Release status and final check counts are recorded below after GitHub/preview delivery. No customer application, real appointment or payment is created by these checks. Provider playback and account-specific automation require the owner's configured media/calendar and authorized integration testing.

- Local verification: 2,673 tests across 244 files; all 40 database suites; TypeScript; lint (zero errors, 285 existing warnings); Deno checks across all edge functions; production build; formatting.
- Database migration `20260928090000_call_funnels` applied atomically with its exact source recorded in migration history. SHA-256: `17ca2c0b3b48d63c82592ee871bd20debea89ec7e028a7e8bda8b7645164561c`.
- Read-back confirmed RLS on all five new tables, private application/event/request tables, no anonymous administrative RPC access, service-only submission, no public-schema CREATE privilege for application roles, an active daily retention job, and zero application records created by release verification.

## Preparation and private script guidance — September 27

Preparation now supports an optional HTTPS overview and up to eight editable objection answers with video, poster, transcript and native English captions. Reorder, hide or remove answers. Proof independently selects approved preparation testimonials and portraits. Old configs preserve existing sections; new templates include five neutral starter answers. Public preparation still requires a verified booking outside draft preview.

Scripts adds four reviewed source patterns, original six-beat pacing guidance and private source/adaptation/experiment notes. Source selection preserves existing copy. Experiment notes stay outside writing prompts and scripts stay outside public publication. The shared library is separately maintained, not an automatic Sheets integration.

Validated 93 related tests, the call-funnel database suite, TypeScript, scoped/full lint (existing warnings), production build, and independent code/TypeScript/database reviews. An isolated browser fixture verified editing, answer reordering, source selection, prompt export and mobile rendering at 390px/320px without overflow. Answers use 20px text and questions 21px. No cloud saves, bookings or payments were created; the fixture is excluded from source delivery.

Applied `20260928100000_call_funnel_preparation_extras` atomically. Migration-history source SHA-256 matched `42235c2e8c03b8edd9c2a2ba0866dbe2c9e3266afb0458b201c69800bd70031c`. Readback preserved ACLs/search paths and denied direct execution to anon/authenticated roles. No edge redeployment is needed: edge entry points do not import this shared validator. No provider connection or frontend publication performed.
