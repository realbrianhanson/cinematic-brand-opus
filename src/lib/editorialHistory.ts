import { z } from "zod";
export type EditorialKind = "resource" | "guide";
export const asEditorialRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const common = z.object({
  id: z.string(),
  title: z.string(),
  seo_meta: z.record(z.unknown()).nullable(),
});
/** Only title, body and full SEO enter working state; identity and authority fields never do. */
export function readEditorialRevision(
  kind: EditorialKind,
  documentId: string,
  value: unknown,
) {
  const result = (
    kind === "guide"
      ? common.extend({ content: z.string() })
      : common.extend({ content_json: z.record(z.unknown()) })
  ).safeParse(value);
  if (!result.success || result.data.id !== documentId) return null;
  const row = result.data;
  return {
    title: row.title,
    seoMeta: row.seo_meta ?? {},
    content: "content" in row ? row.content : row.content_json,
  };
}

export function editorialSources(snapshot: unknown): string[] {
  const row = asEditorialRecord(snapshot);
  const arrays = [
    asEditorialRecord(row.seo_meta).sources,
    asEditorialRecord(row.content_json).sources,
  ];
  const found = new Set<string>();
  for (const list of arrays) {
    if (!Array.isArray(list)) continue;
    for (const source of list) {
      const raw =
        typeof source === "string" ? source : asEditorialRecord(source).url;
      if (typeof raw !== "string") continue;
      try {
        const url = new URL(raw);
        if (
          ["https:", "http:"].includes(url.protocol) &&
          !url.username &&
          !url.password
        )
          found.add(url.href);
      } catch {
        /* Invalid references are not links. */
      }
    }
  }
  return [...found].slice(0, 20);
}

export function editorialComparisonText(value: unknown) {
  const row = asEditorialRecord(value);
  return `Title: ${typeof row.title === "string" ? row.title : ""}\n\nContent:\n${typeof row.content === "string" ? row.content : JSON.stringify(row.content_json ?? {}, null, 2)}\n\nSEO and source metadata:\n${JSON.stringify(row.seo_meta ?? {}, null, 2)}`;
}
