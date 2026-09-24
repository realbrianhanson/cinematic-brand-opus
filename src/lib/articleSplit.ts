/**
 * Splits sanitized article HTML at a top-level block boundary so a component
 * (for example an email signup card) can sit part-way through the article.
 *
 * Only boundaries between complete top-level elements qualify, and never
 * straight after a heading, so a card cannot separate a heading from its
 * section. Short articles are not split.
 */

const VOID_ELEMENTS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "source",
  "track",
  "wbr",
]);

const HEADING = /^h[1-6]$/;

/** Minimum complete top-level blocks before a split is worth making. */
export const MIN_BLOCKS_TO_SPLIT = 4;

interface Boundary {
  index: number;
  textBefore: number;
}

const textLength = (html: string) =>
  html
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim().length;

function topLevelBoundaries(html: string): Boundary[] {
  const boundaries: Boundary[] = [];
  const tag = /<!--[\s\S]*?-->|<\/?([a-zA-Z][a-zA-Z0-9-]*)\b[^>]*>/g;
  let depth = 0;
  let match: RegExpExecArray | null;
  while ((match = tag.exec(html))) {
    const [raw, rawName] = match;
    if (!rawName) continue; // comment
    const name = rawName.toLowerCase();
    const closing = raw.startsWith("</");
    const selfClosing = VOID_ELEMENTS.has(name) || raw.endsWith("/>");
    if (closing) depth = Math.max(0, depth - 1);
    else if (!selfClosing) depth += 1;
    const endsTopLevelBlock = depth === 0 && (closing || selfClosing);
    if (endsTopLevelBlock && !HEADING.test(name)) {
      const index = match.index + raw.length;
      boundaries.push({ index, textBefore: textLength(html.slice(0, index)) });
    }
  }
  return boundaries;
}

/**
 * Returns `[before, after]`. `after` is empty when the article is too short
 * or has no safe boundary; callers then skip the mid-article component.
 */
export function splitArticleHtml(
  html: string,
  fraction = 0.4,
): [string, string] {
  const boundaries = topLevelBoundaries(html);
  if (boundaries.length < MIN_BLOCKS_TO_SPLIT) return [html, ""];
  const total = textLength(html);
  if (total === 0) return [html, ""];
  const target = total * fraction;
  // Keep at least one block on each side.
  const candidates = boundaries.filter(
    (b) => b.index < html.length && html.slice(b.index).trim().length > 0,
  );
  if (!candidates.length) return [html, ""];
  const best = candidates.reduce((a, b) =>
    Math.abs(b.textBefore - target) < Math.abs(a.textBefore - target) ? b : a,
  );
  const before = html.slice(0, best.index);
  const after = html.slice(best.index);
  if (!textLength(before) || !textLength(after)) return [html, ""];
  return [before, after];
}
