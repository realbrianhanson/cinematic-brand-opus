# Testimonials

## Source verification note — September 24, 2026

The grouped selection below is preserved from the merged testimonial update.
Brian's private Obsidian proof library retains 22 curated entries, the complete
master compilation, exact original links, and verification boundaries for future
offer-specific selections. No private source links are copied into this repo.

Direct source checks confirmed Susie Satram's confidence excerpt and Cindy Trump's
March 17 workshop comment, “Amazing training. I didn't get lost in the weeds once!”
(chat timestamp 07:11:20). Susie's full quote is already included in the grouped
selection; Cindy remains an additional verified option in the private library.

Three master-list screenshot references were mismatched. The checked originals
show Kathy's value/workshop recommendation in 031239, Heiko's incomplete earnings
comment in 023720, and Kathy's client-result comment in 031620. Use the corrected
source references in the private library for future excerpts.

A screenshot verifies the statement's wording and attribution, not underlying
earnings or typical performance. Randi describes an offer to pay, Alim describes
built assets, and Jayme describes business-model clarity; these are not confirmed
paid outcomes. Heiko's earnings comment lacks product, currency, timeframe and
cost context. The existing income disclosure does not by itself establish claim
substantiation or compliance; see the FTC's [endorsement guidance](https://www.ftc.gov/business-guidance/resources/ftcs-endorsement-guides-what-people-are-asking).

## September 23, 2026 selection

Brian approved a four-group selection from two sources:

