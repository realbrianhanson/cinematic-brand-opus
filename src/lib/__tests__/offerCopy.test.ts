import { describe, expect, it } from "vitest";
import { emptyBuilder, emptyPage, newSection } from "../offerBuilder";
import {
  applyOfferCopy,
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
