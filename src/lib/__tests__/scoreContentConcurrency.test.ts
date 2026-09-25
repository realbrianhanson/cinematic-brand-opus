import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const h = vi.hoisted(() => ({
  client: vi.fn(),
  concurrentEdit: false,
  updateError: null as { message: string } | null,
  updates: [] as { payload: unknown; filters: [string, unknown][] }[],
}));
vi.mock("https://esm.sh/@supabase/supabase-js@2", () => ({
  createClient: h.client,
}));
let handle: (request: Request) => Promise<Response>;
const originalVersion = "2026-09-24T00:00:00Z";
const storedPage = {
  id: "page",
  title: "A practical guide",
  status: "draft",
  updated_at: originalVersion,
  content_json: {
    introduction: "A practical guide to help business owners save time.",
  },
};
function client() {
  return {
    auth: {
      getUser: async () => ({ data: { user: { id: "admin" } }, error: null }),
    },
    from(table: string) {
      let payload: unknown;
      const filters: [string, unknown][] = [];
      const result = () => {
        if (table === "user_roles")
          return { data: { role: "admin" }, error: null };
        if (payload) {
          h.updates.push({ payload, filters });
          const expected = filters.find(([key]) => key === "updated_at")?.[1];
          const current = h.concurrentEdit
            ? "2026-09-25T00:00:00Z"
            : originalVersion;
          return {
            data: expected === current ? { id: "page" } : null,
            error: h.updateError,
          };
        }
        return { data: storedPage, error: null };
      };
      const query = {
        select: () => query,
        eq: (column: string, value: unknown) => {
          filters.push([column, value]);
          return query;
        },
        update: (value: unknown) => {
          payload = value;
          return query;
        },
        single: async () => result(),
        maybeSingle: async () => result(),
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
  const path = "../../../supabase/functions/score-content-quality/index.ts";
  await import(path);
});
beforeEach(() => {
  vi.stubGlobal("Deno", { env: { get: () => "configured" } });
  h.client.mockImplementation(client);
  h.concurrentEdit = false;
  h.updateError = null;
  h.updates = [];
});
afterEach(() => vi.clearAllMocks());
const request = (preview = false) =>
  new Request("https://example.com/functions/v1/score-content-quality", {
    method: "POST",
    headers: {
      Authorization: "Bearer admin-token",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      page_id: "page",
      ...(preview ? { content_json: storedPage.content_json } : {}),
    }),
  });

describe("quality score source version", () => {
  it("persists a score only for the version that was read", async () => {
    const response = await handle(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ persisted: true });
    expect(h.updates[0].filters).toContainEqual([
      "updated_at",
      originalVersion,
    ]);
  });
  it("refuses a stale score when another editor changes the page during scoring", async () => {
    h.concurrentEdit = true;
    const response = await handle(request());
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      persisted: false,
      error: expect.stringMatching(/page changed/),
    });
  });
  it("still scores an unsaved preview without writing anything", async () => {
    const response = await handle(request(true));
    expect(response.status).toBe(200);
    expect(h.updates).toHaveLength(0);
  });
});
