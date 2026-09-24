import { describe, expect, it } from "vitest";
import {
  checkGuidePublishReadiness,
  GUIDE_MIN_SECTIONS,
  GUIDE_MIN_TEXT_CHARS,
  MIN_GUIDE_OVERRIDE_REASON,
  isPublishTransition,
} from "../guidePublishGate";

const section = (n: number) =>
  `<h2>Section ${n}</h2><p>${"Practical, specific steps owners can take this week. ".repeat(8)}</p>`;
const fullGuide = [1, 2, 3, 4, 5].map(section).join("");

describe("checkGuidePublishReadiness", () => {
  it("passes a guide shaped like the live ones (about 2,000 chars, 5 sections)", () => {
    const r = checkGuidePublishReadiness(fullGuide);
    expect(r.ok).toBe(true);
    expect(r.issues).toEqual([]);
    expect(r.textChars).toBeGreaterThanOrEqual(GUIDE_MIN_TEXT_CHARS);
    expect(r.sections).toBe(5);
  });

  it("blocks empty and thin bodies", () => {
    for (const html of ["", "<p></p>", "<p>&nbsp;</p>", section(1)]) {
      const r = checkGuidePublishReadiness(html);
      expect(r.ok, html).toBe(false);
    }
    expect(checkGuidePublishReadiness("<p></p>").issues.join(" ")).toMatch(
      String(GUIDE_MIN_TEXT_CHARS),
    );
  });

  it("requires section headings", () => {
    const noHeadings = `<p>${"Long text without any structure at all. ".repeat(60)}</p>`;
    const r = checkGuidePublishReadiness(noHeadings);
    expect(r.ok).toBe(false);
    expect(r.issues.join(" ")).toMatch(String(GUIDE_MIN_SECTIONS));
  });

  it("exposes the override reason minimum", () => {
    expect(MIN_GUIDE_OVERRIDE_REASON).toBe(10);
  });
});

describe("isPublishTransition", () => {
  it("is true only when a guide becomes published", () => {
    expect(isPublishTransition(undefined, "published")).toBe(true);
    expect(isPublishTransition("draft", "published")).toBe(true);
    expect(isPublishTransition("published", "published")).toBe(false);
    expect(isPublishTransition("draft", "draft")).toBe(false);
  });
});
