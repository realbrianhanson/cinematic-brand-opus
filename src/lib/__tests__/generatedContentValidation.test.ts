import { describe, expect, it } from "vitest";
import {
  hasFaqItems,
  validateGeneratedContent,
} from "../generatedContentValidation";

const faq = [
  { question: "How long does setup take?", answer: "About two weeks." },
];

const tool = {
  title: "Best AI Scheduling Tools",
  intro: "These tools cut booking admin. Most take a day to set up.",
  sections: [
    {
      section_title: "Booking",
      items: [
        {
          name: "Calendly",
          description: "Booking links",
          url: "https://calendly.com",
        },
      ],
    },
  ],
  frequently_asked_questions: faq,
  sources: [{ url: "https://example.org/report", title: "Report" }],
  expert_callout: { quote: "We moved all intake to one link." },
  hero_image: "https://cdn.example.org/a.png",
};

describe("validateGeneratedContent", () => {
  it("accepts the production shapes for every content type", () => {
    expect(validateGeneratedContent(tool, "tool-roundups")).toEqual({
      ok: true,
      errors: [],
    });
    const checklist = {
      intro: "Run these checks before launch. Each takes under an hour.",
      sections: [
        {
          title: "Prep",
          description: "Before you start",
          checklist_items: [
            { task: "Export contacts", description: "CSV", priority: "high" },
          ],
        },
      ],
      pro_tips: [{ title: "Batch it", tip: "Do all exports at once." }],
      frequently_asked_questions: faq,
    };
    expect(
      validateGeneratedContent(checklist, "implementation-checklists").ok,
    ).toBe(true);
    const ideas = {
      intro: "Ideas that work. Pick one this week.",
      categories: [
        {
          title: "Marketing",
          description: "Get found",
          items: [{ name: "Review requests", description: "Ask by SMS" }],
        },
      ],
      frequently_asked_questions: faq,
    };
    expect(validateGeneratedContent(ideas, "ideas-use-cases").ok).toBe(true);
    const faqCollection = {
      intro: "Answers to common questions. Updated monthly.",
      sections: [
        {
          section_title: "Billing",
          items: [{ question: "Do you bill insurance?", answer: "Yes." }],
        },
      ],
      frequently_asked_questions: faq,
    };
    expect(validateGeneratedContent(faqCollection, "faq-collections").ok).toBe(
      true,
    );
  });

  it("rejects values that are not a JSON object", () => {
    for (const value of [null, [], "text", 3]) {
      const r = validateGeneratedContent(value, "tool-roundups");
      expect(r.ok).toBe(false);
      expect(r.errors[0]).toMatch(/JSON object/);
    }
  });

  it("names the path of each shape problem", () => {
    const broken = {
      ...tool,
      intro: "",
      sections: { booking: [] },
      frequently_asked_questions: [{ question: "Only a question" }],
    };
    const r = validateGeneratedContent(broken, "tool-roundups");
    expect(r.ok).toBe(false);
    expect(r.errors.join("\n")).toMatch(/intro/);
    expect(r.errors.join("\n")).toMatch(/sections/);
    expect(r.errors.join("\n")).toMatch(
      /frequently_asked_questions\.0\.answer/,
    );
  });

  it("requires each item to carry its content type's title field", () => {
    const wrongKey = {
      ...tool,
      sections: [{ section_title: "Booking", items: [{ tool: "Calendly" }] }],
    };
    const r = validateGeneratedContent(wrongKey, "tool-roundups");
    expect(r.ok).toBe(false);
    expect(r.errors.join("\n")).toMatch(/sections\.0\.items\.0.*name/);
    const checklist = {
      intro: "Checks. Run them.",
      sections: [{ title: "Prep", checklist_items: [{ name: "Export" }] }],
    };
    expect(
      validateGeneratedContent(
        checklist,
        "implementation-checklists",
      ).errors.join("\n"),
    ).toMatch(/task/);
  });

  it("requires sections with at least one item list", () => {
    const empty = { ...tool, sections: [] };
    expect(validateGeneratedContent(empty, "tool-roundups").ok).toBe(false);
    const noItems = { ...tool, sections: [{ section_title: "Booking" }] };
    expect(
      validateGeneratedContent(noItems, "tool-roundups").errors.join("\n"),
    ).toMatch(/sections\.0/);
  });

  it("checks known optional fields when present", () => {
    const r = validateGeneratedContent(
      { ...tool, sources: "none", hero_image: 4, expert_callout: "x" },
      "tool-roundups",
    );
    expect(r.errors.join("\n")).toMatch(/sources/);
    expect(r.errors.join("\n")).toMatch(/hero_image/);
    expect(r.errors.join("\n")).toMatch(/expert_callout/);
  });

  it("applies generic rules to unknown content types", () => {
    expect(validateGeneratedContent(tool, "brand-new-type").ok).toBe(true);
  });
});

describe("hasFaqItems", () => {
  it("recognises the generated_pages FAQ key", () => {
    expect(hasFaqItems({ frequently_asked_questions: faq })).toBe(true);
    expect(hasFaqItems({ faq_items: faq })).toBe(true);
    expect(hasFaqItems({ faqs: faq })).toBe(true);
    expect(hasFaqItems({ frequently_asked_questions: [] })).toBe(false);
    expect(hasFaqItems(null)).toBe(false);
  });
});
