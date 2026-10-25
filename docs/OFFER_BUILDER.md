# Offer builder

**Last updated:** September 27, 2026

The admin offer builder adds private strategy, working copy, page sections, contextual upsell copy, a proof library, revision recovery, and AI copy assistance. Existing offers remain the commerce identity used by checkout, downloads, catalog listings, and historical orders.

For shared market examples and cross-project adaptation notes, see the [Market offer inspiration library](./MARKET_OFFER_LIBRARY.md).

## Build a funnel

Start at **Funnel builder** (`/admin/funnel-builder`) and choose a goal: sell a product, give away a free download, book a call, use external checkout or registration, create a follow-up offer, or build a custom branching funnel. Products, downloads, external offers and follow-up offers open the offer studio described here. Call funnels and custom branching funnels have their own builders.

1. **Name the offer and complete the brief.** In Strategy, enter a name and short description, choose the traffic source, then answer five questions: who it is for, what is getting in their way, what they will be able to do, why the approach works, and what they receive. Optional objections, evidence notes and the sending ad or email message stay private.
2. **Preview a first draft.** In **Build my first draft**, select the landing page, this product's follow-up presentation, or both, then choose **Preview my first draft**. External offers draft only the local landing page. Review the additions and select **Apply draft to selected pages**. This uses the facts in the brief without AI credits. It fills empty fields, fills empty section copy and adds missing recipe sections while preserving authored copy, proof, media and unselected pages. Add approved testimonials and confirmed FAQ answers yourself. Applying changes only the working copy; choose **Save draft** to keep it.
3. **Choose a visual layout.** In Pages, **Start with a visual layout** shows sample previews for product sales, free resources, and upsells or downsells. Preview an example, then use the layout to review it with your own offer facts before applying. These are section arrangements using the site's existing colors, typography and public section renderer, not separate site themes. Applying rearranges the selected page and fills its empty content while preserving existing copy, proof and media; extra sections stay before the final action. Sample copy is never copied into your offer. Preview actions are disabled, and neither applying a layout nor a first draft saves or publishes it.
4. **Connect the rest of the funnel.** Expand **Funnel steps · create, connect and edit** to see the landing page, checkout or free claim, thank-you page, and optional order bump, upsell and downsell. Use **Create order bump**, **Create upsell** or **Create downsell**, or choose an existing offer. Add an upsell before adding its decline alternative. Creating a step saves the child as a private draft and attaches it to the parent's working copy; save the parent to retain that connection. **Save funnel & edit [offer]** saves the parent successfully before opening the child, which includes **Back to parent funnel**. Finish the child's pages, price and download, then publish it before launching the connected offers. The map labels private drafts and unpublished changes; a saved connection alone does not activate an offer.
5. **Review launch readiness.** Read Page, Checkout or Free claim, and Delivery separately. A published page may still have unavailable paid checkout, missing delivery configuration or newer unpublished edits. Checkout and delivery checks describe the current working draft. **Check setup again** retries unknown setup information; **Offers setup** opens provider configuration. These checks do not place an order, submit a claim, test a file download or verify inbox delivery. Stripe test mode is identified explicitly. External offers show a provider handoff: verify checkout, registration, confirmation and delivery with that provider.

Native customers receive access to the original download before optional follow-ups. An order bump is an explicitly selected paid extra in the same currency; accepting a paid upsell or downsell opens a separate checkout. Declining an upsell can show its configured alternative, and declining that alternative ends the invitation. See [Native checkout extras and decline alternatives](./NATIVE_COMMERCE_BASKETS.md) for the commerce contract.

The guided workflow uses the existing version-1 presentation schema and save API. It adds no backend function or database migration. Core implementation is in `OfferDraftStarter`, `OfferTemplatePicker`, `OfferFunnelMap`, `OfferConnectedStepDialog` and `OfferLaunchReadiness` under `src/components/admin/offers/`, integrated by `src/components/admin/OfferEditor.tsx`.

## Data and publication

- `offers.presentation` is the published presentation only. Anonymous visitors can read it only for published offers under the existing row policy. Null preserves the original page layout and copy.
- `offer_builder_drafts` holds the complete private working document: `{ offer, builder }`. `offer` contains editable commerce fields and `builder` follows `src/lib/offerBuilder.ts`.
- `offer_builder_revisions` retains an immutable revision for every successful save or publication. Authenticated administrators can read revisions but cannot write, update, or delete them directly. The UI loads the latest 30 revisions.
- `offer_proof_items` is an administrator-only reusable library. Proof notes, approval state, selected proof IDs, strategy, and working copy never enter the public presentation.

Saving a draft of an existing offer does **not** update any `offers` column, including its price, status, slug, asset, funnel destination, presentation, or `updated_at`. For a new offer, the first save creates a minimal valid draft identity; incomplete paid setup stays in the private document until publication. Its temporary live slug is `draft-{id}`. The editor keeps the requested draft slug separately.

