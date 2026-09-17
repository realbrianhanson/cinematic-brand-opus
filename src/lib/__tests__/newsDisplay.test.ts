import { describe, expect, it } from "vitest";
import { newsDisplay } from "../newsDisplay";
describe("historical news text", () => {
  it("decodes RSS punctuation as text", () =>
    expect(
      newsDisplay({
        url: "https://example.com",
        title: "A &#8216;quoted&#8217; headline",
      }).title,
    ).toBe("A ‘quoted’ headline"));
  it("separates a stored table's title and summary", () =>
    expect(
      newsDisplay({
        url: "https://example.com",
        title: "| bad truncated row",
        raw_excerpt:
          "| **A useful headline** | https://example.com | Publisher | The factual summary. [2] |",
      }),
    ).toEqual({ title: "A useful headline", summary: "The factual summary." }));
  it("does not invent a missing historical headline", () =>
    expect(
      newsDisplay({
        url: "https://example.com/story",
        title: "Publisher:** Example publishing",
      }).title,
    ).toBe("Source update from example.com"));
});
