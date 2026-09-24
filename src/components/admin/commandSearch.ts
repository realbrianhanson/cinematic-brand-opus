/**
 * Strict ranking for the admin "Go to page" menu (Cmd+K).
 *
 * cmdk's default fuzzy scorer matches letters scattered across a label, and
 * v1.1.1 never reorders groups, so Enter could open the wrong page. This
 * ranks by whole-word prefixes and curated keywords only; anything weaker
 * scores 0 and is hidden.
 */

/** Synonyms and page headings people type for each destination. */
export const ADMIN_ROUTE_KEYWORDS: Readonly<Record<string, readonly string[]>> =
  {
    "/admin": ["dashboard", "home", "overview", "next move"],
    "/admin/queue": [
      "automation",
      "cron",
      "schedule",
      "jobs",
      "signals",
      "pipeline",
    ],
    "/admin/conversions": [
      "leads",
      "signups",
      "subscribers",
      "analytics",
      "funnel",
    ],
    "/admin/offers": ["products", "store", "stripe", "downloads", "shop"],
    "/admin/inquiries": ["speaking", "booking", "events", "keynote"],
    "/admin/audience": ["newsletter", "subscribers", "email list", "audience"],
    "/admin/pseo-dashboard": [
      "seo",
      "pseo",
      "google",
      "rankings",
      "search console",
      "performance",
    ],
    "/admin/posts": ["posts", "blog", "articles"],
    "/admin/pages": ["pages", "generated pages", "resources"],
    "/admin/pillars": ["pillar", "pillars", "pillar pages", "guides"],
    "/admin/generate": ["ai", "write", "generate content", "drafts"],
    "/admin/library": ["images", "uploads", "media", "photos", "videos"],
    "/admin/setup": ["onboarding", "setup", "getting started"],
    "/admin/site-settings": [
      "site config",
      "settings",
      "newsletter",
      "email",
      "brand",
      "branding",
      "social",
      "sitemap",
      "indexnow",
    ],
    "/admin/settings": ["password", "login", "security", "account", "sign out"],
    "/admin/niches": ["niche", "niches", "audience", "taxonomy"],
    "/admin/content-types": ["content types", "templates", "formats"],
    "/admin/categories": ["tags", "category"],
    "/admin/widgets": ["sidebar", "blocks", "footer"],
    "/admin/posts/new": ["write", "post", "blog", "create article"],
    "/admin/offers/new": ["product", "sell", "create offer", "download"],
  };

export type CommandEntry = {
  to: string;
  label: string;
  group: string;
};

const normalize = (text: string) =>
  text
    .toLowerCase()
    .replace(/&/g, " ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const words = (text: string) => normalize(text).split(" ").filter(Boolean);

/** Score one entry for a query: 0 means "do not show". */
export function scoreCommand(
  entry: Pick<CommandEntry, "to" | "label">,
  rawQuery: string,
): number {
  const query = normalize(rawQuery);
  if (!query) return 1;
  const label = normalize(entry.label);
  const labelWords = words(entry.label);
  const keywords = (ADMIN_ROUTE_KEYWORDS[entry.to] ?? []).map(normalize);
  const keywordWords = keywords.flatMap((keyword) => keyword.split(" "));

  if (label === query) return 100;
  if (label.startsWith(query)) return 90;
  if (labelWords.some((word) => word.startsWith(query))) return 80;
  if (keywords.includes(query)) return 75;
  if (keywords.some((keyword) => keyword.startsWith(query))) return 70;
  const tokens = query.split(" ");
  const vocabulary = [...labelWords, ...keywordWords];
  if (
    tokens.length > 1 &&
    tokens.every((token) => vocabulary.some((word) => word.startsWith(token)))
  )
    return 60;
  return 0;
}

/** Matching entries, best first; ties keep their menu order. */
export function rankCommands<T extends CommandEntry>(
  entries: readonly T[],
  query: string,
): T[] {
  return entries
    .map((entry, index) => ({
      entry,
      index,
      score: scoreCommand(entry, query),
    }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((row) => row.entry);
}
