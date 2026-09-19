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
  response: {
    data: [] as unknown[],
    count: 0,
    error: null as null | { message: string },
  },
}));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({
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
    for (const method of ["from", "select", "eq", "ilike", "order"])
      query[method] = (...args: unknown[]) => {
        mocks.calls.push([method, ...args]);
        return query;
      };
    query.range = (...args: unknown[]) => {
      mocks.calls.push(["range", ...args]);
      return Promise.resolve(
        mocks.responses.length ? mocks.responses.shift() : mocks.response,
      );
    };
    return query;
  },
}));
import { getShopCatalog } from "../shop.functions";
beforeEach(() => {
  mocks.calls = [];
  mocks.responses = [];
  mocks.response = { data: [], count: 0, error: null };
});
describe("shop catalog boundaries", () => {
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
      /asset|email|next_offer|token|checkout|\*/,
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
