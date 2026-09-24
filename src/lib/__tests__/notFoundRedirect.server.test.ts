import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ADMIN_PREVIEW_COOKIE,
  redirectForNotFound,
  type NotFoundLookup,
} from "@/lib/notFoundRedirect.server";

const html404 = () =>
  new Response("<html>missing</html>", {
    status: 404,
    headers: { "content-type": "text/html; charset=utf-8" },
  });

function lookup(overrides: Partial<NotFoundLookup> = {}): NotFoundLookup {
  return {
    resolve: vi.fn(async () => null),
    record: vi.fn(async () => undefined),
    ...overrides,
  };
}

const get = (path: string, init: RequestInit = {}) =>
  new Request(`https://brianhanson.com${path}`, init);

describe("redirectForNotFound", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("sends an unknown page home with a 302 and records it", async () => {
    const deps = lookup();
    const res = await redirectForNotFound(
      get("/Case-Studies/?utm_source=fb", {
        headers: {
          referer: "https://www.google.com/search?q=secret",
          "user-agent": "Mozilla/5.0 Chrome/120",
        },
      }),
      html404(),
      deps,
    );
    expect(res?.status).toBe(302);
    expect(res?.headers.get("location")).toBe("/?utm_source=fb");
    expect(res?.headers.get("cache-control")).toBe("no-store");
    expect(deps.resolve).toHaveBeenCalledWith("/case-studies");
    expect(deps.record).toHaveBeenCalledWith(
      "/case-studies",
      "https://www.google.com/search",
      "human",
    );
  });

  it("follows a saved rule with its own status code and does not record", async () => {
    const deps = lookup({
      resolve: vi.fn(async () => ({ to_path: "/about", status_code: 301 })),
    });
    const res = await redirectForNotFound(get("/my-story"), html404(), deps);
    expect(res?.status).toBe(301);
    expect(res?.headers.get("location")).toBe("/about");
    expect(deps.record).not.toHaveBeenCalled();
  });

  it("supports external https targets", async () => {
    const deps = lookup({
      resolve: vi.fn(async () => ({
        to_path: "https://go.aiforbusiness.com/summit",
        status_code: 302,
      })),
    });
    const res = await redirectForNotFound(get("/summit?x=1"), html404(), deps);
    expect(res?.headers.get("location")).toBe(
      "https://go.aiforbusiness.com/summit",
    );
  });

  it("ignores a malformed rule and still goes home", async () => {
    const deps = lookup({
      resolve: vi.fn(async () => ({
        to_path: "//evil.example",
        status_code: 301,
      })),
    });
    const res = await redirectForNotFound(get("/old"), html404(), deps);
    expect(res?.status).toBe(302);
    expect(res?.headers.get("location")).toBe("/");
  });

  it("classifies crawlers as bots", async () => {
    const deps = lookup();
    await redirectForNotFound(
      get("/revven", { headers: { "user-agent": "Googlebot/2.1" } }),
      html404(),
      deps,
    );
    expect(deps.record).toHaveBeenCalledWith("/revven", null, "bot");
  });

  it("covers route loaders that throw notFound (blog, guides, offers)", async () => {
    for (const path of [
      "/blog/deleted-post",
      "/guides/old-guide",
      "/offers/retired",
    ]) {
      const res = await redirectForNotFound(get(path), html404(), lookup());
      expect(res?.status, path).toBe(302);
    }
  });

  it("still redirects home when the database is down", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const deps = lookup({
      resolve: vi.fn(async () => {
        throw new Error("offline");
      }),
    });
    const res = await redirectForNotFound(
      get("/social-media"),
      html404(),
      deps,
    );
    expect(res?.status).toBe(302);
    expect(res?.headers.get("location")).toBe("/");
    expect(deps.record).not.toHaveBeenCalled();
  });

  it("gives up on a slow database within the time budget", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const deps = lookup({
      resolve: vi.fn(() => new Promise<null>(() => {})),
    });
    const started = Date.now();
    const res = await redirectForNotFound(get("/slow"), html404(), deps, {
      timeoutMs: 50,
    });
    expect(Date.now() - started).toBeLessThan(1000);
    expect(res?.headers.get("location")).toBe("/");
  });

  it("goes home when a record failure happens after no rule", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const deps = lookup({
      record: vi.fn(async () => {
        throw new Error("write failed");
      }),
    });
    const res = await redirectForNotFound(get("/x"), html404(), deps);
    expect(res?.headers.get("location")).toBe("/");
  });

  it("handles HEAD requests", async () => {
    const res = await redirectForNotFound(
      get("/newsletter", { method: "HEAD" }),
      html404(),
      lookup(),
    );
    expect(res?.status).toBe(302);
  });

  describe("leaves the response alone", () => {
    it.each([
      ["/admin/nope", "admin"],
      ["/api/public/x", "api"],
      ["/assets/app-123.js", "assets"],
      ["/robots.txt", "file"],
      ["/images/photo.png", "file"],
      ["/wp-login", "scanner"],
    ])("for %s (%s)", async (path) => {
      const deps = lookup();
      expect(await redirectForNotFound(get(path), html404(), deps)).toBeNull();
      expect(deps.resolve).not.toHaveBeenCalled();
    });

    it("for non-404 responses", async () => {
      const deps = lookup();
      const ok = new Response("ok", {
        status: 200,
        headers: { "content-type": "text/html" },
      });
      expect(await redirectForNotFound(get("/x"), ok, deps)).toBeNull();
      const err = new Response("err", {
        status: 500,
        headers: { "content-type": "text/html" },
      });
      expect(await redirectForNotFound(get("/x"), err, deps)).toBeNull();
    });

    it("for non-HTML 404s", async () => {
      const json = new Response("{}", {
        status: 404,
        headers: { "content-type": "application/json" },
      });
      expect(await redirectForNotFound(get("/x"), json, lookup())).toBeNull();
    });

    it("for writes", async () => {
      expect(
        await redirectForNotFound(
          get("/x", { method: "POST", body: "a" }),
          html404(),
          lookup(),
        ),
      ).toBeNull();
    });

    it("for an admin previewing a draft article", async () => {
      const req = get("/blog/draft-post", {
        headers: { cookie: `theme=dark; ${ADMIN_PREVIEW_COOKIE}=1` },
      });
      expect(await redirectForNotFound(req, html404(), lookup())).toBeNull();
    });
  });

  it("does not let the preview cookie keep other missing pages", async () => {
    const req = get("/my-story", {
      headers: { cookie: `${ADMIN_PREVIEW_COOKIE}=1` },
    });
    const res = await redirectForNotFound(req, html404(), lookup());
    expect(res?.status).toBe(302);
  });
});
