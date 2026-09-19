# Speaking inquiries

The speaking page captures event inquiries in the private admin inbox at `/admin/inquiries`. The homepage has a short speaking invitation linking to that page. An inquiry is not a newsletter subscription, booking confirmation, payment, or email delivery.

## Deployment and setup

1. Apply `20260919200000_speaking_inquiries.sql` and record the migration.
2. Deploy `submit-speaking-inquiry` with the shared bounded JSON and speaking inquiry helpers. `verify_jwt = false` is intentional: visitors are not required to sign in. The function uses server-side service credentials already supplied by Supabase; no new provider secret is required.
3. Publish the frontend, then use **Admin → Speaking inquiries → Accept inquiries** when someone is ready to monitor the inbox. `site_settings_private.speaking_inquiries_enabled` defaults to false, including on new PushTen installations. Enabling a production owner is an explicit owner action, not a member-template migration side effect.
4. Set the brand’s speaking email link to a real monitored address for the direct-email fallback. The form saves independently of that fallback address.

No email notifications are currently sent. The admin page states this beside the intake control. Check the inbox regularly; use **Reply by email** and mark the inquiry as contacted after replying. Status and private notes are saved separately from the original submitted details.

## Data and access

The `speaking_inquiries` table stores contact name/email, event name, timeframe, format, audience, message, administrative status, private notes, and timestamps. A server-generated primary ID is separate from the random client request ID. Anonymous visitors have no table access. Non-admin signed-in users cannot read or change inquiries. Admins can read and update only `status` and `admin_notes`; contact data, idempotency identifiers, and submission timestamps cannot be edited through the admin client. Only the server submission function inserts new records. There is no browser-side delete operation.

The private intake setting is covered by the existing administrator-only private-settings policies. Changing it does not change automatic publishing, newsletter sending, or any other configuration.

## Submission behavior

- JSON is bounded while streaming, before allocation; contact fields are trimmed and validated, email is normalized, and text lengths are limited.
- Durable rate limits share the existing atomic database limiter with a distinct `speaking:` namespace. IP addresses and email addresses are hashed before becoming rate-limit keys. Limits are 30 requests per IP and 8 requests per email per hour. Limiter failures fail closed.
- The hidden website field gives obvious bots a neutral acknowledgement without storing an inquiry.
- The form keeps the same UUID for retries with unchanged details after an uncertain response. The database serializes identical request IDs, compares the normalized payload hash, and acknowledges a retry without adding another record. A different payload with the same request ID is rejected without revealing inquiry data. Existing matching retries remain acknowledged if intake was paused after the original write.
- A successful response is sent only after a stored inquiry or confirmed matching retry. Database internals and contact details are not logged or included in failure responses.
- Form failures preserve the entered values. Buttons prevent duplicate in-flight submissions; confirmed success receives keyboard focus. Safe direct email remains available as a fallback.
- Admin edits compare `updated_at` to avoid overwriting a change made in another window. Conflicts preserve the notes in the editor.

## Verification

`npm run test:database` includes an isolated PGlite suite for this migration: opt-in defaults, retry behavior, payload mismatch, bounds, table grants, administrator restrictions, and ordinary-user isolation. Unit/component tests cover input validation, safe email links, confirmed success, retry identity, duplicate clicks, safe admin rendering, and save failures/conflicts. Production QA must not create fabricated inquiries or send messages.

## Backend contract

`submit-speaking-inquiry` accepts `POST` with JSON: `request_id` (UUID), `name`, `email`, `event_name` (required); `event_date`, `event_format` (`in_person`, `virtual`, or `undecided`), `audience`, `message`, and `website` (honeypot). It returns HTTP 200 `{ "accepted": true }` after acceptance. No lead ID or submitted personal information is returned. Errors have `{ "error": "visitor-safe message", "code": "..." }`: 400 `invalid_input`, 415 `invalid_input` for other content types, 409 `request_mismatch`, 429 `rate_limited`, and 503 `unavailable`. Other methods return 405; OPTIONS is allowed for CORS.

The service-only SQL RPC is `public.submit_speaking_inquiry(_request_id uuid, _payload_hash text, _name text, _email text, _event_name text, _event_date text, _event_format text, _audience text, _message text) RETURNS boolean`. Success and exact retries return `true`. Reusing a request ID with another payload raises `speaking_request_mismatch` (SQLSTATE 22023). Paused intake rejects new requests with `speaking_inquiries_disabled` (SQLSTATE 55000); an already stored exact retry still succeeds. Remaining database failures are mapped to the generic unavailable response.
