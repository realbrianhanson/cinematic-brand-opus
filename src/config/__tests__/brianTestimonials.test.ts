import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  brianAboutTestimonials,
  brianHomepageTestimonials,
  brianSpeakingTestimonials,
  brianTestimonialDisclosure,
} from "../presets/brianTestimonials";
import { memberPreset } from "../presets/member";
import type { TestimonialItem } from "../types";
import {
  SPEC_ABOUT,
  SPEC_COMMUNITY,
  SPEC_DISCLOSURE,
  SPEC_NOT_A_TECHIE,
  SPEC_RESULTS,
  SPEC_SPEAKING,
  SPEC_WALL,
} from "./fixtures/testimonialSpec";

const PUBLIC_DIR = fileURLToPath(new URL("../../../public", import.meta.url));
const home = brianHomepageTestimonials;
const groups = home.groups ?? [];
const results = groups.find((group) => group.id === "results");
const notATechie = groups.find((group) => group.id === "not-a-techie");

/** Keeps only the fields the spec fixes, so layout hints stay free to change. */
const verbatim = (item: TestimonialItem) => ({
  attribution: item.attribution,
  quote: item.quote,
  context: item.context,
  ...(item.screenshot && {
    screenshot: {
      src: item.screenshot.src,
      width: item.screenshot.width,
      height: item.screenshot.height,
      alt: item.screenshot.alt,
      ...(item.screenshot.showQuote && { showQuote: true }),
    },
  }),
});

/** Every quote, screenshot alt and wall line anywhere in the exported data. */
function quotedText(value: unknown, key = ""): string[] {
  if (typeof value === "string")
    return key === "quote" || key === "alt" ? [value] : [];
  if (Array.isArray(value)) return value.flatMap((v) => quotedText(v, key));
  if (value && typeof value === "object")
    return Object.entries(value).flatMap(([k, v]) => quotedText(v, k));
  return [];
}

const allData = [
  brianHomepageTestimonials,
  brianAboutTestimonials,
  brianSpeakingTestimonials,
];
const specText = new Set(
  [
    ...SPEC_RESULTS,
    ...SPEC_NOT_A_TECHIE,
    ...SPEC_ABOUT,
    ...SPEC_WALL,
    ...SPEC_COMMUNITY,
  ].flatMap((item) => quotedText(item)),
);

/** Our own copy: headings, labels, the disclosure and every context label. */
const copy = (label: string, text?: string): [string, string] => [
  label,
  text ?? "",
];
const ownCopy = [
  copy("overline", home.overline),
  copy("heading", home.heading),
  copy("intro", home.intro),
  ...groups.map((g) => copy(`group ${g.id}`, g.label)),
  copy("disclosure", brianTestimonialDisclosure),
  copy("wall label", home.wall?.label),
  copy("about overline", brianAboutTestimonials.overline),
  copy("about heading", brianAboutTestimonials.heading),
  copy("speaking label", brianSpeakingTestimonials.label),
  ...[
    ...groups.flatMap((g) => g.items),
    ...brianAboutTestimonials.items,
    ...(brianAboutTestimonials.pullQuote
      ? [brianAboutTestimonials.pullQuote]
      : []),
    ...brianSpeakingTestimonials.items,
  ].map((item) => copy(`context for ${item.attribution}`, item.context)),
].filter(([, text]) => text.length > 0);

