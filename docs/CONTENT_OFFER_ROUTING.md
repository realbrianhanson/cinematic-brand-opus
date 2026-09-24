# Contextual offer assignments

Site Config → **Relevant offers for your content** lets an administrator assign a published offer to one article/guide, a resource type, an industry, or a site-wide content default. Each assignment saves independently of the other Site Config fields. Optional headline, supporting copy and button text override the offer title/summary and neutral button defaults. Assigning the same scope and content replaces its previous assignment. Remove restores the next applicable fallback.

Assignments customize the shared `PublicCTA` recommendation block. The inline article signup cards continue to use the separately configured global free download; assigning an offer does not change those signup forms.

Resolution order is deterministic: **specific article/guide → resource type → industry → default offer → existing global CTA**. Resource types apply to generated resources and their listings. Industry rules apply where a page supplies an explicit niche, currently generated resources and guides; blog articles use explicit article assignments or the default. No keyword inference, behavioral profiling, or guessed topic matches are used. No assignments are seeded automatically.

Targets are selected from published offers with `funnel_only=false`. The public resolver checks that state on every request and skips unavailable offers so an old assignment cannot expose a draft or funnel-only upsell. Browser recommendations are cached for 30 seconds; saving/removing an assignment invalidates that browser's cache. Private fulfillment fields and the route registry are never exposed by the resolver.

Native recommendation links use `/offers/<validated-slug>` in the current tab, without UTMs that would overwrite acquisition attribution. They do not emit an outbound click. Existing consented offer-view and order measurement continues when the visitor reaches the offer. Global CTA copy, social proof and tracking remain as before when no eligible route is available. A matched offer does not inherit unrelated global social proof.

## Deployment

Apply `supabase/migrations/20260924070000_content_offer_routes.sql`, then deploy the application. No secrets or providers are required. Before the migration is applied, public pages fall back to the existing global CTA and the admin manager shows a setup error. Signed-in non-admin users can resolve recommendations but cannot inspect or modify rules.

Initial editorial setup: assign the AI Follow-Up Starter Kit to specific published follow-up articles and guides, and App Building Workshop to specific app-building content after reviewing its relevance. Use resource-type or industry defaults only when the entire group fits the same offer. The manager searches published pages by title (50 results at a time) rather than loading the complete content catalog.

## Verification

- `npx vitest run src/lib/__tests__/contentOfferRouting.test.ts src/components/__tests__/PublicCTA.test.tsx`
- `node scripts/tests/content-offer-routes-database.mjs`
- The database checks cover priority, empty-rule fallback, draft/funnel-only rejection, later unpublishing, deletion, public response privacy and non-admin permissions.
