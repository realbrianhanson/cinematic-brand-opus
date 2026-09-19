export type OfferBodyBlock =
  | { type: "heading"; text: string }
  | { type: "paragraph"; text: string }
  | { type: "list"; items: string[] };

/** A small plain-text format: no HTML or arbitrary Markdown links are interpreted. */
export function offerBodyBlocks(body: string): OfferBodyBlock[] {
  const blocks: OfferBodyBlock[] = [];
  let paragraph: string[] = [];
  let items: string[] = [];
  const flushParagraph = () => {
    if (paragraph.length)
      blocks.push({ type: "paragraph", text: paragraph.join("\n") });
    paragraph = [];
  };
  const flushList = () => {
    if (items.length) blocks.push({ type: "list", items });
    items = [];
  };
  for (const line of body.replace(/\r\n?/g, "\n").split("\n")) {
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
  return blocks;
}
