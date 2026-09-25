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
- No new dependency, database table, migration, AI API, or backend deployment is needed for the tool.
- Optional offer recommendations require the existing anonymous public offer read. Optional newsletter signup requires its existing configured delivery service.
- No real newsletter signup, payment, or paid AI request is part of verification.

## Verification

Engine tests cover all three projects, both audiences, missing/invalid context, independent result objects, prompt requirements, and safe complete exports. UI tests cover generation without signup/storage, editing, clipboard fallback, complete downloads and URL cleanup, newsletter failures, and offer fallbacks. Integration tests cover owner gating, canonical metadata, sitemaps, discovery, published offer boundaries, and overlay suppression.

Manual browser checks cover desktop, 390px and 320px widths, all three project choices, editable answers, long single-word input, selectable expanded prompts, actual clipboard contents, and a downloaded Markdown file. The generated downstream apps were not built in a third-party AI builder during this verification.

## Separate production measurement work

The existing conversion system has coordinated path allowlists in the browser, edge collector, and database recording function. They currently exclude `/first-ai-build`. Planner page views and completions are therefore **not measured** in this release. Do not infer conversions from tool usage or report invented results. A later coordinated measurement release should add privacy-preserving events for a plan created, prompt copied, plan downloaded, and training listing opened; send only task identifiers and event names, never the entered context or prompt.

The legacy `render-page` edge function's `APP_ONLY_PATHS` also needs `/first-ai-build` when that function is next deployed, so direct requests to the legacy renderer do not enter its missing-page flow. The primary TanStack server route already serves this page with canonical metadata.

Frontend publishing and any future shared-backend changes remain separate actions. This feature is stacked on the existing council-improvements branch; do not use it to bypass the outstanding main-branch merge approval.
