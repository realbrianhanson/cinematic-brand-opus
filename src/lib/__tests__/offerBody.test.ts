import { describe, expect, it } from "vitest";
import { offerBodyBlocks } from "../offerBody";
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
