# Public experience audit — September 25, 2026

## Implemented repairs

- Resource search now keeps its query and result page in the URL. Back/Forward restores the input and pagination together; new searches reset the page while preserving unrelated URL preferences and attribution.
- Article discovery now provides a keyboard-accessible Load more action and a retry action. Both article and news lists work without IntersectionObserver.
- The homepage hero poster is preloaded on the homepage only, avoiding a high-priority decorative download on every article, resource, admin and checkout route. The owner video, poster and branding remain intact.
- Article headings retain valid authored IDs, so existing in-article jump links continue working. Generated IDs avoid existing-ID collisions.
- Navigating between generated resources resets checklist, feedback and other per-page state and counts the newly visited resource independently. Feedback success appears only after the save succeeds; failures allow retry. Icon-only share and feedback controls now have accessible names.
- FAQ resources include answer text in initial HTML, expose expanded state and panel relationships, and label their search field. Changing FAQ/template filters clears index-based disclosure/copy state rather than applying it to a different item. Resource category filters expose their selected state.
- News share links use the active site's canonical configuration; failed copying reports a useful message. Invalid news identifiers take the missing-page path instead of becoming server errors.
- Optional article share/contents widgets refresh on route navigation. Share URLs omit tracking/query parameters.
- The public assistant now subscribes to route changes and hides promptly in admin, previews and focused offers. Closing the panel restores keyboard focus. Its height reserves space for the mobile CTA, it identifies itself as AI, accurately explains message handling, and links member sites without speaking enabled to Support.

## Verification

- Focused suite: **39 tests passed in 8 files**, including new browser-history, manual pagination, article-fragment, resource-transition, feedback failure/retry, FAQ initial-HTML, chat-navigation and focus regressions.
- Frontend TypeScript check passed after this package.
- Focused lint passed with no errors; two existing resource-renderer memo dependency warnings remain.
- Root-agent integration checks and live browser/crawl findings are recorded in the overall audit. These local tests use mocked service writes and did not create public feedback, leads, messages, subscriptions or purchases.

## Inspected coverage

Read the existing `AUDIT.md`, `DELIVERY_PLAN.md`, authority/conversion/testimonial and content-routing documentation before selecting changes. Reviewed public route setup and metadata for home, about, speaking, start-here, blog, news, resources and their detail/category routes; server public readers, SEO builders and router compatibility; homepage hero, navigation, footer, resource/testimonial sections; newsletter and speaking forms; article reading/capture/details/widgets; generated-resource pages and all six renderer formats; related-resource/silo navigation; shared information/support/privacy/terms pages; public measurement, mobile CTA, assistant and motion/print styling. Offer/checkout business logic, admin workflows, backend security and full live crawling were assigned to the other audit tracks.

## Further opportunities found

- Unify generated-resource typography with article pages. Several older renderers still use small text, faint inactive filters and cramped nested sidebars; the guide renderer and outer resource page can both add a desktop contents rail.
- Consolidate generated-resource contents into one accessible desktop/mobile navigation component and preserve a shareable location when a reader jumps to a section.
- Persist news query/lane selections in the URL as well as resource-library searches, so visitors can share filtered briefings and reliably return to them.
- Make checklist printing a focused worksheet: the existing print stylesheet hides controls but some inline dark surfaces and footer/CTA content remain.
- Review generated-resource editorial labels: “Last verified” is derived from `last_refreshed`, and the general live-research statement does not distinguish an automated refresh from a human source review. Introduce a real review status before making stronger editorial assurances.
- Library category readers currently request an unpaginated resource list. Add explicit pagination before any category approaches the backend row cap.

This audit records inspected behavior and bounded repairs. It does not claim every historical article is fact-checked or guarantee a conversion uplift.
