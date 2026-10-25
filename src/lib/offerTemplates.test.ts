import { describe, expect, it } from "vitest";
import {
  emptyBuilder,
  emptyPage,
  newSection,
  offerPageSchema,
  type OfferRecipeContext,
} from "./offerBuilder";
import {
  offerTemplates,
  offerTemplatePage,
  offerTemplateExample,
  proposeOfferTemplate,
} from "./offerTemplates";

const context: OfferRecipeContext = {
  strategy: {
    ...emptyBuilder().strategy,
    outcome: "My actual result",
    deliverables: "- Actual guide",
  },
  offer: { title: "Actual product", summary: "Actual summary", kind: "paid" },
};

describe("curated offer layouts", () => {
  it("produces three different persisted arrangements, not just different names", () => {
    const pages = offerTemplates.map((template) =>
      offerTemplatePage(template.id, context),
    );
    expect(
      new Set(
        pages.map((page) =>
          page.sections.map((section) => section.type).join(","),
        ),
      ).size,
    ).toBe(3);
    expect(pages.map((page) => page.sections[0].type)).toEqual([
      "problem",
      "benefits",
      "deliverables",
    ]);
    for (const page of pages)
      expect(offerPageSchema.safeParse(page).success).toBe(true);
  });

  it("keeps all existing custom content, duplicate types, proof and media when rearranging", () => {
    const sections = [
      { ...newSection("cta"), body: "My action copy" },
      {
        ...newSection("video"),
        imageUrl: "https://vimeo.com/12345",
        caption: "My demonstration",
      },
      {
        ...newSection("proof"),
        body: "Exact quote",
        caption: "Actual customer",
        proofId: "proof-1",
      },
      { ...newSection("benefits"), body: "Hand written benefits" },
      {
        ...newSection("proof"),
        body: "A second exact quote",
        caption: "Second customer",
        proofId: "proof-2",
      },
    ];
    const value = {
      ...emptyPage(),
      headline: "My headline",
      focusMode: false,
      sections,
    };
    const original = structuredClone(value);
    const result = proposeOfferTemplate(value, "concise-follow-up", context);
    expect(result.page.sections[0].type).toBe("deliverables");
    expect(result.page.sections.at(-1)?.type).toBe("cta");
    for (const section of sections)
      expect(
        result.page.sections.find((item) => item.id === section.id),
      ).toEqual(
        section.heading
          ? section
          : {
              ...section,
              heading: result.page.sections.find(
                (item) => item.id === section.id,
              )!.heading,
            },
      );
    expect(
      result.page.sections.filter((section) => section.type === "proof"),
    ).toEqual(sections.filter((section) => section.type === "proof"));
    expect(result.page.headline).toBe("My headline");
    expect(result.page.focusMode).toBe(false);
    expect(value).toEqual(original);
  });

  it("never uses gallery examples as applied customer content", () => {
    for (const template of offerTemplates) {
      const sample = offerTemplateExample(template.id);
      expect(sample.eyebrow).toContain("sample copy");
      const applied = proposeOfferTemplate(
        emptyPage(),
        template.id,
        context,
      ).page;
      expect(applied.headline).toBe(context.strategy.outcome);
      expect(applied.subheadline).toBe(context.offer.summary);
      expect(JSON.stringify(applied)).not.toContain("Offer planning workbook");
      expect(JSON.stringify(applied)).not.toContain("launch checklist");
      expect(
        applied.sections.find((section) => section.type === "faq")?.body,
      ).toBe("");
      expect(
        applied.sections.find((section) => section.type === "proof")?.body,
      ).toBe("");
      expect(
        applied.sections.some((section) => section.type === "guarantee"),
      ).toBe(false);
    }
  });

  it("preserves a full page without exceeding the 30-section limit", () => {
    const current = {
      ...emptyPage(),
      sections: Array.from({ length: 30 }, () => ({
        ...newSection("text"),
        body: "Existing section",
      })),
    };
    const result = proposeOfferTemplate(current, "resource-showcase", context);
    expect(result.page.sections).toEqual(current.sections);
    expect(result.omittedSections).toBe(7);
  });
});
