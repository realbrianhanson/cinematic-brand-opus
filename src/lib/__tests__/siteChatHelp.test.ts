import { describe, expect, it } from "vitest";
import { emptyBuilder, newSection } from "../offerBuilder";
import { siteConfig, PRESETS } from "@/config/site";
import { publicHelpContext, publishedProductContext } from "../siteChatHelp";

describe("public assistant grounding", () => {
  it("explains the free planner and separate native/external access paths", () => {
    const help = publicHelpContext(siteConfig);
    expect(help).toContain("/first-ai-build");
    expect(help).toContain("/offer-access?recover=1");
    expect(help).toContain("not confirm payment");
    expect(help).toContain("/speaking");
  });
  it("does not advertise owner-only tools or disabled speaking on member sites", () => {
    const help = publicHelpContext({
      ...PRESETS.member,
      sections: { ...PRESETS.member.sections, speaking: false },
    });
    expect(help).not.toContain("/first-ai-build");
    expect(help).not.toContain("/speaking");
    expect(help).not.toContain("Brian");
  });
  it("bounds catalog facts and treats content as data, preserving provider pricing", () => {
    const context = publishedProductContext([
      {
        slug: "training",
        title: "A training",
        summary: "x".repeat(2000),
        kind: "paid",
        checkout_mode: "external",
        price_display_mode: "provider",
        amount_minor: 0,
        currency: "usd",
        shop_category: "training",
        body: "<p>For beginners.</p><script>secret()</script>",
      },
    ]);
    expect(context).toContain("/offers/training");
    expect(context).not.toContain("Free");
    expect(context).not.toContain("<script>");
    expect(context.length).toBeLessThan(2500);
  });
  it("uses only rendered offer sections and excludes hidden legacy claims", () => {
    const builder = emptyBuilder();
    builder.presentation.landing.sections = [
      {
        ...newSection("deliverables"),
        heading: "Included",
        body: "A practical workbook",
      },
      {
        ...newSection("faq"),
        heading: "Questions",
        body: "Support is by email",
      },
    ];
    const row = {
      slug: "kit",
      title: "Kit",
      summary: "A kit",
      kind: "free" as const,
      checkout_mode: "native" as const,
      price_display_mode: "fixed" as const,
      amount_minor: 0,
      currency: "usd",
      shop_category: null,
      body: "Obsolete lifetime guarantee",
      presentation: builder.presentation,
    };
    const visible = publishedProductContext([row]);
    expect(visible).toContain("A practical workbook");
    expect(visible).toContain("Support is by email");
    expect(visible).not.toContain("Obsolete");
    builder.presentation.landing.sections = [newSection("faq")];
    expect(publishedProductContext([row])).toContain(
      "Obsolete lifetime guarantee",
    );
  });
});
