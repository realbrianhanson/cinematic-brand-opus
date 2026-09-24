// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  describeDroppedElements,
  findDroppedElements,
  normalizeEditorHtml,
} from "../extensions/contentFidelity";

const TABLE =
  "<table><thead><tr><th>Tool</th><th>Price</th></tr></thead><tbody><tr><td>A</td><td>$10</td></tr></tbody></table>";

describe("findDroppedElements", () => {
  it("reports every structural element the editor output lost", () => {
    const dropped = findDroppedElements(
      `${TABLE}<h4>Note</h4><p>x<sup>1</sup></p>`,
      "<p>ToolPriceA$10</p><p>Note</p><p>x1</p>",
    );
    expect(dropped).toEqual(
      expect.arrayContaining([
        { tag: "table", before: 1, after: 0 },
        { tag: "tr", before: 2, after: 0 },
        { tag: "th", before: 2, after: 0 },
        { tag: "td", before: 2, after: 0 },
        { tag: "h4", before: 1, after: 0 },
        { tag: "sup", before: 1, after: 0 },
      ]),
    );
  });

  it("returns nothing when the output keeps the same structure", () => {
    const html = `${TABLE}<figure><img src="https://x.test/a.png"><figcaption>Cap</figcaption></figure>`;
    expect(findDroppedElements(html, html)).toEqual([]);
  });

  it("ignores wrappers the editor rewrites without losing meaning", () => {
    expect(
      findDroppedElements(
        "<div><p><b>Bold</b> <span>plain</span> <i>it</i></p></div>",
        "<p><strong>Bold</strong> plain <em>it</em></p>",
      ),
    ).toEqual([]);
  });

  it("counts classed divs and elements the schema does not know", () => {
    const dropped = findDroppedElements(
      '<div class="callout"><p>Hi</p></div><details><summary>More</summary><p>Body</p></details>',
      "<p>Hi</p><p>More</p><p>Body</p>",
    );
    expect(dropped.map((d) => d.tag).sort()).toEqual([
      "details",
      "div.class",
      "summary",
    ]);
    expect(describeDroppedElements(dropped)).toContain("<details>");
  });

  it("treats a link that wraps an image as lost when the output drops it", () => {
    expect(
      findDroppedElements(
        '<a href="https://x.test"><img src="https://x.test/a.png"></a>',
        '<img src="https://x.test/a.png">',
      ),
    ).toEqual([{ tag: "a", before: 1, after: 0 }]);
  });
});

describe("normalizeEditorHtml", () => {
  it("moves leading header rows back into a thead and unwraps single cell paragraphs", () => {
    const out = normalizeEditorHtml(
      '<table style="min-width: 50px"><colgroup><col><col></colgroup><tbody><tr><th colspan="1" rowspan="1"><p>Tool</p></th><th colspan="1" rowspan="1"><p>Price</p></th></tr><tr><td colspan="1" rowspan="1"><p>A</p></td><td colspan="1" rowspan="1"><p>One</p><p>Two</p></td></tr></tbody></table>',
    );
    const doc = new DOMParser().parseFromString(out, "text/html");
    expect(doc.querySelectorAll("thead tr").length).toBe(1);
    expect(doc.querySelectorAll("thead th").length).toBe(2);
    expect(doc.querySelectorAll("tbody tr").length).toBe(1);
    expect(doc.querySelector("th")!.innerHTML).toBe("Tool");
    expect(doc.querySelector("td")!.innerHTML).toBe("A");
    // Multi-paragraph cells keep their paragraphs.
    expect(doc.querySelectorAll("td")[1].querySelectorAll("p").length).toBe(2);
  });

  it("returns html without tables untouched", () => {
    const html = '<p>Plain <a href="https://x.test">link</a></p>';
    expect(normalizeEditorHtml(html)).toBe(html);
  });

  it("is idempotent", () => {
    const once = normalizeEditorHtml(
      "<table><tbody><tr><th><p>H</p></th></tr><tr><td><p>D</p></td></tr></tbody></table>",
    );
    expect(normalizeEditorHtml(once)).toBe(once);
  });
});
