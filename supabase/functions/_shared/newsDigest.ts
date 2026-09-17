import { safeHref } from "./safeHref.ts";
export interface DigestItem {
  url: string;
  title: string;
  author?: string;
  raw_excerpt: string;
  published_at: string;
}
export const digestResponseFormat = {
  type: "json_schema",
  json_schema: {
    schema: {
      type: "object",
      properties: {
        items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              title: { type: "string" },
              url: { type: "string" },
              publisher: { type: "string" },
              summary: { type: "string" },
            },
            required: ["title", "url", "publisher", "summary"],
            additionalProperties: false,
          },
        },
      },
      required: ["items"],
      additionalProperties: false,
    },
  },
};
/** Unstructured prose/citation lines are not headlines. Reject rather than fabricate. */
export function parseNewsDigest(
  content: string,
  now = new Date(),
): DigestItem[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return [];
  }
  if (
    !parsed ||
    typeof parsed !== "object" ||
    !("items" in parsed) ||
    !Array.isArray(parsed.items)
  )
    return [];
  const result: DigestItem[] = [],
    seen = new Set<string>();
  for (const item of parsed.items) {
    if (!item || typeof item !== "object") continue;
    const { title, url, publisher, summary } = item;
    const href = safeHref(url);
    if (!href || !/^https?:\/\//.test(href) || seen.has(href)) continue;
    if (
      typeof title !== "string" ||
      typeof summary !== "string" ||
      typeof publisher !== "string"
    )
      continue;
    if (
      title.trim().length < 15 ||
      title.length > 300 ||
      summary.trim().length < 20 ||
      summary.length > 1500
    )
      continue;
    if (
      /^\s*(?:publisher|source|url|headline)\s*[:|]|\|.*\||https?:\/\//i.test(
        title,
      )
    )
      continue;
    seen.add(href);
    result.push({
      url: href,
      title: title.trim(),
      author: publisher.trim().slice(0, 200),
      raw_excerpt: summary.trim(),
      published_at: now.toISOString(),
    });
    if (result.length === 5) break;
  }
  return result;
}
