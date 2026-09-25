# Your First AI Build

An interactive giveaway at `/first-ai-build`, made for Brian Hanson's audience of business owners learning to build with AI.

## Product decision

The opening problem is “What should I build, and how do I start?” The giveaway answers it with one small project and a complete build brief. It connects naturally to the App Building Workshop and PushTen because the next job is building the project. That is a product hypothesis, not a measured conversion claim.

Three choices keep the first version practical:

- Follow-up draft workbench: enter confirmed facts, create an editable template draft, review, and copy.
- Inquiry organizer: add a request, update its status and next action, and keep records separate.
- Client onboarding checklist: create a practice project, edit its tasks, and calculate progress from completed tasks.

Visitors choose a task and whether they are building for themselves or a client. Optional business and audience descriptions personalize the brief. No email gate or payment is required. The result includes a first-version scope, screens, fictional example, full app-builder prompt, three acceptance checks, and three next steps. Copy and Markdown download deliver it immediately. Editing preserves the visitor's answers.

The supplied prompts build browser prototypes with fictional data. They explain working controls, validation, storage errors, accessibility, and acceptance checks. They do not call an AI service or automatically build/deploy an app. The visitor uses a builder of their choice; that builder may charge for usage.

## Design and integration

Preserves the site's black backdrop, gold accent, display serif, and readable body type. Desktop uses a two-column introduction with a compact outline of the deliverable. Mobile removes that repeated outline and keeps the action prominent. Forms use native radio controls, visible focus, labelled fields, and announced feedback. Results focus their heading and wrap even long single-word inputs at 320px.

Discovery is through Brian's Free Resources menu, Start Here, footer, and both sitemaps. The owner guard prevents the tool appearing on member-branded sites. Chat and the mobile Summit bar step aside on this route.

Published public listings determine which next steps appear. The Workshop is the primary training link; PushTen is secondary. The free Follow-Up Kit appears for the matching project only. Missing listings or a failed public lookup leave the tool working and offer a free getting-started guide. Prices are not hardcoded.

The optional newsletter form explicitly subscribes to Brian's emails through the existing double-opt-in service. It does not promise to email the plan. Subscription failures never block the result.

## Data and dependencies

- Planner answers and results stay in React state. No query strings, local storage, or analytics payloads contain those answers.
- Copy/download export only after the visitor asks. React text rendering and escaped Markdown protect literal user context.
- Reloading resets the plan; the page tells visitors to save it first.
- The planner itself needs no AI API or new dependency. Optional first-party measurement requires its coordinated database migration and collector deployment.
- Optional offer recommendations require the existing anonymous public offer read. Optional newsletter signup requires its existing configured delivery service.
- No real newsletter signup, payment, or paid AI request is part of verification.

## Verification

Engine tests cover all three projects, both audiences, missing/invalid context, independent result objects, prompt requirements, and safe complete exports. UI tests cover generation without signup/storage, editing, clipboard fallback, complete downloads and URL cleanup, newsletter failures, and offer fallbacks. Integration tests cover owner gating, canonical metadata, sitemaps, discovery, published offer boundaries, and overlay suppression.

Manual browser checks cover desktop, 390px and 320px widths, all three project choices, editable answers, long single-word input, selectable expanded prompts, actual clipboard contents, and a downloaded Markdown file. The generated downstream apps were not built in a third-party AI builder during this verification.

## Optional first-party measurement

The browser, edge collector, and database now recognize `/first-ai-build`. With the visitor’s existing measurement consent, the planner records four fixed actions: plan created, successful clipboard copy, browser download started, and a click to an available training listing. Each action contains only its event name, the path, one of the three project identifiers, and (for training) the published offer ID. The shared parser strips unknown properties before the browser sends the request; the collector and database independently validate the fixed choices. Business/audience answers and generated prompts are never sent to measurement.

Existing consent, canonical-host, admin/QA/bot exclusions, revocation, session expiry, and 90-day retention still apply. Conversion reporting now shows unique consenting sessions for each action; these actions overlap and are not a required sequential funnel. Downloads are starts, not confirmed saves; training clicks are not purchases. No historical activity is backfilled. An older backend displays an unavailable notice rather than invented zeros.

Deploy `20260925110000_first_ai_build_measurement.sql`, the `conversion-events` function (shared parser changed), and the frontend together to enable measurement. The legacy `render-page` function now includes `/first-ai-build` in `APP_ONLY_PATHS`, preventing direct requests from entering the missing-page recorder; deploy that function too. The main TanStack route serves the actual planner and canonical metadata.
