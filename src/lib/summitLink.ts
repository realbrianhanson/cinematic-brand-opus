/**
 * Summit link tagging.
 *
 * Every link to the free AI for Business Summit carries the same UTM set plus
 * a `utm_content` value naming where on the site it was clicked. Existing
 * parameters (for example the `_go=brian60` affiliate code) are preserved.
 * Links to anything other than the Summit pass through unchanged.
 */

export const SUMMIT_HOST = "go.aiforbusiness.com";
export const SUMMIT_PATH = "/summit";

export const SUMMIT_PLACEMENTS = [
  "hero",
  "nav",
  "event",
  "article-mid",
  "article-end",
  "footer",
  "sticky",
  "about",
  "start-here",
  "expertise",
] as const;

export type SummitPlacement = (typeof SUMMIT_PLACEMENTS)[number];

export const SUMMIT_UTM = {
  utm_source: "brianhanson.com",
  utm_medium: "site",
  utm_campaign: "summit",
} as const;

function parse(href: string): URL | null {
  try {
    return new URL(href);
  } catch {
    return null;
  }
}

/** True only for the canonical https Summit registration page. */
export function isSummitUrl(href: string | null | undefined): boolean {
  if (!href) return false;
  const url = parse(href);
  if (!url) return false;
  return (
    url.protocol === "https:" &&
    url.hostname === SUMMIT_HOST &&
    url.port === "" &&
    url.username === "" &&
    url.password === "" &&
    url.pathname === SUMMIT_PATH
  );
}

/**
 * Returns the Summit link tagged for `placement`. Calling it again with a
 * different placement re-tags the link, so config values can be tagged once
 * and refined where they render. Non-Summit links are returned untouched.
 */
export function summitHref(href: string, placement: SummitPlacement): string {
  if (!isSummitUrl(href)) return href;
  const url = new URL(href);
  for (const [key, value] of Object.entries(SUMMIT_UTM)) {
    url.searchParams.set(key, value);
  }
  url.searchParams.set("utm_content", placement);
  return url.toString();
}

const decodeAttr = (value: string) =>
  value.replace(/&amp;/g, "&").replace(/&#38;/g, "&");
const encodeAttr = (value: string) => value.replace(/&/g, "&amp;");

/**
 * Tags Summit links inside sanitized article HTML (for example the ones the
 * content pipeline adds to "AI for Business Summit" mentions). Other links and
 * all other markup are left exactly as they were.
 */
export function tagSummitLinksInHtml(
  html: string,
  placement: SummitPlacement,
): string {
  return html.replace(
    /(<a\b[^>]*?\bhref\s*=\s*)(["'])([^"']*)\2/gi,
    (full, prefix: string, quote: string, raw: string) => {
      const href = decodeAttr(raw);
      if (!isSummitUrl(href)) return full;
      return `${prefix}${quote}${encodeAttr(summitHref(href, placement))}${quote}`;
    },
  );
}
