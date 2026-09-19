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

describe("digest source dates and languages", () => {
  it("does not represent poll time as an unverified source publication time", () => {
    expect(
      parseNewsDigest(JSON.stringify({ items: [good] }))[0].published_at,
    ).toBeUndefined();
    expect(
      parseNewsDigest(
        JSON.stringify({
          items: [{ ...good, published_at: "2026-09-16T10:00:00Z" }],
        }),
        new Date("2026-09-17"),
      )[0].published_at,
    ).toBe("2026-09-16T10:00:00.000Z");
  });
  it("rejects future/invalid dates and clearly non-English headlines", () => {
    for (const patch of [
      { published_at: "bad date" },
      { published_at: "2099-01-01" },
      { title: "徐汇企业MiniMax多款产品纳入新加坡国民AI技能培训计划" },
    ]) {
      expect(
        parseNewsDigest(JSON.stringify({ items: [{ ...good, ...patch }] })),
      ).toEqual([]);
    }
  });
  it("deduplicates tracking variants and repeated headlines", () => {
    expect(
      parseNewsDigest(
        JSON.stringify({
          items: [
            good,
            { ...good, url: good.url + "?utm_source=one" },
            { ...good, url: "https://other.com/report" },
          ],
        }),
      ),
    ).toHaveLength(1);
  });
});