Publication writes the explicitly allowed commerce fields, forces the published status, and installs the validated presentation in one transaction. Existing price, published-readiness, external-listing, catalog, asset-path, and acyclic-funnel constraints still run. A failed publication does not create a revision or alter the draft. Published presentation sections retain the shared schema's `proofId` key with an empty string, so internal proof references cannot leak.

The database validates exact keys and types recursively, bounds section counts to 30 per page, bounds copy and URLs, checks HTTPS URLs, and caps each working document at 1 MB. The public presentation constraint also protects direct legacy writes. Raw HTML is not part of the schema; the shared public renderer is responsible for rendering text and safe links.

## Save and recovery contract

`offer_builder_save(_offer_id, _document, _expected_offer_updated_at, _expected_draft_version, _publish, _request_id)` is callable only by authenticated administrators. Use null versions for a new offer or absent draft. It returns `{ offer, draft, revision_id, published }`; the draft includes `version`, `updated_at`, and `base_offer_updated_at`.

Each save compares both the current live offer timestamp and the private draft version. A stale client gets a conflict instead of overwriting another editor. Direct changes through a legacy editor invalidate the live timestamp. When loading an older draft whose base timestamp differs from the current offer, the editor must show the mismatch and reconcile the working commerce fields before a subsequent save or publication. After that deliberate reconciliation, the current live timestamp and current draft version permit saving.

Offer mutations acquire the shared funnel graph lock before locking offer rows. A statement trigger gives direct insert, update, and delete operations the same order as the builder RPC, preventing a legacy edit and builder save from deadlocking through reversed lock acquisition. New-offer creation is serialized before checking whether its ID exists; simultaneous creates cannot bypass the same timestamp and draft-version checks.

A request UUID is durable idempotency: retry the **identical** inputs with the **same** request ID after an uncertain network failure. The database returns the original result even when later revisions exist. Reusing that request ID for changed content or different expected versions is rejected. A new user edit or a resolved conflict requires a new ID.

Recovery loads an earlier document into the current working copy; it does not change the live page. Saving recovered content uses the current concurrency values and creates a new revision. Publication remains a separate action. Purchase snapshots and stored customer access are never modified by builder saves or recovery.

Client helpers are in `src/lib/offerBuilderClient.ts`:

- `loadOfferBuilder(id)` returns the draft and latest 30 revisions.
- `saveOfferBuilder({ offerId, document, expectedOfferUpdatedAt, expectedDraftVersion, publish, requestId })` implements the RPC contract.
- `listOfferProof()` returns up to 200 items, newest first.
- `saveOfferProof(input)` creates or updates proof; `deleteOfferProof(id)` removes a library record. Previously published text remains an independent copy.

## Guided page building and conversion review

The September 25 polish keeps the existing version-1 schema and requires no new database migration.

- **Guided recipes:** lead-magnet, sales and upsell recipes copy the entered problem, method, outcome and deliverables into matching sections. The entered outcome can supply an empty headline, the product summary can supply an empty supporting promise, and checkout-aware button text fills only an empty button. Existing headline/button copy is preserved. Applying a recipe explicitly replaces the section layout after confirmation. Private evidence notes, permissions and unanswered objections never become public copy automatically. Proof and FAQ answers still require the editor to add confirmed material.
- **Readiness review:** editorial suggestions link to the appropriate builder step and presentation; incomplete sections open directly at their copy field. The review checks empty recipe sections, missing testimonial attribution, absent page proof, action placement, source-message alignment for cold/email traffic, and the customer's first useful action. These are advisory, separate from required publication validation, and never claim a conversion percentage. An unused upsell does not produce irrelevant copy warnings.
- **Scannable sections:** benefits and deliverables written as `-` lists become inclusion cards; a method list becomes numbered steps. FAQ copy uses `## Question` followed by its confirmed answer to create native expandable questions. Existing prose and mixed body formatting retain the original renderer. Empty recipe placeholders are omitted; if no section has substantive content, the original description remains visible alongside any CTA. The renderer remains text-safe and never interprets arbitrary HTML.
- **Evidence:** exact testimonial text and public attribution remain editable together. Library facts and demonstrations insert as ordinary evidence text with attribution, not customer quotations. Source URLs and permission notes stay private; only explicitly inserted public text enters the presentation. Selecting evidence for AI does not automatically insert it on a public page.
- **Action placement:** mobile landing pages show a route to the real offer controls immediately after the headline and promise, before a large cover image. Native pages repeat that route after the sales argument. These controls scroll/focus the existing purchase or download area; they never create an order or initiate a payment. Funnel-only landing pages do not expose standalone action controls, and previews keep actions disabled.
- **Follow-up clarity:** the builder distinguishes an external provider's journey from native delivery. Accepting a paid follow-up opens separate checkout. Declining shows the configured alternative or ends the pitch, while retaining the first download; the timer limits that invitation. A separately available public offer remains available after the invitation expires; the editor warns against describing it as the customer's only chance to buy.

