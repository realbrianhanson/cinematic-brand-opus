# Funnel/product council review — September 25, 2026

Inspected `/tmp/cinematic-council-20260925` at `711f704`. Read the previous funnel audit, builder contract, commerce contract, builder strategy/pages/proof/copy/review/save/recovery components, public landing/access rendering and supporting types. This is an adversarial code review of the funnel slice, not a claim that real payment, email or AI calls were exercised. No application code or production state changed.

## 1. A transient readiness failure turns a working paid offer into a dead end

- **Severity:** P1 functional/conversion reliability. **Confidence:** high, directly visible control flow.
- **Evidence:** `src/pages/OfferLanding.tsx:323-348` stores readiness as `boolean | null`, fetches once and converts every exception to `false`. Lines 461-466 disable checkout when readiness is not true; lines 489-495 say purchases are unavailable. There is no retry control or distinction between a real configuration failure and a temporary connection problem.
- **What the expert would say:** A buyer who is ready to purchase should not be stranded because one availability request failed.
- **Fix now:** Give readiness explicit loading/ready/unavailable/error states, a safe **Check again** action after a failed read, bounded timeout and in-flight deduplication. Preserve buyer name/email. Keep backend checkout authorization authoritative and never start orders as a readiness retry.
- **Validation:** Mock first availability call failing and second succeeding; retry re-enables checkout without making a claim, creating an order or clearing form fields. Assert genuine `payments_ready:false` remains unavailable and preview/free/external paths never call paid readiness.

## 2. The preview demonstrates journeys the selected offer cannot run

- **Severity:** P1 builder correctness; P2 immediate shopper impact because these are admin-only simulations. **Confidence:** high.
- **Evidence:** `src/components/offers/OfferBuilderPreview.tsx:128-151` always offers After purchase, Follow-up, Declined, Expired and Pending payment. Lines 167-207 render local upsells, downloads and pending payments without checking `checkout_mode` or kind. `OfferEditor.tsx` only passes `nextOffer=null` for external offers, so selecting After purchase for PushTen still shows **Your download is ready** and **Download file**. The external Next-step explanation was repaired previously, but this separate preview path was not. Simulation state also survives a change of presentation, so choosing another presentation while preview is in Pending payment appears not to update the preview. Paid drafts with no confirmed price can display a zero-money price in preview (`OfferEditor.tsx:661-663`), unlike the improved AI pricing contract.
- **What the expert would say:** The preview must represent the journey customers actually get, not make the product look more capable than it is.
- **Fix now:** Derive preview choices from native/external, free/paid and actual follow-up configuration. External mode shows the local landing plus an explicit provider handoff, never local fulfillment/upsell/payment state. Reset incompatible simulation when checkout mode, selected offer or presentation changes. Mark unfinished native paid pricing as **Price not set** in admin preview. Keep all actions inert.
- **Validation:** Matrix of external provider-price, native free and native paid; switch stages/modes while a simulation is selected; assert no outgoing requests or payment/download actions.

## 3. Two button editors compete, so an accepted edit can visibly do nothing

- **Severity:** P2 editing correctness/message consistency. **Confidence:** high.
- **Evidence:** `src/components/admin/offers/OfferPageFields.tsx:118-128` edits `landing.ctaText`; `src/components/admin/OfferDeliveryStep.tsx:81-91` separately offers an external **Button label**, editing `externalButtonText`. Public external actions choose `landing.ctaText` first (`src/pages/OfferLanding.tsx:178-181`), silently ignoring the Delivery edit when page copy exists. Recipe application adds a nonempty page CTA by default. Section CTAs use a third fallback at `OfferLanding.tsx:132-137`, which can call a free external offer a download even though it only goes to another website.
- **What the expert would say:** There should be one clear customer action. The editor must make the effective label and destination unmistakable.
- **Fix now:** Use a shared effective CTA resolver for the main action and section label. Make the Delivery field edit the actual visible page action or clearly label/show the effective override with a direct link to its editor. Preserve legacy `external_button_text` fallback for old offers. Distinguish scroll-to-controls button copy from the outbound/submit action.
- **Validation:** External offer with existing structured CTA, legacy-only CTA, blank CTA and free provider offer; editing the displayed control must visibly change the live preview and persist in the expected field.

## 4. Recipes are not yet tailored to buyer readiness or the product's actual journey

