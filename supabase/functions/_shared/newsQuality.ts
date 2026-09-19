/** Shared, deterministic news checks. They never rewrite source facts. */
export interface NewsCandidate {
  id?: string;
  url: string;
  title?: string | null;
  ai_title?: string | null;
  raw_excerpt?: string | null;
  ai_summary?: string | null;
  source_name?: string | null;
  topic_lane?: string | null;
}

/** Identity only: keep the original destination intact when displaying a report. */
export function newsUrlIdentity(value: string): string {
  try {
    const url = new URL(value);
    if (!/^https?:$/.test(url.protocol)) return "";
    url.hash = "";
    url.hostname = url.hostname.replace(/^www\./, "");
    for (const key of [...url.searchParams.keys()]) {
      if (/^(?:utm_.+|fbclid|gclid|mc_cid|mc_eid|link_source|amp)$/i.test(key))
        url.searchParams.delete(key);
    }
    url.searchParams.sort();
    // Common AMP variants; do not remove substantive query parameters or IDs.
    const path = url.pathname
      .replace(/\/amp(?=\/|$)/g, "")
      .replace(/\/amp-([\d]+\.html)$/, "/$1")
      .replace(/\/$/, "");
    return `${url.host}${path}${url.search}`;
  } catch {
    return "";
  }
}

export function newsHeadlineIdentity(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/&#(?:8216|8217|39);|&(?:apos|#39);/g, "'")
    .replace(/&#(?:8211|8212);|&(?:ndash|mdash);/g, " ")
    .replace(/[’']/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** Catches clearly non-English/import-format headlines, not a translation model. */
export function isReadableNewsHeadline(value: string): boolean {
  const letters = value.match(/\p{L}/gu) ?? [];
  const latin = value.match(/\p{Script=Latin}/gu) ?? [];
  return (
    value.trim().length >= 15 &&
    letters.length > 0 &&
    latin.length / letters.length >= 0.9 &&
    !/^\s*(?:publisher|source|url|headline)\s*[:|]|\|.*\||https?:\/\//i.test(
      value,
    )
  );
}

/** Missing language evidence can hold a new automated import for review. It
 * must never suppress an editor-approved/public headline on its own. */
export function newsImportNeedsLanguageReview(value: string): boolean {
  if (!isReadableNewsHeadline(value)) return true;
  return !/\b(?:a|an|the|and|or|for|to|of|with|without|in|on|at|is|are|was|were|as|by|from|into|new|now|launch(?:es|ed)?|release(?:s|d)?|introduce(?:s|d)?|announce(?:s|d)?|unveil(?:s|ed)?|adds?|brings?|expands?|updates?|builds?|helps?|grows?|says?|reports?|reveals?|changes?|tools?|business(?:es)?|customers?|sales|marketing|search|training|learning|funding|research|study)\b/i.test(
    value,
  );
}

export const BUSINESS_NEWS_LANES = new Set([
  "ai_tools",
  "smb_marketing",
  "ai_training",
  "industry",
  "sales",
]);

/** An explicit use case is required for automatically collected business news. */
export function hasBusinessUseCase(title: string, summary: string): boolean {
  return /\b(?:small[ -]business(?:es)?|smbs?|entrepreneurs?|freelancers?|marketing|marketers?|sales|seo|search visibility|lead generation|conversion(?:s| rates?)?|customers?|clients?|crm|workflows?|productivity|scheduling|dispatch|bookkeeping|invoicing|e[ -]?commerce|retailers?|merchants?|contractors?|local retail|real estate|law firms?|dentists?|plumbers?|roofers?|med spas?|customer support|business owners?|business operations|business automation)\b/i.test(
    `${title} ${summary}`,
  );
}

export function isAggregatorSource(name: string | null | undefined): boolean {
  return /perplexity|daily digest|hacker\s?news|reddit/i.test(name ?? "");
}

export function newsFeedIssue(item: NewsCandidate): string | null {
  const title = item.ai_title || item.title || "";
  if (!isReadableNewsHeadline(title))
    return "Review the headline language and formatting.";
  if (
    isAggregatorSource(item.source_name) &&
    BUSINESS_NEWS_LANES.has(item.topic_lane ?? "") &&
    !hasBusinessUseCase(title, item.ai_summary || item.raw_excerpt || "")
  )
    return "Add only reports with a clear, source-supported use for business owners.";
  return null;
}

/** Keep the first occurrence in the caller's stable date/id order. */
export function uniqueNewsItems<T extends NewsCandidate>(
  items: readonly T[],
): T[] {
  const ids = new Set<string>();
  const urls = new Set<string>();
  const titles = new Set<string>();
  return items.filter((item) => {
    const url = newsUrlIdentity(item.url);
    // Use both source and edited headline, so edited copies cannot reappear.
    const keys = [item.title, item.ai_title]
      .filter((title): title is string => !!title)
      .map(newsHeadlineIdentity)
      .filter((key) => key.length >= 15);
    if (
      (item.id && ids.has(item.id)) ||
      (url && urls.has(url)) ||
      keys.some((key) => titles.has(key))
    )
      return false;
    if (item.id) ids.add(item.id);
    if (url) urls.add(url);
    for (const key of keys) titles.add(key);
    return true;
  });
}

/** A URL host is verified by the stored link; an aggregator's label is not its publisher. */
export function newsSourceLabel(
  item: Pick<NewsCandidate, "url" | "source_name">,
): string {
  try {
    const url = new URL(item.url);
    if (/^https?:$/.test(url.protocol))
      return url.hostname.replace(/^www\./, "");
  } catch {
    /* Fall back to a non-aggregator label only. */
  }
  return item.source_name && !isAggregatorSource(item.source_name)
    ? item.source_name
    : "Original source";
}
