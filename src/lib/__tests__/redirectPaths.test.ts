import { describe, expect, it } from "vitest";
import {
  buildRedirectLocation,
  classifyUserAgent,
  isContentPreviewPath,
  isRedirectEligiblePath,
  normalizeRedirectPath,
  sanitizeReferrer,
  validateRedirectTarget,
} from "../../../supabase/functions/_shared/redirectPaths";

describe("normalizeRedirectPath", () => {
  it.each([
    ["/My-Story", "/my-story"],
    ["/my-story/", "/my-story"],
    ["  /contact  ", "/contact"],
    ["/case-studies?utm_source=x#top", "/case-studies"],
    ["//blog//old-post//", "/blog/old-post"],
    ["/", "/"],
    ["/?q=1", "/"],
    ["/Blog/%E2%9C%93", "/blog/%e2%9c%93"],
  ])("normalizes %j to %j", (input, expected) => {
    expect(normalizeRedirectPath(input)).toBe(expected);
  });

  it.each([
    ["", "empty"],
    ["my-story", "relative"],
    ["https://evil.example/x", "absolute URL"],
    ["/a b", "whitespace"],
    ["/a\u0000b", "control character"],
    ["/a\\b", "backslash"],
    ["/a/../admin", "dot segment"],
    ["/./x", "dot segment"],
    [`/${"a".repeat(512)}`, "too long"],
    [null, "not a string"],
    [42, "not a string"],
  ])("rejects %j (%s)", (input, _reason) => {
    expect(normalizeRedirectPath(input)).toBeNull();
  });

  it("measures length after dropping the query string", () => {
    expect(normalizeRedirectPath(`/ok?${"q".repeat(900)}`)).toBe("/ok");
  });
});

describe("isRedirectEligiblePath", () => {
  it.each([
    "/my-story",
    "/case-studies",
    "/social-media",
    "/revven",
    "/blog/a-missing-post",
    "/guides/old-guide",
    "/resources/templates/gone",
    "/offers/retired",
    "/newsletter",
  ])("redirects %s", (path) => {
    expect(isRedirectEligiblePath(path)).toBe(true);
  });

  it.each([
    ["/", "home itself"],
    ["/admin", "admin"],
    ["/admin/nope", "admin"],
    ["/Admin/Nope", "admin in any case"],
    ["/api/public/thing", "api"],
    ["/api", "api"],
    ["/assets/index-abc.js", "assets"],
    ["/_serverFn/abc", "framework internals"],
    ["/.well-known/security.txt", "well-known"],
    ["/.env", "dot file"],
    ["/robots.txt", "file with extension"],
    ["/sitemap-2.xml", "file with extension"],
    ["/images/logo.png", "file with extension"],
    ["/favicon.ico", "file with extension"],
    ["/wp-login.php", "scanner probe"],
    ["/wp-admin/setup-config", "scanner probe"],
    ["/cgi-bin/test", "scanner probe"],
    ["relative", "invalid"],
  ])("keeps the real 404 for %s (%s)", (path) => {
    expect(isRedirectEligiblePath(path)).toBe(false);
  });
});

describe("isContentPreviewPath", () => {
  it.each([
    ["/blog/draft-post", true],
    ["/guides/draft", true],
    ["/resources/templates/draft", true],
    ["/resources/templates", true],
    ["/news/123", true],
    ["/offers/draft-offer", true],
    ["/my-story", false],
    ["/blog", false],
  ])("%s -> %s", (path, expected) => {
    expect(isContentPreviewPath(path)).toBe(expected);
  });
});

describe("validateRedirectTarget", () => {
  it.each([
    ["/about", "/about"],
    [" /speaking ", "/speaking"],
    ["/blog?category=ai", "/blog?category=ai"],
    ["/", "/"],
    [
      "https://go.aiforbusiness.com/summit",
      "https://go.aiforbusiness.com/summit",
    ],
    ["https://example.com", "https://example.com"],
  ])("accepts %j", (input, expected) => {
    expect(validateRedirectTarget(input)).toEqual({
      ok: true,
      value: expected,
    });
  });

  it.each([
    ["", "empty"],
    ["about", "relative"],
    ["//evil.example", "protocol relative"],
    ["http://example.com", "plain http"],
    ["javascript:alert(1)", "script"],
    ["https://user:pw@example.com", "credentials"],
    ["https://exa mple.com", "whitespace"],
    ["/a b", "whitespace"],
    ["/a\\b", "backslash"],
    [`/${"a".repeat(600)}`, "too long"],
    [`https://example.com/${"a".repeat(2100)}`, "too long"],
  ])("rejects %j (%s)", (input, _reason) => {
    expect(validateRedirectTarget(input).ok).toBe(false);
  });

  it("explains errors in plain English with no trailing period", () => {
    const result = validateRedirectTarget("about");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/\//);
      expect(result.error.endsWith(".")).toBe(false);
    }
  });
});

describe("buildRedirectLocation", () => {
  it("carries the visitor's query string to a site path", () => {
    expect(buildRedirectLocation("/about", "?utm_source=fb")).toBe(
      "/about?utm_source=fb",
    );
  });
  it("keeps a target's own query string", () => {
    expect(buildRedirectLocation("/blog?category=ai", "?utm_source=fb")).toBe(
      "/blog?category=ai",
    );
  });
  it("never appends to an external URL", () => {
    expect(buildRedirectLocation("https://x.example/a", "?q=1")).toBe(
      "https://x.example/a",
    );
  });
  it("handles an empty query", () => {
    expect(buildRedirectLocation("/", "")).toBe("/");
  });
});

describe("classifyUserAgent", () => {
  it.each([
    [
      "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
      "bot",
    ],
    ["Mozilla/5.0 (compatible; bingbot/2.0)", "bot"],
    ["facebookexternalhit/1.1", "bot"],
    ["curl/8.4.0", "bot"],
    ["python-requests/2.31", "bot"],
    ["Mozilla/5.0 (X11; Linux x86_64) HeadlessChrome/120", "bot"],
    [
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120 Safari/537.36",
      "human",
    ],
    ["", "unknown"],
    [null, "unknown"],
    ["SomethingElse/1.0", "unknown"],
  ])("%j -> %s", (ua, expected) => {
    expect(classifyUserAgent(ua)).toBe(expected);
  });
});

describe("sanitizeReferrer", () => {
  it("keeps only origin and path", () => {
    expect(
      sanitizeReferrer("https://www.google.com/search?q=brian+hanson&token=x"),
    ).toBe("https://www.google.com/search");
  });
  it("drops non-web and malformed referrers", () => {
    expect(sanitizeReferrer("android-app://com.google")).toBeNull();
    expect(sanitizeReferrer("not a url")).toBeNull();
    expect(sanitizeReferrer("")).toBeNull();
    expect(sanitizeReferrer(undefined)).toBeNull();
  });
  it("truncates long referrers", () => {
    const value = sanitizeReferrer(`https://example.com/${"a".repeat(900)}`);
    expect(value?.length).toBe(300);
  });
});
