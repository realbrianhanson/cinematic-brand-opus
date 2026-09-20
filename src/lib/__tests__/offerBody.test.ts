import { describe, expect, it } from "vitest";
import { offerBodyBlocks, safeOfferImageUrl } from "../offerBody";
import { adminOfferSearch } from "../adminOfferViews";

describe("offer detail formatting", () => {
  it("keeps existing plain paragraphs and line breaks intact", () => {
    expect(
      offerBodyBlocks("First line.\nSecond line.\n\nNext paragraph."),
    ).toEqual([
      { type: "paragraph", text: "First line.\nSecond line." },
      { type: "paragraph", text: "Next paragraph." },
    ]);
  });
  it("supports scannable sections and bullets without interpreting markup", () => {
    expect(
      offerBodyBlocks(
        "## What is included\r\n- Walkthroughs\r\n- <script>alert(1)</script>\r\n\r\n[Open](javascript:alert(1))",
      ),
    ).toEqual([
      { type: "heading", text: "What is included" },
      { type: "list", items: ["Walkthroughs", "<script>alert(1)</script>"] },
      { type: "paragraph", text: "[Open](javascript:alert(1))" },
    ]);
  });
  it("does not manufacture content from whitespace", () => {
    expect(offerBodyBlocks("\n \r\n")).toEqual([]);
  });
  it("keeps standalone images, captions, quotes, lists, and prose in author order", () => {
    expect(
      offerBodyBlocks(
        'Before\n![Workflow overview](https://example.com/overview.webp "The complete workflow.")\n## What is included\n- One\n  ![Detail view](https://example.com/detail.png)  \n> Every step stays visible.\n>\n> — Lynn Hutchison\n![Final result](https://example.com/result.jpg)\nAfter',
      ),
    ).toEqual([
      { type: "paragraph", text: "Before" },
      {
        type: "image",
        src: "https://example.com/overview.webp",
        alt: "Workflow overview",
        caption: "The complete workflow.",
      },
      { type: "heading", text: "What is included" },
      { type: "list", items: ["One"] },
      {
        type: "image",
        src: "https://example.com/detail.png",
        alt: "Detail view",
      },
      {
        type: "quote",
        paragraphs: ["Every step stays visible."],
        attribution: "Lynn Hutchison",
      },
      {
        type: "image",
        src: "https://example.com/result.jpg",
        alt: "Final result",
      },
      { type: "paragraph", text: "After" },
    ]);
  });
  it("preserves image-like text inside prose, lists, headings, and quotes", () => {
    const image = '![Workflow](https://example.com/workflow.webp "Overview")';
    expect(
      offerBodyBlocks(
        `Look at ${image} for context.\n## ${image}\n- ${image}\n> ${image}\n>\n> — Lynn Hutchison`,
      ),
    ).toEqual([
      { type: "paragraph", text: `Look at ${image} for context.` },
      { type: "heading", text: image },
      { type: "list", items: [image] },
      {
        type: "quote",
        paragraphs: [image],
        attribution: "Lynn Hutchison",
      },
    ]);
  });
  it.each([
    "![](https://example.com/image.webp)",
    "![   ](https://example.com/image.webp)",
    "![Overview](http://example.com/image.webp)",
    "![Overview](javascript:alert(1))",
    "![Overview](data:image/png;base64,AAAA)",
    "![Overview](//example.com/image.webp)",
    "![Overview](/image.webp)",
    "![Overview](https:example.com/image.webp)",
    "![Overview](https:///example.com/image.webp)",
    "![Overview](https://name:secret@example.com/image.webp)",
    "![Overview](https://example.com/image name.webp)",
    "![Overview](https://example.com/image\\name.webp)",
    '![Overview](https://example.com/image.webp "Unclosed caption)',
    '![Overview](https://example.com/image.webp "Caption") trailing text',
    "![Overview](https://example.com/image.webp",
  ])("leaves invalid image syntax as literal text: %s", (body) => {
    expect(offerBodyBlocks(body)).toEqual([{ type: "paragraph", text: body }]);
  });
  it("retains markup in image alt text and captions as literal strings", () => {
    expect(
      offerBodyBlocks(
        '![<img src=x onerror=alert(1)>](https://example.com/image.webp "<script>alert(1)</script> & details")',
      ),
    ).toEqual([
      {
        type: "image",
        src: "https://example.com/image.webp",
        alt: "<img src=x onerror=alert(1)>",
        caption: "<script>alert(1)</script> & details",
      },
    ]);
  });
  it("preserves quote paragraphs, line breaks, punctuation, and a separate final attribution", () => {
    expect(
      offerBodyBlocks(
        "> It’s useful — and practical.\r\n> Every word stays here!\r\n>\r\n> “Keep going,” she said.\r\n>\r\n> — Lynn Hutchison",
      ),
    ).toEqual([
      {
        type: "quote",
        paragraphs: [
          "It’s useful — and practical.\nEvery word stays here!",
          "“Keep going,” she said.",
        ],
        attribution: "Lynn Hutchison",
      },
    ]);
  });
  it("keeps headings, lists, prose, and separate quotes in their original order", () => {
    expect(
      offerBodyBlocks(
        "Intro\n> First quote.\n## Included\n- One\n> Second quote.\n- Two\nAfter\n> Third quote.\n\n> Fourth quote.",
      ),
    ).toEqual([
      { type: "paragraph", text: "Intro" },
      { type: "quote", paragraphs: ["First quote."] },
      { type: "heading", text: "Included" },
      { type: "list", items: ["One"] },
      { type: "quote", paragraphs: ["Second quote."] },
      { type: "list", items: ["Two"] },
      { type: "paragraph", text: "After" },
      { type: "quote", paragraphs: ["Third quote."] },
      { type: "quote", paragraphs: ["Fourth quote."] },
    ]);
  });
  it("ignores empty quote markers without creating empty quote paragraphs", () => {
    expect(offerBodyBlocks(">\n> \n>\t\n\n>\n> A quote.\n>\n>")).toEqual([
      { type: "quote", paragraphs: ["A quote."] },
    ]);
  });
  it("retains attribution-like content unless it is a separate final paragraph after a quote", () => {
    expect(
      offerBodyBlocks(
        "> — Name only\n\n> A quote.\n> — A line in the same paragraph\n>\n> — A name in the middle\n>\n> Closing thought.",
      ),
    ).toEqual([
      { type: "quote", paragraphs: ["— Name only"] },
      {
        type: "quote",
        paragraphs: [
          "A quote.\n— A line in the same paragraph",
          "— A name in the middle",
          "Closing thought.",
        ],
      },
    ]);
  });
  it("leaves legacy greater-than text intact and treats quote markup as plain text", () => {
    expect(
      offerBodyBlocks(
        ">10 results\nMath: 3 > 2\n> ## Not a heading\n> - Not a bullet\n> <script>alert(1)</script>\n> [Open](javascript:alert(1))",
      ),
    ).toEqual([
      { type: "paragraph", text: ">10 results\nMath: 3 > 2" },
      {
        type: "quote",
        paragraphs: [
          "## Not a heading\n- Not a bullet\n<script>alert(1)</script>\n[Open](javascript:alert(1))",
        ],
      },
    ]);
  });
});

