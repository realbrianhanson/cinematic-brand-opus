import { describe, expect, it } from "vitest";
import { emptyBuilder, emptyPage, newSection } from "../offerBuilder";
import {
  applyOfferCopy,
  buildOfferPageCopyContext,
  offerCopyRequestSchema,
  offerCopyResponseSchema,
  type OfferCopySuggestion,
} from "../offerCopy";

const headline: OfferCopySuggestion = {
  target: "headline",
  title: "Clear result",
  headline: "Make the next task easier",
  subheadline: "A practical guide",
  explanation: "Names the result.",
  evidenceIds: [],
  missingFacts: [],
};

describe("offer copy boundaries", () => {
  it("includes every section in page order, CTA and exact terms while bounding long copy", () => {
    const sections = Array.from({ length: 29 }, (_, index) => ({
      ...newSection(index === 0 ? "faq" : "benefits"),
      body: "Benefit or question. ".repeat(400),
      imageUrl: "https://example.com/private-reference.png",
      caption: "Screenshot of the product",
    }));
    const terms = {
      ...newSection("guarantee"),
      body: "Exact terms. ".repeat(400),
    };
    const page = {
      ...emptyPage(),
      eyebrow: "For owners",
      ctaText: "See current pricing",
      ctaMicrocopy: "Opens a separate checkout",
      sections: [...sections, terms],
    };
    const context = buildOfferPageCopyContext(page);
    expect(context.sections.map((section) => section.id)).toEqual(
      page.sections.map((section) => section.id),
    );
    expect(context).toMatchObject({
      ctaText: page.ctaText,
      ctaMicrocopy: page.ctaMicrocopy,
      eyebrow: page.eyebrow,
    });
    expect(context.sections.at(-1)).toMatchObject({
      body: terms.body,
      truncated: false,
    });
    expect(context.sections[0]).toMatchObject({
      type: "faq",
      hasMedia: true,
      truncated: true,
    });
    expect(
      context.sections.reduce(
        (sum, section) => sum + section.body.length + section.caption.length,
        0,
      ),
    ).toBeLessThanOrEqual(24000);
    expect(JSON.stringify(context)).not.toContain("private-reference");
    expect(page.sections[0].body.length).toBeGreaterThan(1200);
  });
  it("marks omitted terms incomplete rather than claiming the supplied excerpt is the full guarantee", () => {
    const page = {
      ...emptyPage(),
      sections: Array.from({ length: 5 }, () => ({
        ...newSection("guarantee"),
        body: "x".repeat(6000),
      })),
    };
    const context = buildOfferPageCopyContext(page);
    expect(context.sections[4]).toMatchObject({ body: "", truncated: true });
  });
  it("only applies requested headline copy, preserving prices outside the page and page sections", () => {
    const page = {
      ...emptyPage(),
      ctaText: "Continue to checkout",
      sections: [
        { ...newSection("guarantee"), body: "Existing terms" },
        { ...newSection("proof"), body: "An exact quote" },
      ],
    };
    const updated = applyOfferCopy(page, headline, {
      mode: "headline",
      currentCopy: { headline: "", subheadline: "" },
    });
    expect(updated.headline).toBe(headline.headline);
    expect(updated.sections).toBe(page.sections);
    expect(updated.ctaText).toBe(page.ctaText);
    expect(page.headline).toBe("");
  });
  it("refuses to rewrite a proof or guarantee section even with a forged section id", () => {
    const protectedSection = {
      ...newSection("guarantee"),
      body: "Original terms",
    };
    const page = { ...emptyPage(), sections: [protectedSection] };
    const copy: OfferCopySuggestion = {
      target: "section",
      heading: "Invented",
      body: "Changed",
      title: "Suggestion",
      explanation: "",
      evidenceIds: [],
      missingFacts: [],
    };
    const updated = applyOfferCopy(page, copy, {
      mode: "section",
      currentCopy: {
        headline: "",
        subheadline: "",
        section: {
          id: protectedSection.id,
          type: "text",
          heading: "",
          body: "",
        },
      },
    });
    expect(updated.sections[0]).toBe(protectedSection);
  });
  it("adds objections only on explicit apply and never mutates the original page", () => {
    const page = emptyPage();
    const updated = applyOfferCopy(
      page,
      {
        target: "section",
        heading: "Questions",
        body: "How do I start?",
        title: "FAQ",
        explanation: "",
        evidenceIds: [],
        missingFacts: [],
      },
      { mode: "objections", currentCopy: { headline: "", subheadline: "" } },
    );
    expect(updated.sections).toHaveLength(1);
    expect(updated.sections[0].type).toBe("faq");
    expect(page.sections).toHaveLength(0);
  });
  it("rejects unsupported commercial fields in provider output and unknown fields in requests", () => {
    expect(
      offerCopyResponseSchema.safeParse({
        suggestions: [{ ...headline, amount_minor: 10 }],
        warnings: [],
      }).success,
    ).toBe(false);
    const request = {
      mode: "headline",
      stage: "landing",
      strategy: emptyBuilder().strategy,
      offer: {
        title: "Guide",
        summary: "Useful",
        body: "",
        kind: "free",
        amount_minor: 0,
        currency: "usd",
      },
      currentCopy: { headline: "", subheadline: "" },
      proofIds: [],
      instruction: "",
      is_admin: true,
    };
    expect(offerCopyRequestSchema.safeParse(request).success).toBe(false);
  });
});
