# Legacy website entrances

The server handles reviewed GET/HEAD aliases before rendering the app. Each sends
a permanent 308 redirect and preserves the query string for campaign attribution.

| Former entrance                                | Current destination | Rationale                                                                                                          |
| ---------------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `/my-story` (with optional trailing slash)     | `/#story`           | Brian's current biography and business story.                                                                      |
| `/case-studies` (with optional trailing slash) | `/#testimonials`    | Current attributed customer/community feedback. This is not a restoration of the previous individual case studies. |

These mappings apply only to `brianhanson.com`, `www.brianhanson.com`, and this
project's exact Lovable preview host. They do not apply to member remixes.
Destination URLs are a fixed allowlist; query parameters cannot select a redirect.
POST and other write requests pass through unchanged.

## Still requiring an equivalent or original material

`/social-media`, individual historic case-study pages, and WordPress attachment
paths such as `/click-funnel/logo-4` remain unmapped. Do not send every missing
page to the homepage. Recover the original material or confirm a specific useful
replacement before extending the map; otherwise preserve the normal not-found
response. A 410 should require confirmation that an asset is intentionally retired.

Use search-console/backlink records and qualified landing-page traffic to
prioritize further recovery. The initial list comes from the September 2026
entrance audit; it is intentionally not an exhaustive URL inventory.
