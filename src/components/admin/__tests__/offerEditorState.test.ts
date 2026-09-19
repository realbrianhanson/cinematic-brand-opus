import { describe, expect, it } from "vitest";
import {
  empty,
  payload,
  slugify,
  toForm,
  type Form,
  type Offer,
} from "../offerEditorState";

const draft: Form = { ...empty, title: "Useful guide", slug: "useful-guide" };
describe("offer editing validation", () => {
  it("keeps new offers unlisted and preserves Shop choices without publishing", () => {
    expect(payload(draft)).toMatchObject({
      show_in_shop: false,
      shop_category: "resource",
      shop_featured: false,
      status: "draft",
    });
    const values = payload({
      ...draft,
      showInShop: true,
      shopCategory: "training",
      shopFeatured: true,
    });
    expect(values).toMatchObject({
      show_in_shop: true,
      shop_category: "training",
      shop_featured: true,
      status: "draft",
    });
    const stored = {
      ...values,
      id: "offer-id",
      created_at: "2026-09-19T00:00:00Z",
      updated_at: "2026-09-19T00:00:00Z",
    } as Offer;
    expect(payload(toForm(stored))).toEqual(values);
  });
  it("rejects follow-up-only Shop listings and unsupported categories", () => {
    expect(() =>
      payload({ ...draft, showInShop: true, funnelOnly: true }),
    ).toThrow(/Follow-up-only offers cannot appear/);
    expect(() =>
      payload({
        ...draft,
        shopCategory: "subscription" as Form["shopCategory"],
      }),
    ).toThrow(/Shop category/);
    expect(() =>
      payload({ ...draft, shopCategory: "toString" as Form["shopCategory"] }),
    ).toThrow(/Shop category/);
    expect(
      payload({ ...draft, funnelOnly: true, showInShop: false }).funnel_only,
    ).toBe(true);
  });
  it("converts decimal prices to exact integer minor units", () => {
    expect(
      payload({ ...draft, kind: "paid", price: "19.99" }).amount_minor,
    ).toBe(1999);
    expect(payload({ ...draft, kind: "paid", price: "0.5" }).amount_minor).toBe(
      50,
    );
    expect(
      payload({ ...draft, kind: "free", price: "19.99" }).amount_minor,
    ).toBe(0);
    for (const price of [
      "0.49",
      "19.999",
      "1e3",
      "-1",
      "Infinity",
      "1000000",
      "1,000",
    ])
      expect(() => payload({ ...draft, kind: "paid", price })).toThrow();
  });
  it("requires a description and private file before publishing", () => {
    expect(() => payload({ ...draft, status: "published" })).toThrow(/summary/);
    expect(() =>
      payload({ ...draft, status: "published", summary: "A guide" }),
    ).toThrow(/file/);
    const published = payload({
      ...draft,
      status: "published",
      summary: "A guide",
      assetPath: "uuid/version.pdf",
      assetName: "Guide.pdf",
    });
    expect(published.asset_path).toBe("uuid/version.pdf");
    expect(payload({ ...draft, status: "archived" }).status).toBe("archived");
  });
  it("rejects unsafe covers and invalid offer deadlines", () => {
    for (const cover of [
      "http://example.com/a.jpg",
      "javascript:alert(1)",
      "https://user:pass@example.com/a.jpg",
    ])
      expect(() => payload({ ...draft, cover })).toThrow(/HTTPS/);
    expect(
      payload({ ...draft, cover: "https://example.com/a.jpg" }).cover_url,
    ).toBe("https://example.com/a.jpg");
    for (const window of ["29", "10081", "30.5", "-1"])
      expect(() =>
        payload({ ...draft, nextOffer: "another-id", window }),
      ).toThrow(/window/);
    expect(
      payload({ ...draft, nextOffer: "another-id", window: "30" })
        .next_offer_window_minutes,
    ).toBe(30);
    expect(
      payload({ ...draft, nextOffer: "", window: "30" })
        .next_offer_window_minutes,
    ).toBe(0);
  });
  it("keeps automatically generated slugs valid at the length boundary", () => {
    const slug = slugify(`${"a".repeat(119)} a long name`);
    expect(slug).toHaveLength(119);
    expect(() => payload({ ...draft, slug })).not.toThrow();
  });
  it("preserves paid amounts and delivery snapshots when loading an offer", () => {
    const stored = {
      ...payload({
        ...draft,
        kind: "paid",
        price: "42.37",
        assetPath: "old/file.zip",
        assetName: "Original.zip",
        nextOffer: "next-id",
        window: "1440",
      }),
      id: "offer-id",
      created_at: "2026-09-19T00:00:00Z",
      updated_at: "2026-09-19T00:00:00Z",
    } as Offer;
    expect(payload(toForm(stored))).toEqual(
      payload({
        ...draft,
        kind: "paid",
        price: "42.37",
        assetPath: "old/file.zip",
        assetName: "Original.zip",
        nextOffer: "next-id",
        window: "1440",
      }),
    );
  });
});
