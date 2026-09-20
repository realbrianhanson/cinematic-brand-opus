# Images inside offer descriptions

Offer descriptions can include responsive images between headings, paragraphs, lists, and testimonials. This is reusable for native and external offers, including member sites. It uses the existing body field; no database migration or owner-specific rendering is required.

## Editing

In **Admin → Offers → Edit offer → Full description**, place the cursor where the image belongs and choose **Insert image**. Enter a full HTTPS image URL, a meaningful image description, and an optional caption. **Add to description** inserts the image at the cursor or replaces selected text. Save the offer when the edits are ready. Insertion does not save or publish automatically.

The underlying format is a standalone line:

```text
![Describe the image](https://example.com/image.webp "Optional caption")
```

Use one line, without square brackets in the description or double quotes in the caption. URLs must use HTTPS, contain no credentials or whitespace, and be no longer than 2,048 characters. Encode parentheses in URLs. Invalid image syntax remains visible as ordinary text. Images inside quoted testimonials remain literal text. HTML and general Markdown links are not interpreted.

The public page shows the full image without cropping, its description for assistive technology, and a caption when provided. Visitors can enlarge it, scroll the original-size image, close with Escape, and return focus to the image button. Cover artwork and social preview images remain controlled separately by **Cover image URL**.

External offers repeat their existing action after the description. Both actions use the same validated destination and button text; preview disables them and affiliate disclosures stay visible near each action.

## PushTen copy and supplied artwork

Brian supplied both images on September 20, 2026 and asked to connect them to the cost of doing everything from scratch and his playful AI Addict founder story. The original PNG files are preserved in `output/shop-art/masters/`; WebP encoding preserves the complete composition and original dimensions.

| Asset                                   | Dimensions | WebP size     | Purpose                                                                        |
| --------------------------------------- | ---------- | ------------- | ------------------------------------------------------------------------------ |
| `public/shop/pushten-diy-costs-v1.webp` | 1512 × 842 | 209,874 bytes | The time, tool bills, and rework involved in building from scratch.            |
| `public/shop/brian-ai-addict-v1.webp`   | 1216 × 842 | 88,552 bytes  | Playful founder introduction, with the caption “AI Addict? Guilty as charged.” |

Sources: `codex-clipboard-41bf504e-200a-4742-a266-cae656a2e9b3.png` and `codex-clipboard-b45cbb1a-6391-4a30-a30e-afa43c5e7bcc.png`, supplied in the project conversation. These are promotional illustrations, not product screenshots or documentary proof. No new artwork or headshots were generated for this update.

The rewritten description introduces PushTen as a membership, connects the DIY cost problem to its templates and guidance, explains commercial rights, and ends with a concrete next step. The complete Lynn Hutchison testimonial stays verbatim. Evergreen features were checked against the linked enrollment page on September 20, 2026: templates, walkthroughs, training, community, ongoing releases while subscribed, and commercial/white-label rights for finished projects. Temporary prices, scarcity, bonuses, revenue outcomes, and promised build times were not added to the site copy.

The owner-only transaction is `scripts/maintenance/20260920-pushten-story-artwork.sql`. Publish and verify the renderer and both image assets first. The script checks the single owner identity, exact offer ID and slug, published external mode, existing destination, and unchanged copy. It updates only body, summary, and button text; the normal trigger also updates the timestamp. An already-applied version is unchanged. Brian-specific copy is not seeded into member installations.

The published cover stays `pushten-ai-business-launch-v2.webp`; the destination stays `https://go.aiforbusiness.com/get-pushten`. The new action text is **See What's Included in PushTen**. Other offers keep their copy and artwork while gaining reusable image support.
