# Authority, Shop, and admin upgrade

**Last updated:** September 19, 2026
**Release status:** Implementation and local verification complete; live publishing and final production verification are pending. Do not treat this document as proof of deployment.

## Visitor experience

The homepage keeps Brian's original `/videos/hero-bg.mp4` video and adds a pause/resume control. The opening now leads into clear product paths, the free event, real testimonial proof, and the personal story. The blocking introduction, custom cursor, and animated film-grain canvas are removed from the homepage composition.

Published, listed, featured offers appear in a homepage Shop section. It disappears when no qualifying offers exist. Product cards share the Shop's prices and descriptions; original typographic covers provide a consistent fallback when no cover is uploaded. Search, category filters, and free/paid filters remain available in `/shop`.

Offer detail pages put the action beside the introduction on desktop and before long descriptions on mobile. Plain-text descriptions support `##` headings and `-` bullet lists, without interpreting HTML. Related public offers give readers another relevant path into the catalog. Funnel-only offers are excluded from public merchandising.

The full speaking form lives at `/speaking`; a shorter homepage invitation links there. The speaking route and sitemap entry follow the site's speaking-section setting. The blank member preset keeps this section off.

## Admin workspace

- **Overview:** Exact database counts distinguish confirmed newsletter subscribers, published Shop listings, fulfilled paid website orders, free claims, and new speaking inquiries. Failed queries are reported rather than presented as verified zeroes. Content and setup issues receive direct action links.
- **Navigation:** Grouped sections, meaningful collapsed icons, a Cmd/Ctrl+K command menu, and article/offer creation shortcuts make common actions easier to reach.
- **Queue & automation:** Controls reflect saved automation settings. Skipped work, partial failures, failed database operations, and unsuccessful publication are not announced as successful completion. Bounded list sizes are disclosed.
- **Offers & shop:** The Offers, Leads & orders, and Stripe setup views have shareable URLs through `?tab=offers`, `?tab=orders`, and `?tab=setup`.
- **Speaking inquiries:** A private inbox supports search, filtering, status, and notes. Intake has an explicit on/off control. Submission retries are idempotent, and admin note edits detect concurrent changes.

Speaking intake requires its migration and backend function before activation. Follow [Speaking inquiries](./SPEAKING_INQUIRIES.md) for deployment, privacy controls, and the request contract. It does not send automated email notifications or subscribe the visitor to a newsletter.

## Commerce and member setup

An offer uses either **website checkout/download** or an **external link**. Website orders and entitlements are managed here. External checkout, delivery, refunds, and upsells remain with the destination; opening that link creates no local order. Third-party affiliate listings display a disclosure and mark the outbound link as sponsored. Brian's own externally hosted products are not automatically affiliate products.

Stripe keys remain unconfigured for Brian's installation. Paid website checkout stays unavailable until credentials and the webhook are configured and tested. External listings do not require this site's Stripe credentials. Neither affiliate commissions nor externally completed purchases appear in the admin's website order counts. These counts are not a complete business revenue report.

Read [Offers setup](./OFFERS_SETUP.md) and [Offers contract](./OFFERS_CONTRACT.md) for payments, file delivery, funnels, and limitations. [Brian's Shop listings](./BRIAN_SHOP_LISTINGS.md) explains the owner-only product content and pricing choices.

New member projects should follow [PushTen setup](../PUSH_TEN_SETUP.md), use their own identity and backend, and retain disabled automation/intake defaults until configured. Brian's product content and intake activation are owner actions, not template defaults. Never copy his customers, inquiry records, private files, or payment credentials into a member site.

## Design references

Mobbin references informed the hierarchy and interaction patterns. The implementation uses the site's own content and original artwork; reference screenshots, assets, and sample business metrics were not copied.

| Reference                                                                                         | Pattern adapted                                                                           |
| ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| [Kajabi Experts](https://mobbin.com/sites/sections/2218b3df-7762-41d6-aa70-0089c64c9992)          | Personal authority through portrait, clear introductory copy, and focused calls to action |
| [SuperHi catalog](https://mobbin.com/screens/b1f08cbd-26a2-4696-b4d3-221706b51938)                | Distinctive product cards with readable descriptions and category labels                  |
| [Square dashboard](https://mobbin.com/screens/08a51380-10d4-4453-9761-91f589f63e84)               | Actionable setup and attention items beside real operating counts                         |
| [Squarespace commerce dashboard](https://mobbin.com/screens/73a6fc00-421e-4c71-8d6a-e1f43b2f78ed) | Business-focused overview and convenient product creation                                 |

## Verification record

The release integrator reports all 322 unit/component tests passing, successful TypeScript and Deno checks, a production build, and all nine isolated database suites passing. ESLint reports zero errors and 290 existing warnings; the dependency audit reports zero advisories. The speaking-inquiry migration has been applied and its database state verified; intake remains paused pending backend deployment and release verification.

Production verification is still pending at this handoff. Record the final commit, Lovable deployment, migration/function activation, and read-only desktop/mobile checks in [AUDIT.md](../AUDIT.md) before marking the release complete. No fabricated live inquiries, orders, subscriptions, payments, or outbound emails are needed for these checks. Automated checks demonstrate the tested behavior; they do not guarantee search rankings, conversions, or revenue.
