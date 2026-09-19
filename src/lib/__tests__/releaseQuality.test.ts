import { describe, it, expect } from "vitest";
import {
  buildRuntimeConfig,
  setupDefaults,
  setupSchema,
} from "@/config/runtime";
import { memberPreset } from "@/config/presets/member";
import { brianPreset } from "@/config/presets/brian";
import { articleReading, articleSources } from "@/lib/articleReading";
import { absoluteUrl, pageTitle } from "@/config/site";
import { brandStyles } from "@/config/brandStyles";
describe("member runtime branding", () => {
  const values = {
    ...setupDefaults(memberPreset),
    name: "Mira Design",
    initials: "MD",
    role: "Interior designer",
    niche: "Home design",
    siteUrl: "https://mira.example",
    headline: "Rooms for real life",
    description: "Practical design for homes and small spaces.",
    accent: "#5577AA",
    offerLabel: "Book a call",
    offerUrl: "https://mira.example/contact",
  };
  it("changes identity and metadata without inheriting owner proof or assets", () => {
    const next = buildRuntimeConfig(values);
    expect(next.identity.name).toBe("Mira Design");
    expect(next.metadata.defaultTitle).toContain("Mira Design");
    expect(next.hero.primaryCta?.href).toBe(values.offerUrl);
    expect(next.proofBadges).toEqual([]);
    expect(next.results).toEqual([]);
    expect(next.speaking.portraitSrc).toBeNull();
    expect(next.hero.videoSrc).toBeNull();
    expect(next.metadata.googleSiteVerification).toBeNull();
    expect(next.metadata.faviconHref).toBeNull();
    expect(JSON.stringify(next)).not.toMatch(
      /brianhanson|aiforbeginners|150,000/,
    );
    expect(absoluteUrl("/blog", next)).toBe("https://mira.example/blog");
    expect(pageTitle("Guides", next)).toBe("Guides | Mira Design");
    expect(
      brandStyles(next.brand)[
        "--brand-accent" as keyof ReturnType<typeof brandStyles>
      ],
    ).toBe("#5577AA");
  });
  it("keeps request configs isolated", () => {
    const a = buildRuntimeConfig(values);
    const b = buildRuntimeConfig({ ...values, name: "Second" });
    expect(a.identity.name).toBe("Mira Design");
    expect(b.identity.name).toBe("Second");
    expect(brianPreset.identity.name).toBe("Brian Hanson");
  });
  it("rejects unsafe or inconsistent configuration", () => {
    for (const patch of [
      { siteUrl: "https://example.com/path" },
      { logo: "javascript:alert(1)" },
      { favicon: "//host.test/x.png" },
      { accent: "#fff" },
      { offerLabel: "" },
    ])
      expect(setupSchema.safeParse({ ...values, ...patch }).success).toBe(
        false,
      );
  });
});
describe("article reading support", () => {
  it("produces safe unique heading anchors and readable labels", () => {
    const r = articleReading(
      '<h2 id="same">A &amp; B</h2><h3 id="same">A <em>detail</em></h3><script>alert(1)</script><h2>Next</h2>',
    );
    expect(r.headings.map((h) => h.id)).toEqual([
      "article-section-1",
      "article-section-2",
      "article-section-3",
    ]);
    expect(r.headings[0].title).toBe("A & B");
    expect(r.html).not.toContain("<script>");
    for (const h of r.headings) expect(r.html).toContain(`id="${h.id}"`);
  });
  it("omits unsafe/duplicate sources and cleans scraped labels", () => {
    expect(
      articleSources([
        { url: "javascript:alert(1)", title: "x" },
        { url: "https://example.com/source", title: "| noisy |" },
        { url: "https://example.com/source", title: "duplicate" },
      ]),
    ).toEqual([{ url: "https://example.com/source", title: "example.com" }]);
  });
});
