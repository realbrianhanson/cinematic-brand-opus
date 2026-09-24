import { describe, expect, it } from "vitest";
import {
  isSummitUrl,
  SUMMIT_PLACEMENTS,
  summitHref,
  tagSummitLinksInHtml,
} from "../summitLink";

const summit = "https://go.aiforbusiness.com/summit?_go=brian60";

describe("Summit link tagging", () => {
  it("adds the site UTM set and placement while keeping the affiliate code", () => {
    const url = new URL(summitHref(summit, "sticky"));
    expect(url.origin + url.pathname).toBe(
      "https://go.aiforbusiness.com/summit",
    );
    expect(Object.fromEntries(url.searchParams)).toEqual({
      _go: "brian60",
      utm_source: "brianhanson.com",
      utm_medium: "site",
      utm_campaign: "summit",
      utm_content: "sticky",
    });
  });

  it("re-tags an already tagged link instead of duplicating parameters", () => {
    const retagged = summitHref(summitHref(summit, "hero"), "footer");
    const url = new URL(retagged);
    expect(url.searchParams.getAll("utm_content")).toEqual(["footer"]);
    expect(url.searchParams.getAll("utm_source")).toHaveLength(1);
    expect(url.searchParams.get("_go")).toBe("brian60");
  });

  it.each(SUMMIT_PLACEMENTS)("supports the %s placement", (placement) => {
    expect(
      new URL(summitHref(summit, placement)).searchParams.get("utm_content"),
    ).toBe(placement);
  });

  it.each([
    "/shop",
    "https://go.aiforbusiness.com/get-pushten",
    "http://go.aiforbusiness.com/summit",
    "https://go.aiforbusiness.com.example.com/summit",
    "https://go.aiforbusiness.com/summit/other",
    "mailto:brian@brianhanson.com",
    "not a url",
  ])("leaves non-Summit link %s untouched", (href) => {
    expect(isSummitUrl(href)).toBe(false);
    expect(summitHref(href, "nav")).toBe(href);
  });

  it("tags Summit links inside article HTML and leaves other markup alone", () => {
    const html =
      '<p>Join the <a href="https://go.aiforbusiness.com/summit?_go=brian60&amp;utm_source=blog" target="_blank" rel="noopener">AI for Business Summit</a>.</p>' +
      '<p><a href="https://example.com/?a=1&amp;b=2">Other</a></p>';
    const tagged = tagSummitLinksInHtml(html, "article-mid");
    expect(tagged).toContain("_go=brian60&amp;utm_source=brianhanson.com");
    expect(tagged).toContain("utm_content=article-mid");
    expect(tagged).not.toContain("utm_source=blog");
    expect(tagged).toContain(
      '<a href="https://example.com/?a=1&amp;b=2">Other</a>',
    );
    expect(tagged).toContain('target="_blank" rel="noopener"');
  });
});
