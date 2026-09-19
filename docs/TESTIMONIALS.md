# Homepage testimonials

Brian supplied a folder of 23 testimonial documents on September 19, 2026.
These documents compile comments from AI For Business summit transcripts and
chats; they are the supplied source, not independently checked raw recordings.
All 23 documents were reviewed for this selection.

The six homepage quotes emphasize understanding the tools, Brian's teaching,
practical demonstrations, and continued learning. None mentions Francis.
They appear beside the training section, not as hired-client endorsements of
keynote speaking or reviews of individual Shop products. No star ratings,
job titles, company names, headshots, or financial results have been invented.

## Selected sources

| Attribution      | Supplied document                                                  | Source context                                          | Treatment                                                                           |
| ---------------- | ------------------------------------------------------------------ | ------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Robin Leal       | January 21, 2026 (Day 1 of Summit Event) - Testimonials for Brian  | Teaching Skills / Presentation Style; category Teaching | Complete quote, original wording                                                    |
| James Linton     | April 17-19 Testimonials for Brian.docx                            | April 17; Teaching / Skills / Presentation Style        | Complete quote, including original ellipses                                         |
| Steve Cunningham | January 21, 2026 (Day 1 of Summit Event) - Testimonials for Brian  | PRO Membership; category PRO/Revven                     | Complete quote; describes an app Brian built, not a promised customer result        |
| Lynda Menge      | July 22-24, 2026                                                   | Day 2; Teaching Skills / Training Ability               | Complete quote, original wording                                                    |
| lisa bond        | April 17-19 Testimonials for Brian.docx                            | April 19; Teaching / Skills / Presentation Style        | Last two complete sentences, verbatim; original lowercase attribution retained      |
| Wendy Kazi       | February 19, 2026 (Day 1 of Summit Event) - Testimonials for Brian | Summit - teaching skills                                | Complete quote; attributed to an event attendee, not exclusively to Brian's session |

Lisa's full supplied quote is: “I have Brian's mindset now - I use to think I
wanted to create everything from scratch. Nah - technology is moving so fast.
I am the queen of leverage, modify, accentuate, customized. No longer want to
reinvent the wheel. I am able to move faster and still put my spin on things
and it is curated.” The homepage uses its last two sentences without changing
their meaning. No instructor's name was removed from a quoted sentence.

The Drive originals remain unchanged. Private source URLs and the unselected
transcripts are not included in browser configuration or public page markup.

## Updating the section

Edit `homepageTestimonials` in `src/config/presets/brian.ts`. Each item contains
`quote`, `attribution`, and an optional `context` label. Preserve the speaker's
words and meaning; add source context here when changing the selection.

The section renders only when the active preset supplies at least one item.
PushTen members start without these testimonials and should add their own
accurately attributed feedback to their own preset. Omit the block or use an
empty `items` array to hide it. This section is configured in the preset; it
does not add a testimonial editor to the admin panel.
