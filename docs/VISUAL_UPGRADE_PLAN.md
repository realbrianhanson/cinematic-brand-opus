# Visual enrichment plan

Reviewed September 20, 2026. This document proposes image work; the current release only improves testimonial selection. The existing homepage video and the supplied PushTen cover remain in place.

## Highest-value additions

| Priority | Page / placement                                                    | Visual                                                                                                                                                                                                  | Available material and next step                                                                                                                                                             |
| -------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1        | PushTen, after “A starting point you can build on”                  | Three-panel “Inside the library”: actual template library, one finished example, and its customization view. Use consistent browser/device framing and restrained gold accents.                         | Current launch cover is available. Real product screenshots are not checked into this repo; capture from the product before designing the gallery.                                           |
| 2        | App Building Workshop, beneath the introduction and process section | Brian teaching plus an actual starting-template → finished-site comparison.                                                                                                                             | Current cover is an abstract app-building illustration. Use a genuine recording frame and an actual workshop example for the proof images.                                                   |
| 3        | AI Follow-Up Starter Kit, before “What is inside”                   | Readable previews of the input worksheet, a prompt, and the checklist, with an accessible larger view. Carry one useful preview into Start Here.                                                        | Actual source already exists: `output/pdf/AI-Follow-Up-Starter-Kit.pdf`. Render these pages accurately; AI can support the surrounding art direction.                                        |
| 4        | Homepage Summit section                                             | An authentic frame of Brian teaching online alongside a real demonstration.                                                                                                                             | The configured image slot is currently empty. Use online-session material matching the free three-day Summit.                                                                                |
| 5        | Speaking and homepage speaking invitation                           | A wide photograph or frame from Brian’s actual event footage, with a relevant context caption when confirmed.                                                                                           | `public/videos/hero-bg.mp4` and its poster exist. Keep the video unchanged. The unused `src/assets/event-crowd.jpg` needs source/context confirmation before being presented as event proof. |
| 6        | About/story and blog author identity                                | A warmer, eyes-visible portrait and a real work sample that supports “I build what I teach.”                                                                                                            | Current About/story and Speaking reuse the same stylized sunglasses portrait. Obtain an alternate authentic portrait and real product screen for a different visual purpose.                 |
| 7        | Blog index and article interiors                                    | A deliberate mix of editorial illustrations, cinematic object compositions, authentic tool screenshots, Brian-led visuals, and explanatory diagrams. Choose the medium that helps the specific article. | Recent covers in `public/editorial` are diagrams. Keep useful diagrams inside articles and use selective image generation for more varied covers.                                            |

Each important landing page should have a recognizable lead image, at least one concrete view of what the visitor receives, and relevant human evidence. Keep titles and key details readable on phones. Generate high-resolution masters, then deliver compressed, responsive website assets. Avoid embedding essential small copy into decorative covers.

## Image model and workflow

Official OpenAI documentation currently lists **GPT Image 2.5 Sunburst** as its most capable image generation/editing model, emphasizing editing precision. It is a strong choice for precise, reference-led product compositions and polished campaign artwork. Flare is positioned for faster everyday image generation. These are model recommendations, not a claim that the existing website uses them.

Sources:

- [GPT Image 2.5 Sunburst](https://developers.openai.com/api/docs/models/gpt-image-2.5-sunburst)
- [OpenAI image generation guide](https://developers.openai.com/api/docs/guides/image-generation)

For premium art, define the visual purpose first, supply the relevant real reference assets, choose a distinct composition, generate several candidates where worthwhile, and select on fidelity/readability/brand fit. The model name alone does not establish that an image is effective.

Real product screens, PDF contents, customer identities, and historical event context should remain accurate. Generated illustration can supply backgrounds, framing, abstract concepts, and campaign treatments without turning a promotional composition into supposed evidence.

## Current automatic generation setup

The blog image pipeline currently uses `google/gemini-3.1-flash-image-preview` in `supabase/functions/_shared/models.ts`. It runs through the Lovable gateway, rotates composition families, and performs a visual review. There is no provider/model selector or direct OpenAI image adapter. GPT Image 2.5 therefore requires a deliberate integration and backend deployment before it can be used automatically; gateway support is not assumed.

Blog and offer editors already accept manually prepared images. That allows selected premium artwork to be added without changing the automatic generation provider.

Proposed automation improvements:

- Add an explicit provider/model setting and a separate premium quality option.
- Retain the current reference/variety and visual-review checks.
- Review candidates against actual recent covers and the article's subject; regenerate or select a different candidate when it is repetitive or weak.
- Give resource-page image generation the same quality review as blog images.
- Treat product screenshots and customer proof as supplied assets, not invented generation targets.

Offer pages currently support one cover plus text/lists/quotes. A reusable gallery with upload, ordering, captions, alt text, and mobile previews is the appropriate small addition for richer product pages. It should belong to each offer's data and remain usable by member sites.
