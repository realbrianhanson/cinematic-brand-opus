import { beforeEach, describe, expect, it, vi } from "vitest";
const database = vi.hoisted(() => ({
  requests: [] as { table: string; filters: unknown[][]; select?: unknown[] }[],
  failure: "",
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      const request: (typeof database.requests)[number] = {
        table,
        filters: [],
      };
      database.requests.push(request);
      const query = {
        select: (...args: unknown[]) => {
          request.select = args;
          return query;
        },
        eq: (...args: unknown[]) => {
          request.filters.push(["eq", ...args]);
          return query;
        },
        gt: (...args: unknown[]) => {
          request.filters.push(["gt", ...args]);
          return query;
        },
        lt: (...args: unknown[]) => {
          request.filters.push(["lt", ...args]);
          return query;
        },
        in: (...args: unknown[]) => {
          request.filters.push(["in", ...args]);
          return query;
        },
        not: (...args: unknown[]) => {
          request.filters.push(["not", ...args]);
          return query;
        },
        then: (resolve: (value: unknown) => unknown) =>
          Promise.resolve(
            resolve({
              count: 7,
              error:
                database.failure === table ? new Error("unavailable") : null,
            }),
          ),
      };
      return query;
    },
  },
}));
import { loadDashboardOverview } from "../dashboardData";
describe("business overview counts", () => {
  beforeEach(() => {
    database.requests = [];
    database.failure = "";
  });
  it("counts fulfilled paid orders separately from free claims without estimating external sales", async () => {
    const data = await loadDashboardOverview();
    expect(data.paidOrders).toBe(7);
    const orders = database.requests.filter(
      (request) => request.table === "offer_orders",
    );
    expect(orders).toHaveLength(2);
    expect(orders[0].filters).toEqual([
      ["eq", "status", "fulfilled"],
      ["gt", "amount_minor", 0],
    ]);
    expect(orders[1].filters).toEqual([
      ["eq", "status", "fulfilled"],
      ["eq", "amount_minor", 0],
    ]);
    for (const request of database.requests)
      expect(request.select?.[1]).toEqual({ count: "exact", head: true });
  });
  it("only considers confirmed subscribers, public shop inventory and native payment setup", async () => {
    await loadDashboardOverview();
    expect(
      database.requests.find(
        (request) => request.table === "newsletter_subscribers",
      )?.filters,
    ).toContainEqual(["eq", "status", "confirmed"]);
    const offers = database.requests.filter(
      (request) => request.table === "offers",
    );
    expect(offers[0].filters).toEqual([
      ["eq", "status", "published"],
      ["eq", "show_in_shop", true],
      ["eq", "funnel_only", false],
    ]);
    expect(offers[1].filters).toContainEqual(["eq", "checkout_mode", "native"]);
  });
  it("fails visibly when a count is unavailable instead of manufacturing zero", async () => {
    database.failure = "offer_orders";
    await expect(loadDashboardOverview()).rejects.toThrow("unavailable");
  });
});