/** Reads the pixel size from a WebP header (lossy, lossless or extended). */
function webpSize(file: Buffer) {
  if (
    file.toString("ascii", 0, 4) !== "RIFF" ||
    file.toString("ascii", 8, 12) !== "WEBP"
  )
    throw new Error("not a WebP file");
  const chunk = file.toString("ascii", 12, 16);
  if (chunk === "VP8 ")
    return {
      width: file.readUInt16LE(26) & 0x3fff,
      height: file.readUInt16LE(28) & 0x3fff,
    };
  if (chunk === "VP8L") {
    const bits = file.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  if (chunk === "VP8X")
    return {
      width: file.readUIntLE(24, 3) + 1,
      height: file.readUIntLE(27, 3) + 1,
    };
  throw new Error(`unknown WebP chunk ${chunk}`);
}

describe("Brian's testimonial selection", () => {
  it("leads with the results group, then the not-a-techie group", () => {
    expect(groups.map((group) => group.id)).toEqual([
      "results",
      "not-a-techie",
    ]);
    expect(notATechie?.label).toBe("You don't have to be a techie");
  });

  it("keeps every results quote, context and screenshot exactly as approved", () => {
    expect(results?.items.map(verbatim)).toEqual(SPEC_RESULTS);
  });

  it("keeps every not-a-techie quote, context and screenshot exactly as approved", () => {
    expect(notATechie?.items.map(verbatim)).toEqual(SPEC_NOT_A_TECHIE);
  });

  it("puts the approved short lines on the wall, word for word", () => {
    expect(home.wall?.items).toEqual(SPEC_WALL);
  });

  it("moves the six earlier homepage quotes, unchanged, into the community list", () => {
    expect(home.items).toEqual(SPEC_COMMUNITY);
  });

  it("uses Randi's line as the About pull quote, then the other five in order", () => {
    expect(
      brianAboutTestimonials.pullQuote &&
        verbatim(brianAboutTestimonials.pullQuote),
    ).toEqual(SPEC_ABOUT[0]);
    expect(brianAboutTestimonials.items.map(verbatim)).toEqual(
      SPEC_ABOUT.slice(1),
    );
  });

  it("gives the speaking page Randi and Lisa Wald's SBA line", () => {
    expect(brianSpeakingTestimonials.items.map(verbatim)).toEqual(
      SPEC_SPEAKING,
    );
  });

  it("contains no quote or screenshot text that differs from the spec", () => {
    const quoted = allData.flatMap((data) => quotedText(data));
    expect(quoted.length).toBeGreaterThan(30);
    for (const text of quoted) expect(specText).toContain(text);
  });

  it("shows the fixed income disclosure directly under the results group only", () => {
    expect(brianTestimonialDisclosure).toBe(SPEC_DISCLOSURE);
    expect(results?.disclosure).toBe(SPEC_DISCLOSURE);
    expect(notATechie?.disclosure).toBeUndefined();
  });

  it("ends Heshie's typed excerpt before the sentence that credits Francis", () => {
    const heshie = notATechie?.items.find(
      (item) => item.attribution === "Heshie Segal",
    );
    expect(heshie?.screenshot?.showQuote).toBe(true);
    expect(heshie?.screenshot?.alt.startsWith(heshie.quote)).toBe(true);
    expect(heshie?.quote).not.toContain("Francis");
    expect(heshie?.screenshot?.alt).toContain("Francis is amazing");
  });

  it("points every screenshot at a real file with the right natural size", () => {
    const shots = groups.flatMap((group) =>
      group.items.flatMap((item) => (item.screenshot ? [item.screenshot] : [])),
    );
    expect(shots).toHaveLength(4);
    for (const shot of shots) {
      expect(shot.src).toMatch(/^\/testimonials\/[a-z0-9-]+\.webp$/);
      const file = `${PUBLIC_DIR}${shot.src}`;
      expect(existsSync(file)).toBe(true);
      expect(webpSize(readFileSync(file))).toEqual({
        width: shot.width,
        height: shot.height,
      });
    }
  });

  it("leaves out the outdated price screenshot, the standalone reply and the summit comparison", () => {
    const dump = JSON.stringify(allData);
    expect(dump).not.toContain("kathy-member");
    expect(dump).not.toContain("$199");
    expect(dump).not.toContain("susie-2");
    expect(dump).not.toContain("Best 2 Day Session");
  });

  it("keeps private source links out of browser data", () => {
    expect(JSON.stringify(allData)).not.toMatch(/google\.com/i);
  });

  it.each(ownCopy)("%s follows Brian's voice", (_label, text) => {
    expect(text.trim()).not.toMatch(/(?<!\.)\.$/);
    expect(text).not.toContain("—");
    expect(text).not.toMatch(/Push (?:Ten|10)\b|Push10\b/i);
  });

  it("gives member presets none of Brian's testimonials", () => {
    expect(memberPreset.homepageTestimonials).toBeUndefined();
    expect(memberPreset.aboutTestimonials).toBeUndefined();
    expect(memberPreset.speakingTestimonials).toBeUndefined();
  });
});
