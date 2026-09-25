import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type { SearchPerformanceRow } from "../../../supabase/functions/_shared/searchFreshness";

const h = vi.hoisted(() => ({
  authorize: vi.fn(),
  client: vi.fn(),
  rows: [] as SearchPerformanceRow[],
  searchError: false,
  dateError: false,
  ranges: [] as number[],
  updates: [] as unknown[],
}));
vi.mock("https://esm.sh/@supabase/supabase-js@2.97.0", () => ({
  createClient: h.client,
}));
vi.mock("../../../supabase/functions/_shared/cronAuth.ts", () => ({
  authorizeCronOrAdmin: h.authorize,
}));
let handle: (request: Request) => Promise<Response>;

function client() {
  return {
    from(table: string) {
      let from = 0,
        to = 999,
        stale = false,
        payload: unknown;
      const result = () => {
        if (table === "site_settings")
          return { data: { site_url: "https://example.test" }, error: null };
        if (table === "gsc_performance")
          return {
            data: h.rows.slice(from, to + 1),
            error: h.searchError ? { message: "unavailable" } : null,
          };
        if (payload) {
          h.updates.push(payload);
          return { data: null, error: null };
        }
        return {
          data: stale
            ? []
            : [
                {
                  id: "resource",
                  slug: "workflow",
                  content_schemas: { slug: "guides" },
                },
              ],
          error: stale && h.dateError ? { message: "unavailable" } : null,
        };
      };
      const query = {
        select: () => query,
        order: () => query,
        eq: () => query,
        or: () => {
          stale = true;
          return query;
        },
        limit: () => query,
        maybeSingle: async () => result(),
        range: (start: number, end: number) => {
          from = start;
          to = end;
          h.ranges.push(start);
          return query;
        },
        update: (value: unknown) => {
          payload = value;
          return query;
        },
        in: () => query,
        then: <T>(resolve: (value: ReturnType<typeof result>) => T) =>
          Promise.resolve(result()).then(resolve),
      };
      return query;
    },
  };
}

beforeAll(async () => {
  vi.stubGlobal("Deno", {
    serve: (fn: typeof handle) => {
      handle = fn;
    },
    env: { get: () => "configured" },
  });
  const path = "../../../supabase/functions/check-content-freshness/index.ts";
  await import(path);
});
beforeEach(() => {
  vi.stubGlobal("Deno", { env: { get: () => "configured" } });
  h.authorize.mockResolvedValue({ ok: true });
  h.client.mockImplementation(client);
  h.rows = [];
  h.searchError = false;
  h.dateError = false;
  h.ranges = [];
  h.updates = [];
});
afterEach(() => {
  vi.restoreAllMocks();
});
const request = () =>
  new Request("https://example.test/check-content-freshness", {
    method: "POST",
  });
const row = (old = false): SearchPerformanceRow => ({
  page_url: "https://example.test/resources/guides/workflow",
  query: "workflow",
  clicks: old ? 20 : 10,
  impressions: 100,
  position: 4,
  period_start: old ? "2026-07-31" : "2026-08-28",
  period_end: old ? "2026-08-27" : "2026-09-24",
});

describe("search freshness endpoint", () => {
  it("does not flag a fresh page based on a single search import", async () => {
    h.rows = [row()];
    const response = await handle(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ flagged: 0 });
    expect(h.updates).toEqual([]);
  });
  it("reads beyond the API row cap before comparing reporting periods", async () => {
    h.rows = Array.from({ length: 1000 }, (_, index) => ({
      ...row(),
      query: `query${index}`,
    }));
    h.rows.push({ ...row(true), query: "query0" });
    const response = await handle(request());
    expect(await response.json()).toMatchObject({
      gsc_declining: 1,
      page_ids: ["resource"],
    });
    expect(h.ranges).toEqual([0, 1000]);
  });
  it.each(["searchError", "dateError"] as const)(
    "does not claim freshness when %s occurs",
    async (key) => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      h[key] = true;
      const response = await handle(request());
      expect(response.status).toBe(500);
      expect(h.updates).toEqual([]);
    },
  );
  it("does no reads for an unauthorized request", async () => {
    h.client.mockClear();
    h.authorize.mockResolvedValue(
      new Response("Unauthorized", { status: 401 }),
    );
    expect((await handle(request())).status).toBe(401);
    expect(h.client).not.toHaveBeenCalled();
  });
});
