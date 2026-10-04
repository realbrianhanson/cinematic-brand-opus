import { describe, expect, it } from "vitest";
import { sortOwnerOffers, type ShopOffer } from "../shop";
describe("owner learning order", () => {
  it("puts the free beginner entry before workshop and templates without mutating input", () => {
    const offers = [
      "pushten",
      "other",
      "app-building-workshop",
      "personal-agent-webinar",
    ].map((slug) => ({ slug })) as ShopOffer[];
    expect(sortOwnerOffers(offers).map((o) => o.slug)).toEqual([
      "personal-agent-webinar",
      "app-building-workshop",
      "pushten",
      "other",
    ]);
    expect(offers[0].slug).toBe("pushten");
  });
});
