# Homepage testimonials

On September 20, 2026, all 26 documents currently in Brian's supplied testimonial folder were reviewed again against his request for the strongest, most enthusiastic Brian-focused endorsements. The original selection had reviewed 23 documents. These documents compile attendee comments from AI For Business summit transcripts and chats; they are the supplied source, not independently checked raw recordings. Lynn Hutchison's PushTen testimonial was supplied separately by Brian in this conversation.

## Selection standard

Prioritize concrete evidence of Brian's ability, clear enthusiasm, an identifiable benefit or change in behavior, and direct Brian attribution. Preserve actual words and the context of the event or product. Short general praise is less useful than a specific statement of why the experience mattered. Joint praise must not be edited to remove another instructor.

The September 20 selection featured Steve Cunningham (a concrete app-building example), E B Soloway (enthusiastic praise of Brian's knowledge), and the full lisa bond quote (a Brian-attributed change in mindset and working approach). The September 24 update below retains these quotes while featuring two newly checked excerpts beside Steve.

No selected quote mentions Francis. No ratings, titles, companies, headshots, or financial outcomes are invented. Summit feedback remains labeled as summit feedback; only Lynn's quote specifically endorses the PushTen seminar/program.

## Selected sources and treatment

| Attribution       | Supplied source                                                   | Context and treatment                                                                                                                                                             |
| ----------------- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Steve Cunningham  | January 21, 2026 (Day 1 of Summit Event) - Testimonials for Brian | Full exact quote. Describes an app Brian built; the 30-minute comment is the attendee's specific experience, not a delivery promise. Lead position.                               |
| E B Soloway       | May 13-15, 2026                                                   | May 15 teaching/training feedback. Full exact quote, Brian alone.                                                                                                                 |
| lisa bond         | April 17-19 Testimonials for Brian.docx                           | April 19 teaching/mindset feedback. Restored the complete exact quote, including the Brian-focused opening. Original lowercase attribution retained.                              |
| Lynn Hutchison    | Supplied by Brian in this conversation                            | Contiguous first three sentences, clearly labeled “PushTen seminar participant · Excerpt.” Full exact testimonial remains on the PushTen offer page and in OFFER_TESTIMONIALS.md. |
| Marla Ray         | July 22-24, 2026                                                  | Day 1. Full exact quote. Label is summit attendee because “join” does not establish which product her invitees joined or whether they purchased.                                  |
| Patricia Pisterzi | January 21, 2026 (Day 1 of Summit Event) - Testimonials for Brian | Full exact quote about the AI For Business Summit and her intent to join PRO. Not presented as a PushTen customer result or solely Brian's session.                               |

The section introduction now covers live training, events, and PushTen, matching its actual mix of sources.

## Changes from the original selection

- Steve moves into the main featured position.
- Lisa's earlier two-sentence excerpt omitted her explicit credit to Brian and the mindset change. The full source quote restores both.
- Robin Leal, James Linton, and Lynda Menge are positive but comparatively modest: knowing where to start, becoming acquainted with tools, or learning something new. They lose prominence under the user's stronger selection standard.
- Wendy Kazi remains a good reserve quote about the summit exceeding expectations. The current six provide more direct Brian praise, explicit PushTen feedback, referral behavior, and a skeptic-to-enthusiast story.
- Rosalina Bird offers a useful building breakthrough, but her source wording is less clear and also references PRO. It was not silently rewritten.
- Heshie Segal's “raving fan” statement explicitly names both Brian and Francis. It was not edited to imply Brian alone.
- Praise made immediately after a product pitch was not treated as evidence of product use. Compiler summaries, questions, host statements, and sympathy messages were excluded.

The Drive originals remain unchanged. Private source URLs and the full unselected compilations are not included in browser configuration or public page markup.

## Updating the section

Edit `homepageTestimonials` in `src/config/presets/brian.ts`. Each item contains `quote`, `attribution`, and an optional `context` label. Preserve the speaker's words and meaning; add source context here when changing the selection.

The section renders only when the active preset supplies at least one item. PushTen members start without these testimonials and should add their own accurately attributed feedback. Omit the block or use an empty `items` array to hide it. Homepage testimonials remain preset-configured; the separate offer testimonial uses the existing Admin offer-description editor.

## Additional verified excerpts — September 24, 2026

Brian supplied the AI4B testimonial master list and its original source folder.
Exact source links are retained in his private Obsidian testimonial proof library.
The following additions were checked against original material, not just the compilation:

- **Susie Satram:** “I had no experience in this, but I really feel more confident now.”
  A contiguous excerpt from her PushTen message in the September screenshot, visually verified.
  Label: PushTen member, September 2026, excerpt. This describes her confidence;
  it does not claim a universal completion time or business result.
- **Cindy Trump:** “Amazing training. I didn't get lost in the weeds once!”
  A contiguous excerpt from the March 17 workshop chat, timestamp **07:11:20**.
  Label: App-building workshop, March 17, 2026, excerpt. Whitespace is normalized;
  the words and punctuation are preserved.

These appear alongside the existing homepage feedback. Previous quotes remain
available under “More from the community.” They are teaching/program feedback,
not endorsements of every product on the site. Member presets remain empty.
The full master and a reusable offer/objection shortlist are saved privately in
Brian's Obsidian vault rather than copying the entire collection into this repo.

The compilation has incorrect filename references for some loose screenshots.
Use the verified original URL for any published excerpt. No earnings quote or
historical price was added to the website in this batch.
