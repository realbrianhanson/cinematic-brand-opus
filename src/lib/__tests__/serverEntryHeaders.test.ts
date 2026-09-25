import { describe, expect, it, vi } from "vitest";

const upstream = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("@tanstack/react-start/server-entry", () => ({ default: upstream }));
// Never reach a real database from tests: an offline client exercises the
// "database unreachable" path of the automatic 404 redirect.
vi.mock("@/lib/publicData.server", () => ({
  createPublicServerClient: () => {
    throw new Error("offline in tests");
  },
}));

import server from "@/server";

describe("server entry", () => {
  it("adds framing protection to admin responses", async () => {
    upstream.fetch.mockResolvedValue(
      new Response("<html></html>", {
        headers: { "content-type": "text/html" },
      }),
    );
    const res = await server.fetch(
      new Request("https://brianhanson.com/admin/login"),
      {},
      {},
    );
    expect(res.headers.get("x-frame-options")).toBe("DENY");
    expect(res.headers.get("content-security-policy")).toBe(
      "frame-ancestors 'none'",
    );
  });

  it("protects the fallback error page too", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    upstream.fetch.mockRejectedValue(new Error("boom"));
    const res = await server.fetch(
      new Request("https://brianhanson.com/admin"),
      {},
      {},
    );
    expect(res.status).toBe(500);
    expect(res.headers.get("x-frame-options")).toBe("DENY");
  });

  it("leaves public pages untouched", async () => {
    upstream.fetch.mockResolvedValue(new Response("ok"));
    const res = await server.fetch(
      new Request("https://brianhanson.com/blog"),
      {},
      {},
    );
    expect(res.headers.get("x-frame-options")).toBeNull();
  });
});

describe("server entry missing pages", () => {
  it("preserves an HTML 404 and its body when the database is unreachable", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    upstream.fetch.mockResolvedValue(
      new Response("<html>missing</html>", {
        status: 404,
        headers: { "content-type": "text/html; charset=utf-8" },
      }),
    );
    const res = await server.fetch(
      new Request("https://brianhanson.com/case-studies"),
      {},
      {},
    );
    expect(res.status).toBe(404);
    expect(res.headers.get("location")).toBeNull();
    expect(await res.text()).toBe("<html>missing</html>");
  });

  it("keeps real 404s for files and admin pages", async () => {
    for (const path of ["/robots-old.txt", "/admin/nope"]) {
      upstream.fetch.mockResolvedValue(
        new Response("<html>missing</html>", {
          status: 404,
          headers: { "content-type": "text/html" },
        }),
      );
      const res = await server.fetch(
        new Request(`https://brianhanson.com${path}`),
        {},
        {},
      );
      expect(res.status, path).toBe(404);
    }
  });
});
