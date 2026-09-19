import { describe, expect, it } from "vitest";
import { articleReading } from "../articleReading";

describe("article body heading ownership", () => {
  it("removes only a leading title duplicate after sanitizing and decoding", () => {
    const result = articleReading(
      " <h1>A &amp; <em>B</em>\nGuide</h1><h2>Start here</h2><p>Useful details.</p>",
      "A & B Guide",
    );
    expect(result.html).not.toMatch(/<h1\b/);
    expect(result.html).not.toContain("Guide");
    expect(result.headings).toEqual([
      { id: "article-section-1", title: "Start here", level: 2 },
    ]);
    expect(result.html).toContain("Useful details.");
  });
  it("preserves different and later body headings as sections", () => {
    const result = articleReading(
      "<h1>A useful introduction</h1><p>Details</p><h1>Page title</h1><h3>Next</h3>",
      "Page title",
    );
    expect(result.html).not.toMatch(/<\/?h1\b/);
    expect(result.headings.map((h) => h.title)).toEqual([
      "A useful introduction",
      "Page title",
      "Next",
    ]);
    expect(result.headings.map((h) => h.level)).toEqual([2, 2, 3]);
  });
  it("keeps the sanitizer boundary and does not turn escaped text into markup", () => {
    const result = articleReading(
      '<h1 onclick="bad()">Other title</h1><img src="x" onerror="bad()"><script>bad()</script><p>&lt;h1&gt;example&lt;/h1&gt;</p>',
      "Page title",
    );
    expect(result.html).not.toMatch(/<h1\b|onclick|onerror|<script/);
    expect(result.html).toContain("&lt;h1&gt;example&lt;/h1&gt;");
    expect(result.headings[0].title).toBe("Other title");
  });
});
