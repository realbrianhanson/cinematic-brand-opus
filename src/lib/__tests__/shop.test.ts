import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  escapeShopSearch,
  SHOP_COLUMNS,
  SHOP_PAGE_SIZE,
  shopFilters,
  shopHref,
} from "../shop";
const mocks = vi.hoisted(() => ({
  calls: [] as unknown[][],
  responses: [] as unknown[],
  facets: {} as Record<string, boolean>,
  facetError: false,
  response: {
    data: [] as unknown[],
    count: 0,
    error: null as null | { message: string },
  },
}));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({
    handler: (run: () => unknown) => run,
    inputValidator: (validate: (data: unknown) => unknown) => ({
      handler:
        (run: (args: { data: unknown }) => unknown) =>
        (input: { data: unknown }) =>
          run({ data: validate(input.data) }),
    }),
  }),
}));
vi.mock("../publicData.server", () => ({
  createPublicServerClient: () => {
    const query: Record<string, unknown> = {};
    let selected = "";
    let facet = "";
    for (const method of [
      "from",
      "select",
      "eq",
      "in",
      "neq",
      "ilike",
      "order",
      "limit",
    ])
      query[method] = (...args: unknown[]) => {
        mocks.calls.push([method, ...args]);
        if (method === "select") selected = String(args[0]);
        if (
          method === "eq" &&
          ["shop_category", "kind"].includes(String(args[0]))
        )
          facet = `${args[0]}:${args[1]}`;
        return query;
      };
    query.range = (...args: unknown[]) => {
      mocks.calls.push(["range", ...args]);
      return Promise.resolve(
        mocks.responses.length ? mocks.responses.shift() : mocks.response,
      );
    };
    query.abortSignal = (...args: unknown[]) => {
      mocks.calls.push(["abortSignal", ...args]);
      return Promise.resolve(
        selected === "id"
          ? {
              data: mocks.facets[facet] ? [{ id: "public" }] : [],
              error: mocks.facetError ? { message: "Facet unavailable" } : null,
            }
          : mocks.response,
      );
    };
    return query;
  },
}));
import {
  getShopCatalog,
  getShopShowcase,
  getStartHereOffers,
  getRelatedShopOffers,
} from "../shop.functions";
beforeEach(() => {
  mocks.calls = [];
  mocks.responses = [];
  mocks.facets = {};
  mocks.facetError = false;
  mocks.response = { data: [], count: 0, error: null };
});
describe("shop catalog boundaries", () => {
  it("loads named goal offers regardless of featured placement while respecting publication and funnel privacy", async () => {
    mocks.response.data = [{ id: "public-unfeatured-workshop" }];
    expect(await getStartHereOffers()).toEqual(mocks.response.data);
    for (const [field, value] of [
      ["status", "published"],
      ["show_in_shop", true],
      ["funnel_only", false],
    ])
      expect(mocks.calls).toContainEqual(["eq", field, value]);
    expect(mocks.calls).not.toContainEqual(["eq", "shop_featured", true]);
    expect(mocks.calls).toContainEqual([
      "in",
      "slug",
      ["ai-follow-up-starter-kit", "app-building-workshop"],
    ]);
    expect(mocks.calls).toContainEqual(["limit", 2]);
    mocks.response.error = { message: "Unavailable" };
    expect(await getStartHereOffers()).toEqual([]);
  });
  it("derives facets without extra calls when the complete public catalog fits on the first page", async () => {
    mocks.response = {
      data: [
        { shop_category: "tool", kind: "paid" },
        { shop_category: "resource", kind: "free" },
      ],
      count: 2,
      error: null,
    };
    const catalog = await getShopCatalog({ data: {} });
    expect(catalog.availableFilters).toEqual({
      categories: ["resource", "tool"],
      prices: ["free", "paid"],
    });
    expect(mocks.calls.filter(([method]) => method === "from")).toHaveLength(1);
  });
  it("keeps categories available beyond the current search, filter and page", async () => {
    mocks.response = {
      data: [{ shop_category: "resource", kind: "free" }],
      count: 1,
      error: null,
    };
    mocks.facets = {
      "shop_category:training": true,
      "shop_category:resource": true,
      "shop_category:course": true,
      "kind:free": true,
      "kind:paid": true,
    };
    const catalog = await getShopCatalog({
      data: { category: "resource", price: "free", q: "guide", page: 3 },
    });
    expect(catalog.availableFilters).toEqual({
      categories: ["training", "resource", "course"],
      prices: ["free", "paid"],
    });
    expect(
      mocks.calls.filter(
        ([method, columns]) => method === "select" && columns === "id",
      ),
    ).toHaveLength(6);
    expect(
      mocks.calls.filter(
        ([method, limit]) => method === "limit" && limit === 1,
      ),
    ).toHaveLength(6);
    for (const [field, value] of [
      ["status", "published"],
      ["show_in_shop", true],
      ["funnel_only", false],
    ]) {
      expect(
        mocks.calls.filter(
          ([method, key, requested]) =>
            method === "eq" && key === field && requested === value,
        ),
      ).toHaveLength(7);
    }
  });
  it("does not infer global availability from a partial first page", async () => {
    mocks.response = {
      data: [{ shop_category: "resource", kind: "free" }],
      count: 25,
      error: null,
    };
    mocks.facets = {
      "shop_category:resource": true,
      "shop_category:course": true,
      "kind:free": true,
      "kind:paid": true,
    };
    expect((await getShopCatalog({ data: {} })).availableFilters).toEqual({
      categories: ["resource", "course"],
      prices: ["free", "paid"],
    });
  });
  it("keeps the catalog usable when optional availability checks fail", async () => {
    mocks.response = { data: [{ id: "visible" }], count: 1, error: null };
    mocks.facetError = true;
    const catalog = await getShopCatalog({ data: { q: "guide" } });
    expect(catalog.items).toEqual([{ id: "visible" }]);
    expect(catalog.availableFilters).toBeNull();
  });
  it("keeps home merchandising public, featured, bounded, and optional", async () => {
    mocks.response.data = [{ id: "public-offer" }];
    expect(await getShopShowcase()).toEqual([{ id: "public-offer" }]);
    for (const [field, value] of [
      ["status", "published"],
      ["show_in_shop", true],
      ["funnel_only", false],
      ["shop_featured", true],
    ]) {
      expect(mocks.calls).toContainEqual(["eq", field, value]);
    }
    expect(mocks.calls).toContainEqual(["limit", 3]);
    mocks.response.error = { message: "Unavailable" };
    expect(await getShopShowcase()).toEqual([]);
  });
  it("related offers exclude the current product and never discover private funnels", async () => {
    const excludeId = "6689db7a-432b-41d9-8b73-2f89c32c67b4";
    await getRelatedShopOffers({ data: { excludeId } });
    expect(mocks.calls).toContainEqual(["neq", "id", excludeId]);
    expect(mocks.calls).toContainEqual(["eq", "status", "published"]);
    expect(mocks.calls).toContainEqual(["eq", "show_in_shop", true]);
    expect(mocks.calls).toContainEqual(["eq", "funnel_only", false]);
    expect(mocks.calls).toContainEqual(["limit", 2]);
    mocks.calls = [];
    expect(
      await getRelatedShopOffers({ data: { excludeId: "not-an-id" } }),
    ).toEqual([]);
    expect(mocks.calls).toEqual([]);
  });
  it("recovers an out-of-range page without exposing the fallback row", async () => {
    mocks.responses = [
      { data: null, count: null, error: { code: "PGRST103" } },
      {
        data: [{ title: "First row must not be duplicated here" }],
        count: 3,
        error: null,
      },
    ];
    const result = await getShopCatalog({ data: { page: 9 } });
    expect(result).toEqual({
      items: [],
      total: 3,
      page: 9,
      pageSize: SHOP_PAGE_SIZE,
      availableFilters: { categories: [], prices: [] },
    });
    expect(mocks.calls).toContainEqual(["range", 0, 0]);
  });
  it("normalizes malformed filters without trusting unknown keys or huge pages", () => {
    expect(shopFilters(null)).toEqual(shopFilters({}));
    expect(
      shopFilters({
        q: ["bad"],
        category: "toString",
        price: "anything",
        page: "NaN",
      }),
    ).toEqual({ q: "", category: "all", price: "all", page: 1 });
    expect(
      shopFilters({
        category: "course",
        price: "paid",
        q: `  ${"x".repeat(130)}  `,
        page: 999999,
      }),
    ).toEqual({
      q: "x".repeat(100),
      category: "course",
      price: "paid",
      page: 10000,
    });
    expect(shopFilters({ page: -1 }).page).toBe(1);
    expect(shopFilters({ page: 1.5 }).page).toBe(1);
  });
  it("preserves filters in shareable links and treats search wildcards literally", () => {
    expect(
      shopHref(
        shopFilters({
          category: "tool",
          price: "free",
          q: "AI & sales",
          page: 2,
        }),
      ),
    ).toBe("/shop?q=AI+%26+sales&category=tool&price=free&page=2");
    expect(shopHref(shopFilters({}))).toBe("/shop");
    expect(escapeShopSearch("50%_off\\today")).toBe("50\\%\\_off\\\\today");
  });
  it("always requires a published listed non-funnel offer and never selects private fields", async () => {
    await getShopCatalog({
      data: { category: "tool", price: "free", q: "50%_", page: 2 },
    });
    expect(mocks.calls).toContainEqual(["eq", "status", "published"]);
    expect(mocks.calls).toContainEqual(["eq", "show_in_shop", true]);
    expect(mocks.calls).toContainEqual(["eq", "funnel_only", false]);
    expect(mocks.calls).toContainEqual(["eq", "shop_category", "tool"]);
    expect(mocks.calls).toContainEqual(["eq", "kind", "free"]);
    expect(mocks.calls).toContainEqual(["ilike", "title", "%50\\%\\_%"]);
    expect(mocks.calls).toContainEqual([
      "range",
      SHOP_PAGE_SIZE,
      SHOP_PAGE_SIZE * 2 - 1,
    ]);
    expect(SHOP_COLUMNS).not.toMatch(
      /asset|email|next_offer|token|stripe|checkout_url|\*/,
    );
    expect(SHOP_COLUMNS.split(",")).toEqual(
      expect.arrayContaining([
        "checkout_mode",
        "price_display_mode",
        "external_url",
        "external_button_text",
        "is_affiliate",
        "affiliate_disclosure",
      ]),
    );
    expect(
      mocks.calls
        .filter(([method]) => method === "order")
        .map((call) => call[1]),
    ).toEqual(["shop_featured", "updated_at", "id"]);
  });
  it("returns accurate totals and shows failures instead of a misleading empty shop", async () => {
    mocks.response.count = 50;
    const result = await getShopCatalog({ data: { page: 3 } });
    expect(result).toMatchObject({
      total: 50,
      page: 3,
      pageSize: SHOP_PAGE_SIZE,
    });
    mocks.response.error = { message: "Database unavailable" };
    await expect(getShopCatalog({ data: {} })).rejects.toThrow(
      "The shop could not be loaded",
    );
  });
});
