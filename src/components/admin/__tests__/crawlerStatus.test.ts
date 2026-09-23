import { describe, expect, it } from "vitest";
import {
  countSitemapUrls,
  describeIndexNowStatus,
  parseIndexNowStatus,
  robotsSitemapCheck,
} from "../site-settings/crawlerStatus";

describe("countSitemapUrls", () => {
  it("counts <loc> entries in the live sitemap", () => {
    const xml = `<?xml version="1.0"?><urlset>
      <url><loc>https://brianhanson.com/</loc></url>
      <url><loc>https://brianhanson.com/blog/a</loc><lastmod>2026-09-01</lastmod></url>
      <url><loc>https://brianhanson.com/guides/b</loc></url>
    </urlset>`;
    expect(countSitemapUrls(xml)).toBe(3);
  });
  it("returns null for a sitemap error document", () => {
    expect(countSitemapUrls("<error>sitemap unavailable</error>")).toBeNull();
    expect(countSitemapUrls("")).toBeNull();
  });
});

describe("robotsSitemapCheck", () => {
  const robots =
    "User-agent: *\nAllow: /\n\nSitemap: https://brianhanson.com/sitemap.xml\n";
  it("is ok when robots.txt points at this site's sitemap", () => {
    expect(robotsSitemapCheck(robots, "https://brianhanson.com")).toEqual({
      state: "ok",
      sitemapUrl: "https://brianhanson.com/sitemap.xml",
    });
  });
  it("warns only when the Sitemap host differs from the Site URL", () => {
    expect(robotsSitemapCheck(robots, "https://garden.example")).toEqual({
      state: "mismatch",
      sitemapUrl: "https://brianhanson.com/sitemap.xml",
      message:
        "robots.txt points crawlers to brianhanson.com, but your Site URL is garden.example.",
    });
  });
  it("reports a missing Sitemap line", () => {
    expect(
      robotsSitemapCheck("User-agent: *\nAllow: /", "https://brianhanson.com"),
    ).toEqual({ state: "missing" });
  });
  it("does not warn when the Site URL itself is unusable", () => {
    expect(robotsSitemapCheck(robots, "not a url")).toEqual({
      state: "ok",
      sitemapUrl: "https://brianhanson.com/sitemap.xml",
    });
  });
});

describe("IndexNow status", () => {
  const base = {
    key: "0123456789abcdef0123456789abcdef",
    received_total: 0,
    last_submission_at: null,
    last_submission_count: 0,
    last_error_at: null,
    last_error: null,
  };

  it("parses the admin RPC payload defensively", () => {
    expect(parseIndexNowStatus(null)).toEqual({
      key: null,
      receivedTotal: 0,
      lastSubmissionAt: null,
      lastSubmissionCount: 0,
      lastErrorAt: null,
      lastError: null,
    });
    expect(
      parseIndexNowStatus({
        ...base,
        received_total: 362,
        last_submission_at: "2026-09-24T08:00:00Z",
        last_submission_count: 362,
      }),
    ).toMatchObject({
      receivedTotal: 362,
      lastSubmissionAt: "2026-09-24T08:00:00Z",
      lastSubmissionCount: 362,
    });
  });

  it("never says 'working' before a single URL has been received", () => {
    expect(describeIndexNowStatus(parseIndexNowStatus(base))).toEqual({
      tone: "warn",
      headline: "Set up, but no URLs sent yet",
    });
  });

  it("surfaces the most recent error when it is newer than the last receipt", () => {
    expect(
      describeIndexNowStatus(
        parseIndexNowStatus({
          ...base,
          received_total: 10,
          last_submission_at: "2026-09-20T08:00:00Z",
          last_submission_count: 10,
          last_error_at: "2026-09-23T08:00:00Z",
          last_error: "The key file returned HTTP 404.",
        }),
      ),
    ).toEqual({
      tone: "bad",
      headline: "Last run failed",
      detail: "The key file returned HTTP 404.",
    });
  });

  it("reports healthy when the last receipt is newer than any error", () => {
    expect(
      describeIndexNowStatus(
        parseIndexNowStatus({
          ...base,
          received_total: 10,
          last_submission_at: "2026-09-23T08:00:00Z",
          last_submission_count: 4,
          last_error_at: "2026-09-20T08:00:00Z",
          last_error: "old",
        }),
      ),
    ).toEqual({ tone: "ok", headline: "Sending new pages" });
  });

  it("reports a missing key", () => {
    expect(
      describeIndexNowStatus(parseIndexNowStatus({ ...base, key: null })),
    ).toEqual({
      tone: "bad",
      headline: "No IndexNow key",
      detail:
        "Apply the latest database migration to create one. Nothing can be sent until then.",
    });
  });
});
