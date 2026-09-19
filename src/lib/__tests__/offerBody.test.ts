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
