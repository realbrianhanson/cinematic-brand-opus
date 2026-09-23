import { readPresentation } from "./offerBuilder";

const DESCRIPTION_LIMIT = 160;

/** Collapse whitespace and cap at a word boundary with an ellipsis. */
export function capDescription(value: string, limit = DESCRIPTION_LIMIT) {
  const clean = value.replace(/\s+/g, " ").trim();
  if (clean.length <= limit) return clean;
  const cut = clean.slice(0, limit - 1);
  const space = cut.lastIndexOf(" ");
  const trimmed = space > limit / 2 ? cut.slice(0, space) : cut;
  return `${trimmed.replace(/[\s,;:.–—-]+$/, "")}…`;
}

/**
 * The browser title stays the product title so tabs, bookmarks and search
 * results name the product; the landing headline is marketing copy.
 */
export function offerSeoText(offer: {
  title: string;
  summary: string;
  presentation?: unknown;
}): { title: string; description: string } {
  const landing = readPresentation(offer.presentation)?.landing;
  return {
    title: offer.title.replace(/\s+/g, " ").trim(),
    description: capDescription(
      landing?.subheadline.trim() ? landing.subheadline : offer.summary,
    ),
  };
}
