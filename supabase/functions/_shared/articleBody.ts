/** Normalize sanitized article bodies without changing stored/editor content. */
export function normalizeArticleBody(
  html: string,
  pageTitle: string,
  decodeText: (value: string) => string,
): string {
  const plain = (value: string) =>
    decodeText(value.replace(/<[^>]+>/g, ""))
      .replace(/\s+/g, " ")
      .trim();
  const leading = /^\s*<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(html);
  if (leading && plain(leading[1]) === pageTitle.replace(/\s+/g, " ").trim()) {
    html = html.slice(leading[0].length);
  }
  // The surrounding page owns the sole H1. Preserve any other heading's text.
  return html.replace(/<(\/?)(h1)(?=[\s>])/gi, "<$1h2");
}
