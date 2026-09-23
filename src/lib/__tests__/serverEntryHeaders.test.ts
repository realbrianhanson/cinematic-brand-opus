import { describe, expect, it, vi } from "vitest";

const upstream = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("@tanstack/react-start/server-entry", () => ({ default: upstream }));

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
