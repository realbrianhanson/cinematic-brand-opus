import { describe, expect, it } from "vitest";
import { emptyBuilder } from "../offerBuilder";
import {
  connectedOfferView,
  validateOfferWorkspaceSearch,
  type ConnectedOffer,
} from "../offerWorkspace";

describe("connected offer workspace", () => {
  const id = "12345678-1234-4234-a234-123456789abc";
  it("accepts only local parent IDs, known relations and connection view", () => {
    expect(
      validateOfferWorkspaceSearch({
        parent: id,
        relation: "upsell",
        view: "connections",
        returnTo: "https://example.com",
      }),
    ).toEqual({ parent: id, relation: "upsell", view: "connections" });
    for (const parent of ["https://example.com", "../admin", [], {}, undefined])
      expect(
        validateOfferWorkspaceSearch({ parent, relation: "upsell" }),
      ).toEqual({});
    expect(
      validateOfferWorkspaceSearch({
        parent: id,
        relation: "other",
        view: "other",
      }),
    ).toEqual({});
  });
  const item = (): ConnectedOffer => ({
    offer: {
      id,
      status: "draft",
      title: "Draft shell",
      kind: "free",
      currency: "usd",
      amount_minor: 0,
    } as ConnectedOffer["offer"],
    document: {
      offer: {
        title: "Paid CAD pack",
        kind: "paid",
        currency: "cad",
        amount_minor: 1999,
      },
      builder: emptyBuilder(),
    },
  });
  it("shows real private child settings instead of its shell defaults without mutating the row", () => {
    const saved = item();
    expect(connectedOfferView(saved)).toMatchObject({
      id,
      status: "draft",
      title: "Paid CAD pack",
      kind: "paid",
      currency: "cad",
      amount_minor: 1999,
    });
    expect(saved.offer).toMatchObject({ kind: "free", currency: "usd" });
  });
  it("does not substitute an unpublished draft for a live or archived connection", () => {
    for (const status of ["published", "archived"]) {
      const saved = item();
      saved.offer.status = status;
      expect(connectedOfferView(saved)).toBe(saved.offer);
    }
  });
});
