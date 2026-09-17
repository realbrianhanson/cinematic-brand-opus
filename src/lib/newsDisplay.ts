import { decodeHTML } from "entities";
interface NewsText {
  title?: string | null;
  ai_title?: string | null;
  ai_summary?: string | null;
  raw_excerpt?: string | null;
  source_name?: string | null;
  url: string;
}
const clean = (value: string) =>
  decodeHTML(value)
    .replace(/<[^>]*>/g, " ")
    .replace(/\*\*|`/g, "")
    .replace(/\[\d+\]/g, "")
    .replace(/\s+/g, " ")
    .trim();
/** Repair display of historical feed formatting without modifying stored articles. */
export function newsDisplay(item: NewsText): {
  title: string;
  summary: string;
} {
  const raw = item.raw_excerpt?.trim() ?? "";
  const cells = raw.startsWith("|")
    ? raw.split("|").map(clean).filter(Boolean)
    : [];
  let title = clean(
    item.ai_title || (cells.length >= 3 ? cells[0] : item.title) || "",
  );
  let summary = clean(
    item.ai_summary || (cells.length >= 3 ? cells[cells.length - 1] : raw),
  );
  // Earlier imports stored entire bullet rows as headlines. Preserve their headline only.
  title = title
    .replace(/^[-•]\s*/, "")
    .split(/\s+—\s+/)[0]
    .trim();
  if (
    !title ||
    /^(?:publisher|url(?:\s*\([^)]*\))?|source url)\s*:?$/i.test(title) ||
    /^(?:publisher|source url)\s*:/i.test(title)
  ) {
    let source = item.source_name || "the source";
    try {
      source = new URL(item.url).hostname.replace(/^www\./, "");
    } catch {
      /* Use the configured source name. */
    }
    title = `Source update from ${source}`;
    summary = "Read the original report for details.";
  }
  return { title, summary };
}
