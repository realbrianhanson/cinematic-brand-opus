# Authority, Shop, and admin upgrade

**Last updated:** September 19, 2026
**Release status:** Published and verified. The latest 356-page recrawl and release CI passed; release receipts and measured checks are recorded in [AUDIT.md](../AUDIT.md).

## Visitor experience

The homepage keeps Brian's original `/videos/hero-bg.mp4` video and adds a pause/resume control. The opening now leads into the free event, real testimonial proof, clear product paths, and the personal story. The blocking introduction, custom cursor, and animated film-grain canvas are removed from the homepage composition.

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

All **329 tests across 51 files** pass, along with TypeScript, Deno checks, formatting, the production build, and all nine isolated database suites. The final [release CI](https://github.com/realbrianhanson/cinematic-brand-opus/actions/runs/35431065671) passed every step. ESLint reports zero errors and 290 existing warnings; the dependency audit reports zero advisories. Fourteen isolated admin journeys passed. Read-only browser checks covered the live homepage, Shop, speaking page, and authenticated admin at desktop and phone widths, including 1440, 390, and 320 pixels.

The speaking-inquiry migration and function are deployed, and Brian's intake is enabled. Production readback found zero inquiries and zero orders; QA did not create either. The member bootstrap protects inquiry records and leaves member intake disabled.

A crawl of 351 public pages exposed three issues: a resource-category parameter causing a 500 response, missing server-rendered HTML sitemap metadata, and a duplicate legacy article heading. Follow-up commit `7dd07074dd5f444a83592b91261e035c9cd1bc26` fixes these paths and adds regressions. Release source `529cab4a79dae02caf8b63b4a2ac29ea1da95c0b` includes those fixes and normalized generated types; frontend deployment `8fb599cc-64bf-4245-b88b-02856958139e` is verified by the live custom-domain GET response header. Its deployed crawler returns the checked article successfully with the correct title and exactly one H1. The confirming published recrawl passed **351 of 351 pages**, with no recorded failures or duplicate page titles.

The final-deployment Shop browser rerun passed at 390px and 1440px with both real products, search/filter behavior, and outbound destinations checked. It recorded zero page errors and zero order API calls.

See [AUDIT.md](../AUDIT.md) for deployment receipts and final release status. No fabricated live inquiries, orders, subscriptions, payments, or outbound emails were created for these checks. Automated checks demonstrate the tested behavior; they do not guarantee search rankings, conversions, or revenue.

## Follow-up: clearer visitor paths and reliable downloads

The next release simplifies navigation to Shop, Free Resources, About Brian, and
Speaking. Start Here introduces a practical fictional demonstration and the
actual free starter kit. Support, Privacy, and Terms have their own public pages
and metadata. Shop filters show populated categories. Native downloads gain
transactional email, private recovery, and explicit admin retry/readiness controls;
Stripe remains unset. News source attribution, duplicate filtering, import review,
Markdown editing, and mobile layout are improved. The final release removes
repeated summary text from brief news detail pages.

The expanded suite passes **387 tests in 61 files** and **ten isolated database
suites**. Final source `18b1ece006dc4fbf78cfc3012185b30a3461eb1f` passed
[all release CI checks](https://github.com/realbrianhanson/cinematic-brand-opus/actions/runs/35432370825).
Frontend deployment `876c629c-f657-4d67-ad40-ed1a72a5c013` is confirmed on the
custom domain. See the appended record in [AUDIT.md](../AUDIT.md) for final
production crawl and browser evidence.
