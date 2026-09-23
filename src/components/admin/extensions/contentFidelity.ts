import type { Editor } from "@tiptap/core";

/**
 * Content-fidelity helpers for the article editor.
 *
 * ProseMirror silently drops or flattens any markup its schema cannot
 * represent. These helpers let callers (a) serialize the editor into the HTML
 * shape we publish, and (b) detect when loading a body into the editor would
 * lose structure, so the caller can refuse to overwrite the stored HTML.
 */

/**
 * Tags whose count may legitimately change on a round-trip: formatting the
 * editor renames (b -> strong, i -> em), wrappers it collapses, and table
 * plumbing it regenerates. Everything else is counted.
 */
const IGNORED_TAGS = new Set([
  "html",
  "head",
  "body",
  "p",
  "br",
  "wbr",
  "span",
  "b",
  "strong",
  "i",
  "em",
  "s",
  "strike",
  "del",
  "u",
  "thead",
  "tbody",
  "tfoot",
  "colgroup",
  "col",
  "source",
  // Unclassed divs carry no meaning; classed ones are counted as "div.class".
  "div",
]);

const CLASSED_DIV = "div.class";

export interface DroppedElement {
  tag: string;
  before: number;
  after: number;
}

function parseBody(html: string): HTMLElement {
  return new DOMParser().parseFromString(html, "text/html").body;
}

function countTags(html: string): Map<string, number> {
  const counts = new Map<string, number>();
  const bump = (key: string) => counts.set(key, (counts.get(key) ?? 0) + 1);
  for (const el of parseBody(html).querySelectorAll("*")) {
    const tag = el.tagName.toLowerCase();
    if (tag === "div" && el.getAttribute("class")?.trim()) bump(CLASSED_DIV);
    if (!IGNORED_TAGS.has(tag)) bump(tag);
  }
  return counts;
}

/**
 * Compare the source HTML with what the editor produced. Returns every tag
 * that appears fewer times in the output than in the source.
 */
export function findDroppedElements(
  source: string,
  output: string,
): DroppedElement[] {
  if (!source.trim()) return [];
  const before = countTags(source);
  const after = countTags(output);
  const dropped: DroppedElement[] = [];
  for (const [tag, count] of before) {
    const kept = after.get(tag) ?? 0;
    if (kept < count) dropped.push({ tag, before: count, after: kept });
  }
  return dropped;
}

/** Human-readable list, e.g. "<table> (1 of 1 lost), <sup> (2 of 3 lost)". */
export function describeDroppedElements(dropped: DroppedElement[]): string {
  return dropped
    .map(({ tag, before, after }) => {
      const label = tag === CLASSED_DIV ? "<div class>" : `<${tag}>`;
      return `${label} (${before - after} of ${before} lost)`;
    })
    .join(", ");
}

function isHeaderRow(row: Element): boolean {
  const cells = [...row.children];
  return (
    cells.length > 0 && cells.every((c) => c.tagName.toLowerCase() === "th")
  );
}

/** Tiptap renders every row inside <tbody>; restore a <thead> for header rows. */
function restoreTableHead(table: Element) {
  if (table.querySelector(":scope > thead")) return;
  const body = table.querySelector(":scope > tbody");
  if (!body) return;
  const headerRows: Element[] = [];
  for (const row of body.children) {
    if (row.tagName.toLowerCase() !== "tr" || !isHeaderRow(row)) break;
    headerRows.push(row);
  }
  // A table made only of header cells keeps them in the body.
  if (!headerRows.length || headerRows.length === body.children.length) return;
  const head = table.ownerDocument.createElement("thead");
  for (const row of headerRows) head.appendChild(row);
  table.insertBefore(head, body);
}

/** Tiptap wraps cell text in <p>; unwrap single plain paragraphs. */
function unwrapCellParagraph(cell: Element) {
  const nodes = [...cell.childNodes].filter(
    (n) => !(n.nodeType === 3 && !n.textContent?.trim()),
  );
  const only = nodes[0];
  if (nodes.length !== 1 || !(only instanceof Element)) return;
  if (only.tagName.toLowerCase() !== "p" || only.attributes.length) return;
  cell.replaceChildren(...only.childNodes);
}

/**
 * Normalize editor HTML toward how articles are authored: header rows in a
 * <thead>, and table cells without paragraph wrappers. Idempotent, and a no-op
 * for HTML without tables.
 */
export function normalizeEditorHtml(html: string): string {
  if (!/<table[\s>]/i.test(html)) return html;
  const body = parseBody(html);
  body.querySelectorAll("table").forEach(restoreTableHead);
  body.querySelectorAll("th, td").forEach(unwrapCellParagraph);
  return body.innerHTML;
}

/** The HTML the editor should persist. */
export function serializeEditorHtml(editor: Editor): string {
  return normalizeEditorHtml(editor.getHTML());
}
