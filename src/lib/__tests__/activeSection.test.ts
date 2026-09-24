import { describe, expect, it } from "vitest";
import { activeSectionAt } from "@/lib/activeSection";

const boxes = (map: Record<string, [number, number]>) => (id: string) =>
  map[id] ? { top: map[id][0], bottom: map[id][1] } : null;

describe("activeSectionAt", () => {
  it("is empty before the section reaches the nav", () => {
    expect(activeSectionAt(["story"], boxes({ story: [400, 1400] }))).toBe("");
  });
  it("highlights the section while the reader is inside it", () => {
    expect(activeSectionAt(["story"], boxes({ story: [-300, 700] }))).toBe(
      "story",
    );
  });
  it("clears once the section has scrolled past, down to the footer", () => {
    expect(activeSectionAt(["story"], boxes({ story: [-2000, 90] }))).toBe("");
  });
  it("ignores sections missing from the page", () => {
    expect(activeSectionAt(["story", "speaking"], boxes({}))).toBe("");
  });
});
