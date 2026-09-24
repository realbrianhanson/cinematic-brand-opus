import { describe, expect, it } from "vitest";
import { brianPreset } from "../presets/brian";

/**
 * Brian's copy rule: no paragraph or standalone line ends with a period, and
 * no em dashes. The hero headline and subtitle are intentionally left as they
 * are, and testimonials are quoted in participants' own words.
 */
const EXEMPT = new Set([
  "hero.headlineLines",
  "hero.subtitle",
  "homepageTestimonials.items",
  // Verbatim quotes and screenshot text only. Labels and contexts are checked.
  "homepageTestimonials.groups.items.quote",
  "homepageTestimonials.groups.items.screenshot.alt",
  "homepageTestimonials.wall.items.quote",
  "aboutTestimonials.pullQuote.quote",
  "aboutTestimonials.items.quote",
  "speakingTestimonials.items.quote",
]);

function copyStrings(value: unknown, path = ""): [string, string][] {
  if (EXEMPT.has(path)) return [];
  if (typeof value === "string") return [[path, value]];
  if (Array.isArray(value))
    return value.flatMap((item, i) => copyStrings(item, `${path}`));
  if (value && typeof value === "object")
    return Object.entries(value).flatMap(([key, item]) =>
      copyStrings(item, path ? `${path}.${key}` : key),
    );
  return [];
}

const prose = copyStrings(brianPreset).filter(
  ([path, text]) =>
    /\s/.test(text) &&
    !/^(https?:|mailto:|\/)/.test(text) &&
    !path.startsWith("metadata.defaultTitle"),
);

describe("Brian preset voice", () => {
  it("has copy to check", () => {
    expect(prose.length).toBeGreaterThan(40);
  });

  it.each(prose)("%s does not end with a period", (_path, text) => {
    expect(text.trim()).not.toMatch(/(?<!\.)\.$/);
  });

  it.each(prose)("%s has no em dash", (_path, text) => {
    expect(text).not.toContain("—");
  });

  it("says PushTen, never Push 10, in copy", () => {
    for (const [, text] of prose) expect(text).not.toMatch(/Push ?10\b/i);
  });

  it("keeps the Resources tagline to what the site really offers", () => {
    expect(brianPreset.content.resourceDescription).not.toMatch(
      /every industry/i,
    );
  });
});
