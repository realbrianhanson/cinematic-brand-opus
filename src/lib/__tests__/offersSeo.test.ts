import { describe, expect, it } from "vitest";
import { emptyBuilder } from "../offerBuilder";
import { offerSeoText } from "../offersSeo";

const presentation = emptyBuilder().presentation;

describe("public offer head text", () => {
  it("keeps the product title and prefers the landing subheadline", () => {
    expect(
      offerSeoText({
        title: "The Client Kit",
        summary: "A short summary",
        presentation: {
          ...presentation,
          landing: {
            ...presentation.landing,
            headline: "Win your first client this week",
            subheadline: "  A practical   system  ",
          },
        },
      }),
    ).toEqual({ title: "The Client Kit", description: "A practical system" });
  });
  it("falls back to the summary and caps long descriptions near 160 characters", () => {
    const words = Array.from({ length: 60 }, (_, index) => `word${index}`);
    const { description } = offerSeoText({
      title: "Kit",
      summary: words.join(" "),
      presentation: null,
    });
    expect(description.length).toBeLessThanOrEqual(160);
    expect(description.endsWith("…")).toBe(true);
    expect(words.join(" ").startsWith(description.slice(0, -1))).toBe(true);
    expect(description.slice(0, -1)).not.toMatch(/\s$/);
  });
  it("cuts a single long word safely", () => {
    const { description } = offerSeoText({
      title: "Kit",
      summary: "x".repeat(400),
      presentation: undefined,
    });
    expect(description).toBe(`${"x".repeat(159)}…`);
  });
});
