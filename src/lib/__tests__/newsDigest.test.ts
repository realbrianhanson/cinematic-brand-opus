import { describe, expect, it } from "vitest";
import { parseNewsDigest } from "../../../supabase/functions/_shared/newsDigest";
const good = {
  title: "A useful new product for local businesses",
  url: "https://example.com/news",
  publisher: "Example",
  summary: "A factual description of the newly announced product.",
};
describe("news import integrity", () => {
  it("separates headlines from summaries and deduplicates URLs", () => {
    const items = parseNewsDigest(
      JSON.stringify({ items: [good, good] }),
      new Date("2026-09-17T00:00:00Z"),
    );
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe(good.title);
    expect(items[0].raw_excerpt).toBe(good.summary);
  });
  it("rejects citation lines, malformed JSON, metadata labels and unsafe links", () => {
    expect(parseNewsDigest("| Headline | URL | Publisher | Summary |")).toEqual(
      [],
    );
    for (const patch of [
      { title: "Publisher: Example Publishing Company" },
      { title: "| A headline | A publisher | Summary |" },
      { url: "javascript:alert(1)" },
      { summary: null },
    ]) {
      expect(
        parseNewsDigest(JSON.stringify({ items: [{ ...good, ...patch }] })),
      ).toEqual([]);
    }
  });
});
