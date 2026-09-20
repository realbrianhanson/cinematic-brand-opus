export type OfferBodyBlock =
  | { type: "heading"; text: string }
  | { type: "paragraph"; text: string }
  | { type: "list"; items: string[] }
  | { type: "quote"; paragraphs: string[]; attribution?: string };

/** A small plain-text format: no HTML or arbitrary Markdown links are interpreted. */
export function offerBodyBlocks(body: string): OfferBodyBlock[] {
  const blocks: OfferBodyBlock[] = [];
  let paragraph: string[] = [];
  let items: string[] = [];
  let quoteLines: string[] = [];
  const flushParagraph = () => {
    if (paragraph.length)
      blocks.push({ type: "paragraph", text: paragraph.join("\n") });
    paragraph = [];
  };
  const flushList = () => {
    if (items.length) blocks.push({ type: "list", items });
    items = [];
  };
  const flushQuote = () => {
    if (!quoteLines.length) return;
    const paragraphs: string[] = [];
    let lines: string[] = [];
    const flushLines = () => {
      if (lines.length) paragraphs.push(lines.join("\n"));
      lines = [];
    };
    for (const line of quoteLines) {
      if (!line.trim()) flushLines();
      else lines.push(line);
    }
    flushLines();
    quoteLines = [];
    if (!paragraphs.length) return;

    // Attribution is a separate final paragraph, never an inline em dash.
    const author = /^—[ \t]+([^\n]+)$/.exec(paragraphs[paragraphs.length - 1]);
    if (paragraphs.length > 1 && author?.[1].trim()) {
      paragraphs.pop();
      blocks.push({ type: "quote", paragraphs, attribution: author[1] });
    } else {
      blocks.push({ type: "quote", paragraphs });
    }
  };
  for (const line of body.replace(/\r\n?/g, "\n").split("\n")) {
    const quote = /^>(?:[ \t](.*))?$/.exec(line);
    if (quote) {
      flushParagraph();
      flushList();
      quoteLines.push(quote[1] ?? "");
      continue;
    }
    flushQuote();
    if (!line.trim()) {
      flushParagraph();
      flushList();
      continue;
    }
    const heading = /^##\s+(.+)$/.exec(line.trim());
    if (heading) {
      flushParagraph();
      flushList();
      blocks.push({ type: "heading", text: heading[1] });
      continue;
    }
    const item = /^-\s+(.+)$/.exec(line.trim());
    if (item) {
      flushParagraph();
      items.push(item[1]);
      continue;
    }
    flushList();
    paragraph.push(line);
  }
  flushParagraph();
  flushList();
  flushQuote();
  return blocks;
}
