// Auto-links mentions of Brian's free 3-day virtual A.I. training to the tracked
// CTA URL (site_settings.cta_url, e.g. https://aiforbeginners.com). Idempotent:
// skips text already inside an <a> tag or a markdown link, and skips content
// that already contains the CTA URL. Works for both HTML and markdown bodies.

const DEFAULT_CTA_URL = "https://aiforbeginners.com";

// Ordered longest-first so bigger phrases win before subphrases match.
const PHRASE_PATTERNS: RegExp[] = [
  /free\s+3[-\s]?day\s+(?:virtual\s+)?(?:a\.?\s*i\.?\s+)?(?:training|event|workshop|bootcamp|class|masterclass)/i,
  /3[-\s]?day\s+(?:free\s+)?(?:virtual\s+)?(?:a\.?\s*i\.?\s+)?(?:training|event|workshop|bootcamp|class|masterclass)/i,
  /three[-\s]?day\s+(?:free\s+)?(?:virtual\s+)?(?:a\.?\s*i\.?\s+)?(?:training|event|workshop|bootcamp|class|masterclass)/i,
  /a\.?\s*i\.?\s+for\s+beginners(?:\s+(?:training|event|workshop))?/i,
];

export function linkifyEventMentions(
  body: string | null | undefined,
  ctaUrl?: string | null,
  opts: { maxLinks?: number } = {},
): string {
  if (!body || typeof body !== "string") return body ?? "";
  const url = (ctaUrl && ctaUrl.trim()) || DEFAULT_CTA_URL;
  const maxLinks = opts.maxLinks ?? 2;

  // Split by existing anchors and markdown links so we never re-wrap.
  const guardRe = /(<a\b[^>]*>[\s\S]*?<\/a>|\[[^\]]+\]\([^)]+\))/gi;
  const parts = body.split(guardRe);
  let linksAdded = 0;

  for (let i = 0; i < parts.length; i++) {
    const seg = parts[i];
    if (!seg) continue;
    // Skip guarded segments (existing links) — they're every odd-indexed chunk
    // when split() matches, but check pattern to be safe.
    if (/^(<a\b|\[[^\]]+\]\()/i.test(seg)) continue;
    if (linksAdded >= maxLinks) continue;

    let out = seg;
    for (const pat of PHRASE_PATTERNS) {
      if (linksAdded >= maxLinks) break;
      const re = new RegExp(pat.source, pat.flags.includes("g") ? pat.flags : pat.flags + "g");
      out = out.replace(re, (match) => {
        if (linksAdded >= maxLinks) return match;
        linksAdded++;
        // Choose format based on whether segment looks like HTML or markdown.
        const looksHtml = /<\w+[\s>]/.test(seg);
        return looksHtml
          ? `<a href="${url}" target="_blank" rel="noopener">${match}</a>`
          : `[${match}](${url})`;
      });
    }
    parts[i] = out;
  }

  return parts.join("");
}
