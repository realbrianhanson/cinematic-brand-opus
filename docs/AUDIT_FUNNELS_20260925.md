# Funnel and offer audit — September 25, 2026

Scope: read-only audit followed by authorized schema-compatible builder/public-offer polish. No production writes, paid AI calls, migrations, orders or emails.

## Confirmed findings addressed

1. Blank recipes replaced existing sales descriptions with empty generic headings. OfferSections now hides empty placeholders and retains the legacy description when no substantive section content exists. Explicit CTA sections remain usable. Regression tested.
2. Manually created proof sections had no attribution editor. Added editable public testimonial attribution. Fact/demo library items were all inserted as blockquotes; they now insert as evidence text with public attribution, preserving exact content and keeping source URLs/notes private.
3. Copy generation omitted checkout/price-display modes. Provider-controlled listings and incomplete paid drafts could supply zero/stale prices. Request schema now includes these modes; server prompt normalizes provider/unset price to null and states the actual delivery/payment path.
4. Conversion review only checked the private brief plus missing media/guarantee; it missed empty recipe sections, missing attribution and absent on-page proof/action. Added advisory actionable step/page/section links; no new arbitrary publication hard gates.
5. Recipes were empty scaffolds. They now optionally populate entered problem/method/outcome/deliverables, retain existing headline/CTA, fill empty headline from supplied outcome/title and summary from supplied summary. Unverified evidence notes and unanswered objections remain private.
6. Benefits, deliverables, methods and FAQs had no type-specific scannability. Supported list syntax now yields cards/numbered steps, and confirmed question/answer syntax yields native expandable FAQs. Legacy/mixed prose falls back to original safe renderer.
7. Mobile first CTA followed a large cover image, which put PushTen action below the viewport. A mobile action now sits after the promise and before cover, scrolling/focusing existing offer controls. Native offers repeat the return-to-form action after their sales argument. No overlay; previews disabled; funnel-only standalone pages do not expose these controls; provider pricing preserved.
8. Next-step explanation displayed native confirmation/download steps even for external offers. External provider journey is now accurate; native copy explicitly explains separate checkout, no decline-to-downsell routing, and invitation expiry versus independent public availability. Timed offer that is independently available gets an editorial warning against “only chance” claims.

## Remaining product opportunities / limits

- Existing commerce supports a single next-offer chain, not multi-branch declines/downsell execution, order bumps, subscriptions or off-session charges. Adding these requires explicit commerce/consent/state-transition/attribution contracts, not merely changing copy.
- Actual conversion lifts require measured experiments; no conversion guarantees or invented proof/urgency were added.
- Current evidence library remains empty until approved content is manually added. Remembered testimonials were not imported/published automatically.
- Copy assistant changes are validated using mocked provider outputs; no paid generation invoked.
- Pending/failed follow-up checkout behavior remains governed by existing one-child-per-parent order constraints; changing retry semantics should be a separate backend-reviewed change to prevent duplicate payments.

## Verification

- 8 focused suites: 160 tests passed (builder/schema, UI, visitor journey, copy API, new polish regressions).
- After final mobile assertions: builder suite rerun, 9 tests passed.
- Typecheck passed.
- Scoped ESLint passed for all changed implementation/tests before final docs/mobile-test-only additions.
- Parent responsible for independent code/TypeScript review and browser integrated review.

## Inspected paths

Full relevant implementation reads:

- src/lib/offerBuilder.ts
- src/lib/offerBuilderValidation.ts
- src/lib/offerBuilderClient.ts
- src/lib/offerCopy.ts
- src/lib/offerCopy.server.ts
- src/lib/offerBody.ts
- src/lib/offers.ts
- src/lib/offerClaim.ts
- src/components/admin/OfferEditor.tsx
- src/components/admin/offerEditorState.ts
- src/components/admin/OfferNextStep.tsx
- src/components/admin/offers/OfferPageFields.tsx
- src/components/admin/offers/OfferCopyAssistant.tsx
- src/components/admin/offers/OfferStrategyFields.tsx
- src/components/admin/offers/OfferProofLibrary.tsx
- src/components/offers/OfferSections.tsx
- src/components/offers/OfferBuilderPreview.tsx
- src/components/offers/OfferBody.tsx
- src/components/OfferShell.tsx
- src/pages/OfferLanding.tsx
- src/pages/OfferAccess.tsx
- src/routes/offers.$slug.tsx
- src/routes/offers.preview.$id.tsx
- src/routes/admin.offers.new.tsx
- src/routes/api/admin/offer-copy.ts
- supabase/migrations/20260923090000_offer_builder.sql

Targeted reads/searches of supporting contract/tests/analytics/backend:

- docs/OFFER_BUILDER.md
- docs/OFFERS_CONTRACT.md
- docs/OFFER_TESTIMONIALS.md
- docs/CONVERSION_MEASUREMENT.md
- src/components/PublicMeasurement.tsx
- src/lib/conversions.ts
- supabase/migrations/20260919110000_offers_funnels.sql
- supabase/functions/_shared/offers.ts
- src/lib/**tests**/offerBuilder.test.tsx
- src/lib/**tests**/offerCopy.test.ts
- src/lib/**tests**/offerCopy-ui.test.tsx
- src/lib/**tests**/offerCopy.server.test.ts
- src/lib/**tests**/offers-journey.test.tsx
- src/components/admin/**tests**/OfferEditor.test.tsx
- scripts/tests/offer-builder-database.mjs
- scripts/tests/offers-database.mjs
- package.json

Coverage note: do not represent this delegated slice as a line-by-line audit of every repository file. Parent assigned separate public and backend/admin audits.
