import { offerBodyBlocks } from "./offerBody";
import type { OfferSection } from "./offerBuilder";

/** Optional syntax; unstructured or mixed rich content keeps the legacy renderer. */
export function offerListLayout(
  body: string,
): { introduction: string; items: string[] } | null {
  const blocks = offerBodyBlocks(body);
  const list = blocks.at(-1);
  if (
    list?.type !== "list" ||
    blocks.slice(0, -1).some((block) => block.type !== "paragraph")
  )
    return null;
  return {
    introduction: blocks
      .slice(0, -1)
      .map((block) => (block.type === "paragraph" ? block.text : ""))
      .join("\n\n"),
    items: list.items,
  };
}

export function offerFaqLayout(
  body: string,
): { question: string; answer: string }[] | null {
  const lines = body.replace(/\r\n?/g, "\n").trim().split("\n");
  const items: { question: string; answer: string }[] = [];
  for (const line of lines) {
    const heading = /^##\s+(.+)$/.exec(line.trim());
    if (heading) items.push({ question: heading[1], answer: "" });
    else if (items.length) items[items.length - 1].answer += `${line}\n`;
    else if (line.trim()) return null;
  }
  return items.length && items.every((item) => item.answer.trim())
    ? items.map((item) => ({ ...item, answer: item.answer.trim() }))
    : null;
}

export function hasOfferSectionContent(section: OfferSection): boolean {
  if (section.type === "image" || section.type === "video")
    return Boolean(section.imageUrl.trim());
  return Boolean(section.body.trim());
}
