# Offer testimonials

Offer descriptions support a small plain-text quote format. Edit **Admin → Offers → PushTen → Full description** to update this testimonial. The same format works for native offers, external offers, and member sites; it is not tied to Brian’s offer or slug.

## Quote format

Prefix quote lines with `> `, use a bare `>` between quote paragraphs, and put the attribution in its own final quote paragraph:

```text
## From a participant

> First paragraph of their exact words.
>
> A second paragraph.
>
> — Participant Name
```

The full quote is visible in the page HTML with semantic blockquote and attribution markup. HTML and Markdown links in the description remain plain text. Standalone images outside quotes use the separate [offer image format](OFFER_IMAGES.md); image syntax inside a testimonial stays literal. No star rating, verification badge, portrait, or results claim is inferred from a testimonial.

## Lynn Hutchison’s PushTen testimonial

Source: Brian supplied this quote and attribution in the project conversation on September 20, 2026. Her words are preserved exactly, including her reference to the two-day seminar and the PushTen program. The existing offer remains a PushTen app and website templates listing; the quote does not change its pricing, access terms, or external destination.

Attribution: **Lynn Hutchison**

Brian's 2-day PushTen seminar was phenomenal. He covers from A-Z all of the steps of what to do to build your AI business using tools like Lovable, GoHighLevel, Claude, and many other AI tools and knowledge to successfully build your apps and take your ideas and businesses to market. I highly recommend it to anyone, both beginners and advanced, to the PushTen 2-day seminar program and to the PushTen program too. I would also like to thank both Brian and the team for being very helpful and ready to answer any and all of the questions posted by the group. This is a truly amazing team of people who are extremely excited and generous about sharing all that there is currently in AI and to teaching you how to do it too. Wonderful experience!

Thank you so much!

The owner-only content script `scripts/maintenance/20260920-pushten-lynn-testimonial.sql` inserts the quote before “Want to see the process first?” in the existing PushTen description. Publish the generic quote renderer before applying that script. It checks Brian’s site identity and the exact offer ID/slug, refuses a changed description, and does nothing when the intended description is already present. This content is not added to member bootstrap or a schema migration.

## Verified publication

Published source commit `8b8cf69fd1f8bf316233a328aef9eb55ec41c1d1`, Lovable deployment `1966d3ed-6994-425c-a1f7-ea2c28ade782`. [Full release verification passed](https://github.com/realbrianhanson/cinematic-brand-opus/actions/runs/35490134197). The custom-domain deployment was verified before the owner content transaction was applied. Production readback matched the intended body exactly and confirmed all other offer fields were unchanged except the normal update timestamp.

Validation passed: 51 targeted parser, visitor-journey, and admin-editor tests; typecheck, lint, formatting, production build, independent code and TypeScript reviews, and isolated SQL checks for idempotence/preservation plus ten rejected guard cases. Live browser checks at 1440/390/320 widths verified the full quote and attribution, no overflow or page errors, unchanged PushTen artwork and purchase destination, and server-rendered attribution. Other offer pages loaded without Lynn’s quote. No forms, payments, emails, or tracking writes were triggered by QA.