- The Drive doc "AI4B Testimonials: Master List (All Sessions + Screenshots)", compiled September 23, 2026 across all sessions.
- Zoom meeting chat screenshots (dark mode, each cropped to the author's own message), saved at 2x as WebP in `public/testimonials/`.

The Drive originals stay unchanged. Private source links and the unselected compilations stay out of browser configuration and page markup.

**Before this goes live, Brian must confirm each person's permission** to publish their name, words and, where used, their chat screenshot. Code can't check this. Track it in the Permission column below.

## Where each group shows

| Group                                            | Where                                         | Component                                                       |
| ------------------------------------------------ | --------------------------------------------- | --------------------------------------------------------------- |
| Results (with the income disclosure)             | Homepage, first                               | `HomeTestimonials` → `TestimonialGroupSection`                  |
| You don't have to be a techie                    | Homepage, second                              | `HomeTestimonials` → `TestimonialGroupSection`                  |
| Short lines                                      | Homepage, scrolling wall after the groups     | `TestimonialWall`                                               |
| The six earlier quotes (September 20 selection)  | Homepage, collapsed "More from the community" | `HomeTestimonials`                                              |
| About Brian (Randi's pull quote, then five more) | `/about`                                      | `AboutTestimonials` (wraps the reusable `TestimonialQuoteGrid`) |
| Randi and Lisa Wald's SBA line                   | `/speaking`                                   | `SpeakingTestimonials`                                          |

All of it lives in `src/config/presets/brianTestimonials.ts` and reaches the pages through Brian's preset (`homepageTestimonials`, `aboutTestimonials`, `speakingTestimonials`). Member presets get none of it.

## People, sources and permission

| Person                                      | Used in                             | Format                                                                                | Context label                                                    | Permission       |
| ------------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | ---------------- |
| Kathy Bryant                                | Results                             | Screenshot `kathy-results.webp` (528×306)                                             | Build It. Brand It. Sell It. training chat · September 2026      | Brian to confirm |
| Heiko Katins                                | Results, not a techie, wall         | Screenshot `heiko-results.webp` (594×272); spoken quote; short line                   | Community chat · September 2026; Masterskill Workshop · May 2026 | Brian to confirm |
| Randi Winter                                | Results, About pull quote, speaking | Workshop comment; the "heart" line was spoken                                         | Masterskill Workshop · May 2026                                  | Brian to confirm |
| Jayme Johnson                               | Results                             | Spoken                                                                                | Live training · June 2026                                        | Brian to confirm |
| Alim Haji                                   | Results                             | On camera                                                                             | App Building Workshop · March 2026                               | Brian to confirm |
| Susie Satram                                | Not a techie                        | Screenshot `susie-1.webp` (528×706)                                                   | Build It. Brand It. Sell It. training chat · September 2026      | Brian to confirm |
| Heshie Segal                                | Not a techie, wall                  | Screenshot `heshie.webp` (592×466) with a typed excerpt; short line                   | Community chat · July 2026                                       | Brian to confirm |
| Kathleen Stapleton                          | Not a techie                        | Typed                                                                                 | PushTen product overview · May 2026                              | Brian to confirm |
| Lisa Wald                                   | About (two quotes), speaking, wall  | Typed                                                                                 | App Building Workshop · March 2026                               | Brian to confirm |
| Dana Larew                                  | About                               | Typed                                                                                 | Masterskill Workshop · May 2026                                  | Brian to confirm |
| Kurtis Rudd                                 | About                               | Typed                                                                                 | Live training · May 2026                                         | Brian to confirm |
| Sara B. Gochberg                            | About                               | Typed                                                                                 | App Building Workshop · March 2026                               | Brian to confirm |
| Jessica Farrone, Heather Olson, Ingrid Horn | Wall                                | Short line                                                                            | None shown                                                       | Brian to confirm |
| SE Hartley, Julie Cooper-Bierman            | Wall                                | Text from `se-hartley.webp` and `julie-cooper-bierman.webp` (the images aren't shown) | None shown                                                       | Brian to confirm |

## Rules

- **Verbatim.** Keep each person's own spelling, casing and punctuation: "Push Ten", "Im", "awhile", "Its", "2,5K", "brian", "thank you @Brian Hanson..". Don't clean up their words.
- **Contiguous excerpts only.** Never stitch text from different places together.
- **Joint praise is never edited to remove another instructor.** See the Francis rule below.
- **Screenshot alt text is the exact visible text.** The typed version of a screenshot quote keeps the master list's straight apostrophes and "..."; the alt text follows the image (curly ’, "…", and Heiko's two emoji).
- **Income claims get the disclosure.** Kathy ("Over $2k") and Heiko ("2,5K") sit in the Results group. This fixed text shows directly under the group at 15px and 80% white, and again under each enlarged Results screenshot: "These are individual results. They aren't typical, and they aren't a promise. What you earn depends on your skills, effort and market".
- **Our own copy follows Brian's voice.** Headings, labels and controls never end with a period, never use em dashes, and write "PushTen" as one word. Quotes are exempt.
- **No review structured data.** Testimonials never feed JSON-LD, so there is no `Review` or `AggregateRating` markup. Review markup about your own business isn't eligible for review rich results.

## Excerpt boundaries

- **Heshie Segal (the Francis rule).** Her message credits Francis mid-way ("Francis is amazing."). The typed excerpt under her card is the contiguous opening, ending at "anyone can do this!", right before that sentence. Her screenshot sits directly above the excerpt and shows the full message, Francis included, and its alt text is the full message. "These guys" in the excerpt still covers both instructors. Her wall line ("This is the BEST investment you can make") is the opening of the same message.
- **Heiko Katins, spoken.** Contiguous from "I'm 59" to "thanks to you!".
- **Kathy Bryant, Heiko Katins (results) and Susie Satram.** Complete messages.
- **Everyone else.** Complete quotes, as they appear in the master list.

## Left out on purpose

- `kathy-member.webp` quotes "$199 to join the 2 day app building workshop". That price may be outdated next to the $7 shop listing, so the image isn't used. The file is still in `public/testimonials/`, which means anyone can open `/testimonials/kathy-member.webp` until it is deleted.
- `susie-2.webp` is a reply ("It so true...") and doesn't stand alone.
- Heiko's "Best 2 Day Session - even tops the 3 Day Summit" stays off the main site.

## How it behaves

- Screenshot cards show the image at half its natural size (the files are 2x) with explicit `width` and `height`, `loading="lazy"` and `decoding="async"`, so nothing shifts while they load. On phones the image fills the card up to 420px. The caption is the person's name and context. Heshie's caption also carries her typed excerpt.
- "Enlarge" opens the same accessible Radix dialog pattern the offer body images use: focus moves in, Escape closes, and focus returns to the button.
- The wall scrolls slowly (about 31px a second on desktop) and pauses on hover, on keyboard focus and with its Pause button. The loop copy is `aria-hidden`. When a visitor asks for reduced motion, it never moves: the loop copy and the Pause button disappear and the lines wrap into a static grid.

## Updating

- Edit `src/config/presets/brianTestimonials.ts`. In the same change, update `src/config/__tests__/fixtures/testimonialSpec.ts` with the approved text. `brianTestimonials.test.ts` fails when a quote differs from the fixtures, a screenshot file or its pixel size doesn't match, or our own copy ends with a period.
- New screenshot: save it at 2x as WebP in `public/testimonials/`, record its natural `width` and `height`, and set `alt` to the exact visible text. `showQuote: true` adds the typed `quote` under the image, for a contiguous excerpt of a longer message.
- Card shapes: `layout: "wide"` makes a feature quote (full row on two columns, two of three columns on wide screens). `layout: "tall"` spans two rows on wide screens.
- A group's `disclosure` shows directly under that group and inside its enlarged screenshots.

## The six earlier quotes (September 20, 2026)

These led the homepage before this selection. They now sit, unchanged, in the collapsed "More from the community" list. The September 20 review covered all 26 documents then in Brian's testimonial folder. Those documents compile attendee comments from AI For Business summit transcripts and chats. They are the supplied source, not independently checked raw recordings. Lynn Hutchison's PushTen testimonial was supplied separately by Brian.

| Attribution       | Supplied source                                                   | Context and treatment                                                                                                                                                             |
| ----------------- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Steve Cunningham  | January 21, 2026 (Day 1 of Summit Event) - Testimonials for Brian | Full exact quote. Describes an app Brian built; the 30-minute comment is the attendee's specific experience, not a delivery promise.                                              |
| E B Soloway       | May 13-15, 2026                                                   | May 15 teaching/training feedback. Full exact quote, Brian alone.                                                                                                                 |
| lisa bond         | April 17-19 Testimonials for Brian.docx                           | April 19 teaching/mindset feedback. The complete exact quote, including the Brian-focused opening. Original lowercase attribution retained.                                       |
| Lynn Hutchison    | Supplied by Brian                                                 | Contiguous first three sentences, clearly labeled “PushTen seminar participant · Excerpt.” Full exact testimonial remains on the PushTen offer page and in OFFER_TESTIMONIALS.md. |
| Marla Ray         | July 22-24, 2026                                                  | Day 1. Full exact quote. Label is summit attendee because “join” does not establish which product her invitees joined or whether they purchased.                                  |
| Patricia Pisterzi | January 21, 2026 (Day 1 of Summit Event) - Testimonials for Brian | Full exact quote about the AI For Business Summit and her intent to join PRO. Not presented as a PushTen customer result or solely Brian's session.                               |

None of these six mentions Francis. Heshie Segal's earlier "raving fan" statement named both Brian and Francis, so it was left out rather than edited. Robin Leal, James Linton, Lynda Menge, Wendy Kazi and Rosalina Bird were reviewed and held in reserve. Praise made right after a product pitch wasn't treated as evidence of product use, and compiler summaries, questions, host statements and sympathy messages were excluded.

## Member sites

PushTen members start without any of these testimonials and should add their own accurately attributed feedback. A preset with only a flat `homepageTestimonials.items` list (no `groups`) renders exactly as before: the first quote leads, the next two sit beside it, and the rest go into "More from the community". Omit the block or leave `items` empty to hide the section. `aboutTestimonials` and `speakingTestimonials` are optional too; without them those sections don't render. The separate offer testimonial uses the existing Admin offer-description editor.
