// Auto-links mentions of the confirmed free event to its configured, tracked
// CTA URL. Existing links and bodies already containing that URL are unchanged.
// Supports the Summit destination and the legacy AI for Beginners domain.

import { safeHref } from "./safeHref.ts";

// Ordered longest-first so bigger phrases win before subphrases match.
const PHRASE_PATTERNS: RegExp[] = [
  /free\s+3[-\s]?day\s+(?:virtual\s+)?(?:a\.?\s*i\.?\s+)?(?:training|event|summit|workshop|bootcamp|class|masterclass)/i,
  /3[-\s]?day\s+(?:free\s+)?(?:virtual\s+)?(?:a\.?\s*i\.?\s+)?(?:training|event|summit|workshop|bootcamp|class|masterclass)/i,
  /three[-\s]?day\s+(?:free\s+)?(?:virtual\s+)?(?:a\.?\s*i\.?\s+)?(?:training|event|summit|workshop|bootcamp|class|masterclass)/i,
  /a\.?\s*i\.?\s+for\s+business\s+summit/i,
  /a\.?\s*i\.?\s+for\s+beginners(?:\s+(?:training|event|workshop))?/i,
];

export function linkifyEventMentions(
  body: string | null | undefined,
  ctaUrl?: string | null,
  opts: { maxLinks?: number } = {},
): string {
  if (!body || typeof body !== "string") return body ?? "";
  const url = safeHref(ctaUrl);
  if (!url) return body;
  // These phrases describe this event, not Core or an unrelated member offer.
  try {
    const parsed = new URL(url);
    if (parsed.username || parsed.password) return body;
    const legacy =
      parsed.hostname.replace(/^www\./, "") === "aiforbeginners.com";
    const summit =
      parsed.origin === "https://go.aiforbusiness.com" &&
      parsed.pathname === "/summit";
    if (!legacy && !summit) return body;
  } catch {
    return body;
  }
  const htmlUrl = url.replace(/&/g, "&amp;");
  if (body.includes(url) || body.includes(htmlUrl)) return body;
  const maxLinks = opts.maxLinks ?? 2;
  const looksHtml = /<\/?\w+[\s>]/.test(body);
  // A single replacement pass prevents overlapping phrases nesting new links.
  const phrases = new RegExp(
    `\\b(?:${PHRASE_PATTERNS.map((pattern) => pattern.source).join("|")})\\b`,
    "gi",
  );

  // Guard existing links and HTML tags so attributes are never rewritten.
  const guardRe =
    /(<a\b(?:[^"'<>]|"[^"]*"|'[^']*')*>[\s\S]*?<\/a\s*>|\[[^\]]+\]\([^)]+\)|<(?:[^"'<>]|"[^"]*"|'[^']*')*>)/gi;
  const parts = body.split(guardRe);
  let linksAdded = 0;

  for (let i = 0; i < parts.length; i++) {
    const seg = parts[i];
    if (!seg || i % 2 === 1) continue;
    if (linksAdded >= maxLinks) continue;

    parts[i] = seg.replace(phrases, (match, ...args) => {
      if (linksAdded >= maxLinks) return match;
      // args: [...groups, offset, string]
      const offset = args[args.length - 2] as number;
      const full = args[args.length - 1] as string;
      const before = full.slice(0, offset);
      const after = full.slice(offset + match.length);
      // Skip if the match sits inside a markdown link already:
      // - text immediately after is `](` (we're the label of a link)
      // - an unbalanced `[` appears before with a matching `](...)` after
      if (/^\s*\]\(/.test(after)) return match;
      const lastOpen = before.lastIndexOf("[");
      const lastClose = before.lastIndexOf("]");
      if (lastOpen > lastClose && /^[^[]*\]\([^)]*\)/.test(after)) return match;
      linksAdded++;
      return looksHtml
        ? `<a href="${htmlUrl}" target="_blank" rel="noopener">${match}</a>`
        : `[${match}](${url})`;
    });
  }

  return parts.join("");
}
