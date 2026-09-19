import { describe, expect, it, vi } from "vitest";
import { brianPreset } from "@/config/presets/brian";
vi.mock("@/pages/HTMLSitemap", () => ({ default: () => null }));
import { Route } from "@/routes/sitemap";
import { sitemapHead } from "../sitemapHead";

describe("HTML sitemap server metadata", () => {
  it("includes its own title and canonical before hydration", () => {
    expect(Route.options.head).toBe(sitemapHead);
    const result = sitemapHead({
      matches: [{ loaderData: { siteConfig: brianPreset } }],
    });
    expect(result.meta).toContainEqual({ title: "Sitemap | Brian Hanson" });
    expect(result.links).toContainEqual({
      rel: "canonical",
      href: "https://brianhanson.com/sitemap",
    });
  });
  it("uses the active brand rather than leaking the owner's identity", () => {
    const config = {
      ...brianPreset,
      identity: {
        ...brianPreset.identity,
        name: "Garden School",
        siteUrl: "https://garden.example",
      },
    };
    const result = sitemapHead({
      matches: [{ loaderData: { siteConfig: config } }],
    });
    expect(result.meta).toContainEqual({ title: "Sitemap | Garden School" });
    expect(result.links).toContainEqual({
      rel: "canonical",
      href: "https://garden.example/sitemap",
    });
    expect(JSON.stringify(result)).not.toContain("Brian Hanson");
  });
});
