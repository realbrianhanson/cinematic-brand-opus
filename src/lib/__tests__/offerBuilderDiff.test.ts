import { describe, expect, it } from "vitest";
import {
  offerChanges,
  sameOfferContent,
  type OfferChangeValues,
} from "../offerBuilderDiff";

const live: OfferChangeValues = {
  status: "published",
  slug: "guide",
  kind: "paid",
  amount_minor: 1900,
  currency: "usd",
  checkout_mode: "native",
  price_display_mode: "fixed",
  asset_path: "id/v1.pdf",
  asset_name: "Guide.pdf",
  next_offer_id: null,
  next_offer_window_minutes: 0,
  external_url: null,
};

describe("offer change summary", () => {
  it("lists nothing when the public settings are unchanged", () => {
    expect(offerChanges(live, { ...live })).toEqual([]);
  });
  it("lists price, URL, file, follow-up and status changes in plain language", () => {
    const changes = offerChanges(
      { ...live, status: "archived" },
      {
        ...live,
        status: "published",
        slug: "better-guide",
        amount_minor: 2900,
        asset_path: "id/v2.pdf",
        next_offer_id: "next",
        next_offer_window_minutes: 60,
      },
      { offerTitle: (id) => (id === "next" ? "Coaching call" : "") },
    );
    expect(changes).toEqual([
      { label: "Status", before: "Archived", after: "Published" },
      {
        label: "Page URL",
        before: "/offers/guide",
        after: "/offers/better-guide",
      },
      { label: "Price", before: "USD 19.00", after: "USD 29.00" },
      {
        label: "Download file",
        before: "Guide.pdf",
        after: "Guide.pdf (new upload)",
      },
      {
        label: "Follow-up",
        before: "None",
        after: "Coaching call · 60-minute window",
      },
    ]);
  });
  it("describes free, provider-priced and external destinations", () => {
    expect(
      offerChanges(live, {
        ...live,
        kind: "free",
        amount_minor: 0,
        checkout_mode: "external",
        external_url: "https://example.com/buy",
        asset_path: null,
        asset_name: null,
      }).map((change) => [change.label, change.after]),
    ).toEqual([
      ["Price", "Free"],
      ["Download file", "None"],
      ["Checkout", "External link · https://example.com/buy"],
    ]);
    expect(
      offerChanges(null, {
        ...live,
        status: "published",
        checkout_mode: "external",
        price_display_mode: "provider",
        amount_minor: 0,
      })[0],
    ).toEqual({
      label: "Status",
      before: "Not yet created",
      after: "Published",
    });
  });
  it("omits status when the comparison has none", () => {
    expect(
      offerChanges(
        { ...live, status: undefined },
        { ...live, status: undefined, slug: "new" },
      ),
    ).toEqual([
      { label: "Page URL", before: "/offers/guide", after: "/offers/new" },
    ]);
  });
});

describe("same offer content", () => {
  it("ignores status and timestamps but not content", () => {
    const row = {
      ...live,
      title: "Guide",
      presentation: { version: 1 },
      updated_at: "a",
    };
    expect(
      sameOfferContent(row, { ...row, status: "archived", updated_at: "b" }),
    ).toBe(true);
    expect(sameOfferContent(row, { ...row, title: "Other" })).toBe(false);
    expect(
      sameOfferContent(row, { ...row, presentation: { version: 2 } }),
    ).toBe(false);
  });
});
