# Free summit copy and registration

Brian confirmed the free three-day event's registration page on September 19,
2026: https://go.aiforbusiness.com/summit?_go=brian60.

The homepage event section summarizes that page's agenda:

- Day 1: AI basics, tools, and prompting.
- Day 2: AI for marketing, sales, lead generation, and social media.
- Day 3: Writing, selling, and prospect follow-up in the attendee's brand voice.

The old generic agenda and 90-day implementation-roadmap promise were removed.
The section promotes a live online summit, so it no longer uses the in-person
crowd photograph. Brian's separate hero video remains unchanged.

Registration dates belong on the registration page; the homepage does not
hardcode a date or invent a future session. The supplied page showed September
16–18 when reviewed on September 19.

## Link configuration

`freeSummitUrl` in the Brian preset supplies the navigation, hero, event, and
newsletter buttons. The public article/resource CTA also reads `site_settings`:

- `cta_url`: the confirmed tracked URL above.
- `cta_headline`: Free 3-Day AI for Business Summit.
- `cta_subtext`: Join the live online summit to explore AI tools, marketing,
  sales, content, and lead generation—even if you are starting from scratch.
- `cta_button_text`: Reserve Your Free 3-Day Pass.
- `cta_social_proof`: Live online · Interactive · Free to attend.

These public settings were updated on Brian's owner record. No `site_branding`
override existed at the time. If an owner branding override is added later,
keep its `offerUrl` and `offerLabel` aligned with the confirmed event.

Generated article autolinks accept this exact summit destination as well as
the legacy event domain. They must not attach Brian's summit language to an
unrelated member offer or a different event path. Preserve `_go=brian60` when
adding UTM parameters. Deploy every edge function importing the shared
`eventLink.ts` helper after changing that helper.
