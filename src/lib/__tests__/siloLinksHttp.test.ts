import {
  beforeAll,
  beforeEach,
  afterEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const h = vi.hoisted(() => ({
  authorize: vi.fn(),
  client: vi.fn(),
  rebuild: vi.fn(),
}));
vi.mock("https://esm.sh/@supabase/supabase-js@2.97.0", () => ({
  createClient: h.client,
}));
vi.mock("../../../supabase/functions/_shared/cronAuth.ts", () => ({
  authorizeCronOrAdmin: h.authorize,
}));
vi.mock(
  "../../../supabase/functions/build-silo-links/links.ts",
  async (original) => ({
    ...(await original<
      typeof import("../../../supabase/functions/build-silo-links/links")
    >()),
    rebuildSiloLinks: h.rebuild,
  }),
);
let handle: (request: Request) => Promise<Response>;
beforeAll(async () => {
  vi.stubGlobal("Deno", {
    serve: (fn: typeof handle) => {
      handle = fn;
    },
    env: { get: () => "configured" },
  });
  const path = "../../../supabase/functions/build-silo-links/index.ts";
  await import(path);
});
beforeEach(() => {
  vi.stubGlobal("Deno", { env: { get: () => "configured" } });
  h.authorize.mockResolvedValue({ ok: true, mode: "cron" });
  h.client.mockReturnValue({});
  h.rebuild.mockResolvedValue({ success: true, links_created: 1 });
});
afterEach(() => {
  vi.clearAllMocks();
});
const request = (body: unknown = { rebuild_all: true }) =>
  new Request("https://example.com/functions/v1/build-silo-links", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer verified-service-key",
    },
    body: JSON.stringify(body),
  });

describe("silo links HTTP authorization and errors", () => {
  it("honors verified internal authorization without requiring an auth user", async () => {
    expect((await handle(request())).status).toBe(200);
    expect(h.authorize).toHaveBeenCalledOnce();
    expect(h.rebuild).toHaveBeenCalledOnce();
  });
  it("stops an unauthorized caller before any storage access", async () => {
    h.authorize.mockResolvedValue(
      new Response("Unauthorized", { status: 401 }),
    );
    expect((await handle(request())).status).toBe(401);
    expect(h.client).not.toHaveBeenCalled();
    expect(h.rebuild).not.toHaveBeenCalled();
  });
  it("does not rebuild for invalid page ids or an unsupported method", async () => {
    expect((await handle(request({ page_id: "not-a-uuid" }))).status).toBe(400);
    expect(
      (
        await handle(
          new Request("https://example.com/functions/v1/build-silo-links"),
        )
      ).status,
    ).toBe(405);
    expect(h.rebuild).not.toHaveBeenCalled();
  });
  it("returns failure for a database refusal without leaking its internals", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    h.rebuild.mockRejectedValue(new Error("private database details"));
    const response = await handle(request());
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("private database details");
    vi.restoreAllMocks();
  });
});