describe("offer body image URLs", () => {
  it("accepts an absolute HTTPS image URL without changing its query", () => {
    const src =
      "https://images.example.com/workflow%20overview.webp?width=1200&v=2";
    expect(safeOfferImageUrl(src)).toBe(src);
  });
  it.each([
    "",
    "/image.webp",
    "//example.com/image.webp",
    "http://example.com/image.webp",
    "https:example.com/image.webp",
    "https:///example.com/image.webp",
    "javascript:alert(1)",
    "data:image/png;base64,AAAA",
    "https://name:secret@example.com/image.webp",
    "https://example.com/image name.webp",
    " https://example.com/image.webp",
    "https://example.com/image.webp ",
    "https://example.com/image.webp\n",
    "https://example.com/image\t.webp",
    "https://example.com/image\u0000.webp",
    "https://example.com/image\\name.webp",
  ])("rejects unsafe or ambiguous image URL %j", (src) => {
    expect(safeOfferImageUrl(src)).toBeNull();
  });
  it("accepts URLs up to 2048 characters and rejects longer ones", () => {
    const prefix = "https://example.com/";
    const longest = prefix + "x".repeat(2048 - prefix.length);
    expect(safeOfferImageUrl(longest)).toBe(longest);
    expect(safeOfferImageUrl(`${longest}x`)).toBeNull();
  });
});

describe("shareable admin offer views", () => {
  it("accepts direct links to orders and setup and rejects unknown tabs", () => {
    expect(adminOfferSearch({ tab: "orders" })).toEqual({ tab: "orders" });
    expect(adminOfferSearch({ tab: "setup" })).toEqual({ tab: "setup" });
    expect(adminOfferSearch({ tab: "javascript:alert(1)" })).toEqual({
      tab: "offers",
    });
    expect(adminOfferSearch({ tab: ["orders"] })).toEqual({ tab: "offers" });
  });
});
