import { describe, expect, it } from "vitest";
import {
  emptyBuilder,
  newSection,
  offerBuilderSchema,
  validOfferUrl,
} from "../offerBuilder";
import { builderIssues } from "../offerBuilderValidation";
import { safeExternalOfferUrl } from "../offers";

// Each case mirrors public.offer_valid_external_url in
// supabase/migrations/20260919150000_offer_external_listings.sql.
const accepted = [
  "https://example.com",
  "HTTPS://Example.COM/path?q=1#frag",
  "https://example.com.",
  "https://sub-domain.example.co.uk:8443/a",
  "https://127.0.0.1/image.png",
  "https://127.000.000.001/image.png",
  "https://[::1]/video",
  "https://[2001:db8::1]:443/",
  "https://a.b/" + "x".repeat(2048 - "https://a.b/".length),
  "https://example.com/under_score/path|pipe",
];
const rejected = [
  "",
  "http://example.com",
  "https:example.com",
  "https://",
  "https://user:secret@example.com",
  "https://user@example.com",
  "https://exa_mple.com",
  "https://-example.com",
  "https://example-.com",
  "https://a..b.com",
  "https://bücher.example",
  "https://example.com/a b",
  "https://example.com/\u0000",
  "https://example.com\\evil",
  "https://example.com:99999",
  "https://example.com:123456",
  "https://1.2.3",
  "https://256.1.1.1",
  "https://[1.2.3.4]",
  "https://[1::2::3]",
  "https://" + "a".repeat(64) + ".com",
  "https://a.b/" + "x".repeat(2048),
];

describe("offer URL rule shared with the database", () => {
  it.each(accepted)("accepts %s", (value) => {
    expect(validOfferUrl(value)).toBe(true);
  });
  it.each(rejected)("rejects %s", (value) => {
    expect(validOfferUrl(value)).toBe(false);
  });
  it("applies the same rule to section media and external destinations", () => {
    for (const value of ["https://exa_mple.com/a.png", "https://1.2.3/a"]) {
      const builder = emptyBuilder();
      builder.presentation.landing.sections = [
        { ...newSection("image"), imageUrl: value },
      ];
      expect(offerBuilderSchema.safeParse(builder).success).toBe(false);
      expect(safeExternalOfferUrl(value)).toBeNull();
    }
    expect(safeExternalOfferUrl("https://example.com/product?a=1")).toBe(
      "https://example.com/product?a=1",
    );
  });
});

describe("builder issues", () => {
  it("names the page, section and field that failed", () => {
    const builder = emptyBuilder();
    builder.presentation.upsell.sections = [
      newSection("benefits"),
      { ...newSection("video"), imageUrl: "https://user:pw@example.com/v" },
    ];
    builder.strategy.audience = "a".repeat(2001);
    const issues = builderIssues(builder);
    expect(issues).toEqual([
      expect.objectContaining({
        step: "strategy",
        field: "Who is this for?",
        message: expect.stringContaining("2,000 characters"),
      }),
      expect.objectContaining({
        step: "pages",
        field: "Upsell presentation · section 2 (Video walkthrough) media URL",
        message: expect.stringContaining("HTTPS"),
      }),
    ]);
    for (const issue of issues) expect(issue.message).not.toMatch(/[{}[\]]/);
  });
  it("reports nothing for a valid builder", () => {
    expect(builderIssues(emptyBuilder())).toEqual([]);
  });
});
