import { describe, expect, it } from "vitest";
import { withSecurityHeaders } from "../securityHeaders";

const req = (url: string) => new Request(url);
const html = () =>
  new Response("<html></html>", {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
  });

describe("framing protection", () => {
  it.each([
    "https://brianhanson.com/admin",
    "https://brianhanson.com/admin/",
    "https://brianhanson.com/admin/login",
    "https://brianhanson.com/admin/reset-password",
    "https://brianhanson.com/admin/posts/123/edit?x=1",
    "https://cinematic-brand-opus.lovable.app/admin/settings",
  ])("forbids framing %s", async (url) => {
    const res = withSecurityHeaders(req(url), html());
    expect(res.headers.get("x-frame-options")).toBe("DENY");
    expect(res.headers.get("content-security-policy")).toBe(
      "frame-ancestors 'none'",
    );
    expect(await res.text()).toBe("<html></html>");
  });

  it.each([
    "https://brianhanson.com/",
    "https://brianhanson.com/blog/some-post",
    "https://brianhanson.com/administrator-guide",
  ])("leaves public page %s framable", (url) => {
    const res = withSecurityHeaders(req(url), html());
    expect(res.headers.get("x-frame-options")).toBeNull();
    expect(res.headers.get("content-security-policy")).toBeNull();
  });

  it("lets only the Lovable editor frame admin pages on preview hosts", () => {
    for (const host of [
      "id-preview--4f1c.lovable.app",
      "preview--cinematic.lovable.app",
      "4f1c.lovableproject.com",
    ]) {
      const res = withSecurityHeaders(req(`https://${host}/admin`), html());
      expect(res.headers.get("x-frame-options")).toBeNull();
      expect(res.headers.get("content-security-policy")).toBe(
        "frame-ancestors 'self' https://lovable.dev https://*.lovable.dev",
      );
    }
  });

  it("preserves status, other headers and an existing policy", () => {
    const original = new Response(null, {
      status: 302,
      headers: {
        location: "/admin/login",
        "set-cookie": "a=1",
        "content-security-policy": "default-src 'self'",
      },
    });
    const res = withSecurityHeaders(
      req("https://brianhanson.com/admin"),
      original,
    );
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/admin/login");
    expect(res.headers.get("set-cookie")).toBe("a=1");
    expect(res.headers.get("content-security-policy")).toBe(
      "default-src 'self'; frame-ancestors 'none'",
    );
  });

  it("does not override a route that already set frame-ancestors", () => {
    const original = new Response("x", {
      headers: { "content-security-policy": "frame-ancestors 'self'" },
    });
    const res = withSecurityHeaders(
      req("https://brianhanson.com/admin"),
      original,
    );
    expect(res.headers.get("content-security-policy")).toBe(
      "frame-ancestors 'self'",
    );
  });

  it("works on responses with immutable headers", () => {
    const res = withSecurityHeaders(
      req("https://brianhanson.com/admin"),
      Response.redirect("https://brianhanson.com/admin/login", 302),
    );
    expect(res.headers.get("x-frame-options")).toBe("DENY");
    expect(res.headers.get("location")).toBe(
      "https://brianhanson.com/admin/login",
    );
  });
});
