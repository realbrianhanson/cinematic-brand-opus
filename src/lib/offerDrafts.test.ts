import { describe, expect, it } from "vitest";
import {
  emptyBuilder,
  newSection,
  offerBuilderSchema,
  type OfferRecipeContext,
} from "./offerBuilder";
import { proposeOfferDraft } from "./offerDrafts";

const context: OfferRecipeContext = {
  offer: {
    title: "A launch workbook",
    summary: "A practical planning resource",
    kind: "paid",
  },
  strategy: {
    ...emptyBuilder().strategy,
    audience: "Small business owners",
    problem: "Too many ideas to organize",
    outcome: "Plan the next launch",
    mechanism: "- Choose a customer\n- Outline one offer",
    deliverables: "- A workbook\n- A checklist",
    evidence: "PRIVATE EVIDENCE",
    objections: "PRIVATE OBJECTIONS",
    adMessage: "PRIVATE AD MESSAGE",
  },
};

describe("reviewable offer draft", () => {
  it("builds schema-compatible copy from supplied facts without importing private notes", () => {
    const current = emptyBuilder();
    current.strategy = context.strategy;
    const result = proposeOfferDraft(current, context);
    expect(offerBuilderSchema.safeParse(result.builder).success).toBe(true);
    const page = result.builder.presentation.landing;
    expect(page.headline).toBe(context.strategy.outcome);
    expect(page.subheadline).toBe(context.offer.summary);
    expect(
      page.sections.find((section) => section.type === "method")?.body,
    ).toBe(context.strategy.mechanism);
    expect(
      page.sections.find((section) => section.type === "deliverables")?.body,
    ).toBe(context.strategy.deliverables);
    expect(JSON.stringify(page)).not.toContain("PRIVATE");
    expect(
      page.sections.find((section) => section.type === "proof")?.body,
    ).toBe("");
    expect(page.sections.find((section) => section.type === "faq")?.body).toBe(
      "",
    );
    expect(page.sections.some((section) => section.type === "guarantee")).toBe(
      false,
    );
    expect(result.builder.strategy).toEqual(context.strategy);
  });

  it("keeps edited fields, section IDs/order, exact proof/media, and untouched pages", () => {
    const current = emptyBuilder();
    const benefits = {
      ...newSection("benefits"),
      heading: "My heading",
      body: "My carefully edited benefit",
    };
    const proof = {
      ...newSection("proof"),
      proofId: "approved-proof",
      body: "Exact quote",
      caption: "Customer",
    };
    const image = {
      ...newSection("image"),
      imageUrl: "https://example.com/cover.jpg",
      caption: "My caption",
    };
    current.presentation.landing = {
      ...current.presentation.landing,
      headline: "My edited headline",
      ctaText: "My button",
      ctaMicrocopy: "Actual terms",
      sections: [benefits, proof, image],
      focusMode: false,
    };
    current.presentation.upsell.headline = "Keep other page";
    current.presentation.thankYou.body = "My delivery instructions";
    const original = structuredClone(current);
    const result = proposeOfferDraft(current, context);
    const page = result.builder.presentation.landing;
    expect(page.headline).toBe("My edited headline");
    expect(page.ctaText).toBe("My button");
    expect(page.ctaMicrocopy).toBe("Actual terms");
    expect(page.focusMode).toBe(false);
    expect(page.sections.slice(0, 3)).toEqual([benefits, proof, image]);
    expect(result.builder.presentation.upsell).toBe(
      current.presentation.upsell,
    );
    expect(result.builder.presentation.thankYou).toBe(
      current.presentation.thankYou,
    );
    expect(current).toEqual(original);
  });

  it("fills an empty body without replacing its section heading, then becomes idempotent", () => {
    const current = emptyBuilder();
    const section = { ...newSection("method"), heading: "My process heading" };
    current.presentation.landing.sections = [section];
    const first = proposeOfferDraft(current, context);
    expect(first.builder.presentation.landing.sections[0]).toEqual({
      ...section,
      body: context.strategy.mechanism,
    });
    const second = proposeOfferDraft(first.builder, context);
    expect(second.builder).toEqual(first.builder);
    expect(second.changes).toEqual([]);
  });

  it("does not populate library-linked evidence even if it has a reusable factual section type", () => {
    const current = emptyBuilder();
    const evidence = { ...newSection("benefits"), proofId: "some-library-id" };
    current.presentation.landing.sections = [evidence];
    expect(
      proposeOfferDraft(current, context).builder.presentation.landing
        .sections[0],
    ).toEqual(evidence);
  });

  it("updates only selected pages and never invents delivery confirmation copy", () => {
    const current = emptyBuilder();
    const result = proposeOfferDraft(current, context, ["upsell"]);
    expect(result.builder.presentation.landing).toBe(
      current.presentation.landing,
    );
    expect(result.builder.presentation.upsell.headline).toBe(
      context.strategy.outcome,
    );
    expect(result.builder.presentation.thankYou).toEqual(
      current.presentation.thankYou,
    );
    expect(proposeOfferDraft(current, context, []).changes).toEqual([]);
  });

  it("does not exceed section limits or delete content to make room", () => {
    const current = emptyBuilder();
    current.presentation.landing.sections = Array.from({ length: 30 }, () => ({
      ...newSection("text"),
      body: "Keep this copy",
    }));
    const result = proposeOfferDraft(current, context);
    expect(result.builder.presentation.landing.sections).toEqual(
      current.presentation.landing.sections,
    );
    expect(result.omittedSections).toBeGreaterThan(0);
    expect(offerBuilderSchema.safeParse(result.builder).success).toBe(true);
  });

  it("uses the action that matches actual delivery mode", () => {
    expect(
      proposeOfferDraft(emptyBuilder(), {
        ...context,
        offer: { ...context.offer, kind: "free" },
      }).builder.presentation.landing.ctaText,
    ).toBe("Get the free resource");
    expect(
      proposeOfferDraft(emptyBuilder(), {
        ...context,
        offer: { ...context.offer, checkout_mode: "external" },
      }).builder.presentation.landing.ctaText,
    ).toBe("See the offer");
  });
});
