import { describe, expect, it } from "vitest";
import { memberPreset } from "../presets/member";
import { brianPreset } from "../presets/brian";
import { validateSiteConfig, SiteConfigError } from "../types";
import { PRESETS, ACTIVE_PRESET } from "../site";

/** Everything that must never appear in a generic member install. */
const BRIAN_MARKERS = [
  "Brian",
  "Hanson",
  "brianhanson.com",
  "aiforbeginners.com",
  "Inc. 5000",
  "150,000",
  "Revven",
  "$50M",
];

const serialize = (value: unknown) => JSON.stringify(value);

describe("member preset", () => {
  it("contains no personal identity, domain, CTA or proof from the live site", () => {
    const dump = serialize(memberPreset);
    for (const marker of BRIAN_MARKERS) {
      expect(dump).not.toContain(marker);
    }
  });

  it("ships no fabricated proof", () => {
    expect(memberPreset.proofBadges).toHaveLength(0);
    expect(memberPreset.results).toHaveLength(0);
    expect(memberPreset.speaking.testimonial).toBeNull();
    expect(memberPreset.story.timeline).toHaveLength(0);
    expect(memberPreset.expertise.cards).toHaveLength(0);
  });

  it("hides every section it has no truthful content for", () => {
    expect(memberPreset.sections.proofBar).toBe(false);
    expect(memberPreset.sections.story).toBe(false);
    expect(memberPreset.sections.expertise).toBe(false);
    expect(memberPreset.sections.results).toBe(false);
    expect(memberPreset.sections.event).toBe(false);
    expect(memberPreset.sections.speaking).toBe(false);
  });

  it("omits legal links instead of shipping dead anchors", () => {
    expect(memberPreset.footer.privacyUrl).toBeNull();
    expect(memberPreset.footer.termsUrl).toBeNull();
  });

  it("passes validation", () => {
    expect(() => validateSiteConfig(memberPreset)).not.toThrow();
  });
});

describe("live preset", () => {
  it("is the active preset and passes validation", () => {
    expect(ACTIVE_PRESET).toBe("brian");
    expect(PRESETS[ACTIVE_PRESET]).toBe(brianPreset);
    expect(() => validateSiteConfig(brianPreset)).not.toThrow();
  });

  it("keeps existing identity and calls to action intact", () => {
    expect(brianPreset.identity.name).toBe("Brian Hanson");
    expect(brianPreset.identity.siteUrl).toBe("https://brianhanson.com");
    expect(brianPreset.hero.primaryCta?.href).toBe(
      "https://aiforbeginners.com",
    );
    expect(brianPreset.proofBadges.length).toBeGreaterThan(0);
    expect(brianPreset.results.length).toBe(3);
  });

  it("omits footer legal links while no policy pages exist", () => {
    expect(brianPreset.footer.privacyUrl).toBeNull();
    expect(brianPreset.footer.termsUrl).toBeNull();
  });
});

describe("validation", () => {
  it("rejects a site URL with a trailing slash", () => {
    expect(() =>
      validateSiteConfig({
        ...memberPreset,
        identity: { ...memberPreset.identity, siteUrl: "https://example.com/" },
      }),
    ).toThrow(SiteConfigError);
  });

  it("rejects a relative social image URL", () => {
    expect(() =>
      validateSiteConfig({
        ...memberPreset,
        metadata: { ...memberPreset.metadata, socialImageUrl: "/og.png" },
      }),
    ).toThrow(SiteConfigError);
  });

  it("rejects an enabled section with no content", () => {
    expect(() =>
      validateSiteConfig({
        ...memberPreset,
        sections: { ...memberPreset.sections, results: true },
      }),
    ).toThrow(SiteConfigError);
  });

  it("rejects a javascript: link", () => {
    expect(() =>
      validateSiteConfig({
        ...memberPreset,
        footer: { ...memberPreset.footer, privacyUrl: "javascript:alert(1)" },
      }),
    ).toThrow(SiteConfigError);
  });
});
