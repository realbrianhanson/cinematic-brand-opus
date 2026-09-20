export type OfferBodyBlock =
  | { type: "heading"; text: string }
  | { type: "paragraph"; text: string }
  | { type: "list"; items: string[] }
  | { type: "image"; src: string; alt: string; caption?: string }
  | { type: "quote"; paragraphs: string[]; attribution?: string };

/** Pure validation shared by the narrow body format and the admin insert helper. */
export function safeOfferImageUrl(raw: string): string | null {
  if (
    !raw ||
    raw.length > 2048 ||
    !/^https:\/\/[^/?#]+/i.test(raw) ||
    /[\s\p{Cc}\\]/u.test(raw)
  )
    return null;
  try {
    const url = new URL(raw);
    if (
      url.protocol !== "https:" ||
      !url.hostname ||
      url.username ||
      url.password
    )
      return null;
    return url.href.length <= 2048 ? url.href : null;
  } catch {
    return null;
  }
}

/** A small text format: no HTML or arbitrary Markdown links are interpreted. */
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
    const image =
      /^!\[([^\u005b\u005d\p{Cc}]+)\]\(([^()\s"\\]+)(?:[ \t]+"([^"\p{Cc}]*)")?\)$/u.exec(
        line.trim(),
      );
    const src = image ? safeOfferImageUrl(image[2]) : null;
    if (image && image[1].trim() && src) {
      flushParagraph();
      flushList();
      blocks.push({
        type: "image",
        src,
        alt: image[1].trim(),
        ...(image[3]?.trim() ? { caption: image[3].trim() } : {}),
      });
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