- **Severity:** P2 product capability/conversion opportunity. **Confidence:** high about current behavior; lift requires testing.
- **Evidence:** `src/lib/offerBuilder.ts:239-277` defines three fixed section arrays and copies problem, method, outcome and deliverables. It does not read traffic, audience or sending message when choosing order or guidance. `OfferPageFields.tsx:27-29` defaults every landing to **Sales page**, even native free downloads. An existing customer and a cold-search visitor therefore receive the same sales recipe unless the editor manually redesigns it.
- **What the expert would say:** The page should answer this buyer's next question in the right order. A lead magnet, known-customer upgrade and cold sales pitch are different decisions.
- **Fix now without a migration:** Recommend the existing recipe from offer kind/stage, expose an explicit local choice of **Needs context / Comparing options / Ready for this offer**, and use that choice to select section order and editing prompts. Traffic can suggest a starting point but must not be treated as identical to awareness. Persist the resulting normal version-1 sections; do not add an unsupported key to the strict stored schema. Add a source-message comparison panel showing the private sending promise next to headline/CTA without copying an entire ad into public copy.
- **Validation:** Deterministic recipe tests for each choice and native free default; existing author copy is preserved; no invented quantities, deadlines, prices, guarantees or testimonial text. Confirm recipe replacement warning remains.

## 5. The copy assistant does not see the page it is supposed to improve

- **Severity:** P2 relevance/consistency. **Confidence:** high.
- **Evidence:** `src/components/admin/offers/OfferCopyAssistant.tsx:58-81` sends original `offer.body`, current headline/subheadline and only the selected section for section mode. `src/lib/offerCopy.ts:37-50` excludes the other structured sections entirely. Once structured copy replaces the original description, the assistant can be reasoning from stale legacy copy and cannot see existing FAQ answers, repeated benefits, actual guarantee text or sequence. Upsell mode also has no verified parent-product context; the current safety prompt correctly forbids inventing it, which makes specific transitions hard to produce.
- **What the expert would say:** A section belongs to a whole argument. Rewriting a paragraph without the argument causes repetition and weak transitions.
- **Fix now without paid generation:** Extend the request-only schema with bounded current-page context (section purpose, heading and body, plus the visible CTA). Treat it as untrusted context, not newly approved evidence; continue looking up approved proof server-side and keep guarantees/pricing out of editable AI targets. Add optional explicit qualifying-product context only when a parent is selected/known; otherwise continue withholding parent claims. Respect the request byte cap by deliberate truncation and disclose omitted context to the editor.
- **Validation:** Mocked prompt/schema tests confirm structured copy reaches the request, stale legacy description is labeled as fallback, context size is bounded and evidence/terms controls stay in force. No paid call needed.

## 6. Review checks that fields exist, not that the public argument answers the buying questions

- **Severity:** P2 editorial quality/launch clarity. **Confidence:** high.
- **Evidence:** `src/lib/offerBuilder.ts:394-419` checks deliverables/objections in the private brief; `:465-511` checks empty existing sections, attribution, CTA and any proof but never asks whether the public page actually states included resources, mechanism or answers. A filled private brief plus a testimonial and CTA can therefore eliminate all editorial warnings while leaving the buyer without the information the brief contains. `OfferEditor.tsx:1132-1142` shows a green **Required offer details are complete** followed by low-emphasis checkout warning; free delivery readiness does not appear in this review panel.
- **What the expert would say:** A complete form is not a complete offer. Review the customer's unanswered questions and distinguish a publishable page from a functioning checkout/delivery path.
- **Fix now:** Group review into **Customer decision**, **Journey readiness**, and **Publication validation**, with specific linked suggestions for missing on-page inclusions/how-it-works/answered objections when structured sections are used. Keep legacy long-form prose a manual review item rather than mechanically declaring it absent. Show truthful separate payment and delivery state, with retry/setup links. Keep advice advisory and preserve the existing intentional ability to publish a page before Stripe configuration; do not introduce a fabricated score or conversion prediction.
- **Validation:** Rich private brief plus proof/CTA alone produces on-page advice; complete structured recipe does not; legacy prose is not wrongly blocked; external listings do not get native checkout/download warnings; free native delivery problems are visible.

## Order of implementation

Ship 1–3 first as correctness fixes. Then 4 and 6 improve the builder's direct-response workflow without paid tools or new backend contracts. Item 5 can be shipped with mocked tests when the extra request context is bounded and independently reviewed. The existing strict draft/presentation schemas and payment contracts can remain unchanged for these improvements.

## Commerce boundaries, not frontend defects

The current implementation intentionally supports single next-offer chains, hosted separate payments and downloads. Native order bumps, one-click/off-session charges, decline-to-downsell branches, subscription billing, randomized experiment assignment and verified external-provider revenue attribution are not currently available. A UI toggle cannot safely create these features; they need separate consent, payment/state-machine and attribution design plus provider verification. Do not market the preview as exercising those capabilities or represent this review as validating real payments.

## Implemented in this pass

Findings 1, 2, 3, 4 and 6 have now been addressed in the working tree, including awareness-guided schema-compatible recipes and separate customer journey readiness. Item 5 (whole-page AI context) remains a documented next opportunity; parent prioritized deterministic builder quality over expanding the copy API in this pass. No paid calls, migrations, orders, emails or production writes were performed. Focused validation: 5 test files, 114 passing tests; scoped ESLint and diff whitespace checks pass. Parent is responsible for independent review and integrated browser/build verification before merge.
