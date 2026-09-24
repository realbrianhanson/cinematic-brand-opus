import { beforeEach, describe, expect, it, vi } from "vitest";
const database = vi.hoisted(() => ({
  failure: "",
  requests: [] as string[],
  columns: {} as Record<string, string>,
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      database.requests.push(table);
      const query = {
        select: (columns: string) => {
          database.columns[table] = columns;
          return query;
        },
        order: () => query,
        limit: () => query,
        eq: () => query,
        not: () => query,
        maybeSingle: () => query,
        then: (resolve: (value: unknown) => unknown) =>
          Promise.resolve(
            resolve({
              data:
                table === "site_settings_private"
                  ? {
                      auto_publish_enabled: false,
                      auto_publish_daily_cap: 2,
                      auto_publish_min_quality: 87,
                    }
                  : [],
              error:
                table === database.failure
                  ? new Error(`${table} unavailable`)
                  : null,
            }),
          ),
      };
      return query;
    },
  },
}));
import { loadContentQueue } from "../contentQueueData";
describe("queue snapshot loading", () => {
  beforeEach(() => {
    database.failure = "";
    database.requests = [];
  });
  it.each([
    "content_opportunities",
    "posts",
    "source_items",
    "site_settings_private",
  ])(
    "does not silently turn a failed %s query into an empty queue",
    async (table) => {
      database.failure = table;
      await expect(loadContentQueue()).rejects.toThrow(`${table} unavailable`);
    },
  );
  it("uses the saved automation settings instead of assuming the pipeline is enabled", async () => {
    expect((await loadContentQueue()).settings).toEqual({
      auto_publish_enabled: false,
      auto_publish_daily_cap: 2,
      auto_publish_min_quality: 87,
    });
  });
  it("loads each held draft's plain-English hold reason", async () => {
    await loadContentQueue();
    expect(database.columns.posts).toMatch(/\bheld_reason\b/);
    expect(database.columns.posts).toMatch(/\bheld_at\b/);
  });
});