The guided page tools change private working copy, not payment capture or experiment assignment. Native order bumps and downsell branches use the separate [commerce contract](./NATIVE_COMMERCE_BASKETS.md); controlled offer tests use the [offer experiments contract](./OFFER_EXPERIMENTS.md). No one-click or off-session charge is implemented.

### Follow-up council review

- **Buyer readiness:** the recipe planner offers Needs context, Comparing options and Ready for this offer. The choice changes the section order using the existing version-1 schema, and free landing pages initially suggest the lead-magnet recipe. The planner's choice is not a new persisted field: the resulting page sections are saved normally. Traffic suggests an editable starting point; it does not establish what a buyer knows. Existing headline/button copy still survives recipe replacement. A private comparison panel places the sending promise beside the current headline and action.
- **Customer-facing completeness:** a complete private brief is not treated as a complete public argument. Structured pages receive linked advice to check included resources, method and answered buying questions; legacy prose receives a human-review reminder. These checks stay advisory and do not predict conversion rates. External offers skip unused native upsell/thank-you advice.
- **Journey review:** payment and download-email configuration appears separately from publication validation, including email readiness for free downloads. Unknown checks are distinguished from missing configuration and can be retried. Configuration presence never means a real payment or inbox delivery was tested.
- **Accurate preview:** external listings preview the local landing and provider handoff only. Native simulations depend on offer kind, selected follow-up and actual timer configuration. Changing the selected presentation or checkout mode returns to a compatible preview. Unset paid prices are labeled explicitly in preview. All preview purchase/download/outgoing controls remain inert.
- **One effective external action:** Pages and Delivery edit the same displayed CTA. Old external button labels remain a fallback for legacy offers; explicit Delivery edits also synchronize that fallback so clearing the label cannot revive obsolete wording. Section buttons resolve external labels without implying a local download.
- **Recoverable availability checks:** a stalled or failed paid-checkout availability read has an explicit retry, preserving buyer input and creating no order. A verified unavailable checkout remains disabled; real claim authorization stays on the server.

## AI assistance

The server verifies the administrator's authenticated session and reads approved proof using that session. `admin_offer_copy_allow()` supplies a database-backed rolling limit of 12 requests per minute and 100 per day per administrator. It records only the user ID and request time, not prompts or generated copy, and remains effective across server instances. Only authenticated administrators can call it; usage rows are private. The endpoint must call it before model generation and fail closed if the RPC is unavailable.

The copy request carries checkout mode and price-display mode. The server supplies explicit pricing context: fixed, free, provider-controlled, or not yet set. Stale prices are removed from provider-controlled requests; an unfinished paid price is unknown, never free. External-provider delivery is distinguished from native checkout.

AI results are suggestions for the editor. They do not save, publish, change prices, or insert unreviewed proof automatically. Requests, selected evidence, model responses, and media addresses must pass their corresponding shared/server validation. The production deployment needs the configured AI provider environment variables already used by the project; provider availability is separate from the migration.

## Deployment

1. Apply `supabase/migrations/20260923090000_offer_builder.sql` to the target database before exposing the new editor. It is additive and requires the existing offer, shop, and external-listing migrations.
2. Deploy the updated `offers-api` edge function so access responses include the published thank-you presentation. Deploy the application and AI server route from the same release. Check the configured authenticated API and model access in the target environment.
3. Verify a new private draft, an existing published offer draft, an explicit publication, revision recovery, approved proof selection, and an authenticated AI suggestion in the preview environment.
4. Confirm old published offers with null presentation, existing checkout/access links, and existing analytics still work. Verify both accept and decline previews without creating orders.

These offer-builder deployment steps do not activate payment providers, connected journeys or experiments. Existing hosted checkout and follow-up routing remain the purchasing flow; the guided workflow does not add payment capture behavior or one-click charges. Separate contracts cover [native extras and downsells](./NATIVE_COMMERCE_BASKETS.md), [connected journeys](./FUNNEL_JOURNEYS.md) and [offer experiments](./OFFER_EXPERIMENTS.md).

## Verification

Run `bun scripts/tests/offer-builder-database.mjs`. The in-memory PostgreSQL suite applies the real migrations and verifies anonymous/member isolation, administrator proof access, immutable revisions, incomplete draft handling, publication atomicity, exact public schema, private proof stripping, no live mutations on draft save, request replay, dual concurrency checks, revision restoration, direct legacy changes, historical order snapshots, and durable AI limits. Run the existing offer database tests and application tests alongside the release's typecheck, lint, build, and browser journey checks.
