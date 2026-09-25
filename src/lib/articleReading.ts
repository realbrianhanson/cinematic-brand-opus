import { decodeHTML } from "entities";
import { safeHtml } from "./safeHtml";
import { normalizeArticleBody } from "../../supabase/functions/_shared/articleBody";
/** Build stable heading links from sanitized HTML, identically in SSR and browser. */
export function articleReading(content: string, pageTitle = "") {
  const headings: { id: string; title: string; level: number }[] = [];
  const normalized = normalizeArticleBody(
    safeHtml(content),
    pageTitle,
    decodeHTML,
  );
  const idPattern = /\s+id\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;
  const reservedIds = new Set(
    Array.from(normalized.matchAll(idPattern), (match) =>
      decodeHTML(match[1] ?? match[2] ?? match[3]),
    ),
  );
  const assignedIds = new Set<string>();
  const html = normalized.replace(
    /<(h[23])\b([^>]*)>([\s\S]*?)<\/\1>/gi,
    (_full, tag: string, attrs: string, inner: string) => {
      const authoredMatch = attrs.match(
        /\s+id\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i,
      );
      const authoredId = authoredMatch
        ? decodeHTML(authoredMatch[1] ?? authoredMatch[2] ?? authoredMatch[3])
        : "";
      let id = authoredId;
      if (!/^[A-Za-z][\w:.-]*$/.test(id) || assignedIds.has(id)) {
        let number = headings.length + 1;
        do {
          id = `article-section-${number++}`;
        } while (reservedIds.has(id) || assignedIds.has(id));
      }
      assignedIds.add(id);
      const title = decodeHTML(inner.replace(/<[^>]+>/g, ""))
        .replace(/\s+/g, " ")
        .trim();
      headings.push({ id, title, level: Number(tag[1]) });
      const cleanAttrs = attrs.replace(
        /\s+id\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi,
        "",
      );
      return `<${tag}${cleanAttrs} id="${id}">${inner}</${tag}>`;
    },
  );
  return { html, headings };
}
export function articleSources(
  value: unknown,
): { url: string; title: string }[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value
    .flatMap((row) => {
      if (!row || typeof row.url !== "string") return [];
      try {
        const url = new URL(row.url);
        if (!["https:", "http:"].includes(url.protocol) || seen.has(url.href))
          return [];
        seen.add(url.href);
        const title =
          typeof row.title === "string" &&
          row.title.length < 140 &&
          !/[|`]/.test(row.title)
            ? row.title
            : url.hostname.replace(/^www\./, "");
        return [{ url: url.href, title }];
      } catch {
        return [];
      }
    })
    .slice(0, 30);
}
