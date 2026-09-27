import { describe, expect, it } from "vitest";
import { offerBuilderSchema } from "../offerBuilder";
import {
  offerStarterDefaults,
  offerStarterIds,
  parseOfferStarter,
  validateOfferStarterSearch,
} from "../offerStarters";

describe("offer starter selection", () => {
  it("accepts only the supported starter values from URL search", () => {
    for (const starter of offerStarterIds) {
      expect(validateOfferStarterSearch({ starter, publish: true })).toEqual({
        starter,
      });
    }
    for (const starter of [
      undefined,
      null,
      true,
      1,
      ["sales"],
      {},
      "Sales",
      "webinar",
      "__proto__",
    ]) {
      expect(parseOfferStarter(starter)).toBeUndefined();
      expect(validateOfferStarterSearch({ starter })).toEqual({});
    }
  });

  it.each([
    ["lead-magnet", "native", "free", "fixed", false, "Get the free resource"],
    ["sales", "native", "paid", "fixed", false, "Continue to checkout"],
    ["external", "external", "paid", "provider", false, "See the offer"],
    ["upsell", "native", "paid", "fixed", true, "Continue to checkout"],
  ] as const)(
    "seeds %s with the intended delivery and page recipe",
    (starter, checkoutMode, kind, priceDisplayMode, funnelOnly, ctaText) => {
      const { form, builder } = offerStarterDefaults(starter);
      expect(form).toEqual({
        checkoutMode,
        kind,
        priceDisplayMode,
        funnelOnly,
      });
      expect(offerBuilderSchema.safeParse(builder).success).toBe(true);
      expect(builder.presentation.landing.ctaText).toBe(ctaText);
      expect(builder.presentation.landing.focusMode).toBe(true);
      expect(
        builder.presentation.landing.sections.map((section) => section.type),
      ).toEqual(
        starter === "lead-magnet"
          ? ["benefits", "deliverables", "image", "proof", "faq", "cta"]
          : starter === "upsell"
            ? ["benefits", "deliverables", "method", "proof", "faq", "cta"]
            : [
                "problem",
                "method",
                "benefits",
                "deliverables",
                "proof",
                "faq",
                "cta",
              ],
      );
      expect(builder.proofIds).toEqual([]);
      expect(
        builder.presentation.landing.sections.every(
          (section) => !section.body && !section.proofId,
        ),
      ).toBe(true);
    },
  );

  it("gives follow-up offers their own pitch and never shares mutable defaults", () => {
    const first = offerStarterDefaults("upsell");
    const second = offerStarterDefaults("upsell");
    expect(first.builder.strategy.traffic).toBe("customer");
    expect(first.builder.presentation.upsell.sections).toHaveLength(6);
    first.builder.presentation.landing.headline = "Changed";
    first.builder.presentation.upsell.sections[0].body = "Changed";
    expect(second.builder.presentation.landing.headline).toBe("");
    expect(second.builder.presentation.upsell.sections[0].body).toBe("");
    expect(
      new Set(
        [
          ...first.builder.presentation.landing.sections,
          ...first.builder.presentation.upsell.sections,
        ].map((section) => section.id),
      ).size,
    ).toBe(12);
  });
});
