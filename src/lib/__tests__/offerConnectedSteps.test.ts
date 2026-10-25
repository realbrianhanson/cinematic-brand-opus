import { describe, expect, it } from "vitest";
import {
  connectedOfferDocument,
  connectedOfferSaveRejected,
  type ConnectedOfferRelation,
} from "../offerConnectedSteps";

const details = {
  title: "Implementation workbook",
  summary: "Plan your first useful build.",
  kind: "paid" as const,
  price: "19.95",
};

describe("connected offer drafts", () => {
  it("creates an unpublished, hidden native draft with the parent's currency and supplied facts", () => {
    const document = connectedOfferDocument("upsell", "gbp", details);
    expect(document.offer).toMatchObject({
      title: details.title,
      slug: "implementation-workbook",
      summary: details.summary,
      checkout_mode: "native",
      kind: "paid",
      currency: "gbp",
      amount_minor: 1995,
      status: "draft",
      funnel_only: true,
      show_in_shop: false,
      next_offer_id: null,
      bump_offer_id: null,
      downsell_offer_id: null,
    });
    expect(document.builder.presentation.landing.headline).toBe(
      details.summary,
    );
    expect(document.builder.presentation.upsell.subheadline).toBe(
      details.summary,
    );
    expect(document.builder.proofIds).toEqual([]);
    expect(
      document.builder.presentation.upsell.sections.find(
        (section) => section.type === "proof",
      )?.body,
    ).toBe("");
    expect(document.builder.strategy.evidence).toBe("");
  });

  it("permits free follow-ups but keeps order bumps paid in the same currency", () => {
    for (const relation of ["upsell", "downsell"] as const) {
      expect(
        connectedOfferDocument(relation, "cad", {
          ...details,
          kind: "free",
          price: "",
        }).offer,
      ).toMatchObject({ kind: "free", amount_minor: 0, currency: "cad" });
    }
    expect(
      connectedOfferDocument("bump", "eur", { ...details, kind: "free" }).offer,
    ).toMatchObject({ kind: "paid", amount_minor: 1995, currency: "eur" });
  });

  it("requires useful names, facts, and valid prices before any save", () => {
    expect(() =>
      connectedOfferDocument("upsell", "usd", { ...details, title: " " }),
    ).toThrow(/title/);
    expect(() =>
      connectedOfferDocument("upsell", "usd", { ...details, summary: " " }),
    ).toThrow(/Describe/);
    expect(() =>
      connectedOfferDocument("upsell", "usd", { ...details, price: "0.01" }),
    ).toThrow(/0.50/);
    expect(() =>
      connectedOfferDocument("bump", "usd", { ...details, price: "10.001" }),
    ).toThrow(/decimal/);
    expect(() => connectedOfferDocument("upsell", "jpy", details)).toThrow(
      /supported currency/,
    );
    expect(() =>
      connectedOfferDocument("bad" as ConnectedOfferRelation, "usd", details),
    ).toThrow(/Choose/);
  });

  it("keeps unknown, timeout, and serialization outcomes frozen for an identical retry", () => {
    for (const code of ["23505", "23514", "22023", "42501", "P0001"])
      expect(connectedOfferSaveRejected({ code })).toBe(true);
    for (const error of [
      new Error("Lost response"),
      { code: "57014" },
      { code: "40001" },
      { code: "PGRST000" },
      null,
    ])
      expect(connectedOfferSaveRejected(error)).toBe(false);
  });
});
