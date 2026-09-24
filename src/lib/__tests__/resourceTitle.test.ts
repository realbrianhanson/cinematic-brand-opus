import { describe, expect, it } from "vitest";
import {
  applyTitleLint,
  composePageTitle,
  lintPageTitle,
  PAGE_SLUG_MAX_LENGTH,
  PAGE_TITLE_MAX_LENGTH,
  shortAudienceLabel,
  slugifyTitle,
} from "../../../supabase/functions/_shared/voice";

// The niche context paragraph that production pasted into 13 titles.
const AUDIENCE_PARAGRAPH =
  "Small business owners, solopreneurs, and entrepreneurs (typically 1-50 employees) who know AI matters but haven't implemented it yet. Non-technical. Revenue $100K-$10M. They're action-oriented but overwhelmed by the noise. They want results, not theory.";

// Angles recovered from the broken production titles (schema slug, angle).
const PRODUCTION_ANGLES: Array<[string, string]> = [
  ["templates-frameworks", "AI-Powered Content Creation Workflow Templates"],
  ["tool-roundups", "AI Tools for Streamlining Client Onboarding"],
  ["strategy-guides", "AI Content Creation for Non-Marketers"],
  ["tool-roundups", "Safety Equipment Roundups for High-Angle Roof Work"],
  ["strategy-guides", "Scaling Residential Roofing Operations with Drones"],
  [
    "tool-roundups",
    "Integrative Patient Communication Tools for Holistic Chiropractors",
  ],
  ["templates-frameworks", "Scaling Frameworks for Mastermind Facilitators"],
  ["ideas-use-cases", "Leveraging patient testimonials for practice growth"],
  ["ideas-use-cases", "Chiropractic Tech Integration for Patient Outcomes"],
  ["tool-roundups", "Client Onboarding & Management Software"],
  ["faq-collections", "FAQs for Scaling Through Masterminds"],
  ["templates-frameworks", "Integrative Health Assessment Frameworks"],
  ["faq-collections", "New Patient Onboarding FAQ Collection"],
  ["implementation-checklists", "AI Customer Support Workflow Checklist"],
  [
    "implementation-checklists",
    "Storm Restoration Hail Damage Assessment Checklist",
  ],
  [
    "implementation-checklists",
    "Client Goal Achievement Implementation Checklists",
  ],
  [
    "implementation-checklists",
    "Integrative Treatment Protocol Implementation Checklist",
  ],
  ["implementation-checklists", "AI Content Creation Checklist"],
  ["strategy-guides", "Mastermind Facilitator Strategy Guide for Scaling"],
  ["strategy-guides", "Patient Retention Strategy Guide for Wellness Centers"],
  ["templates-frameworks", "Storm Restoration Roofing Sales Scripts Framework"],
  ["faq-collections", "Storm Damage Claim FAQs for Roofers"],
  ["ideas-use-cases", "AI for Streamlining Customer Support"],
  ["ideas-use-cases", "Leveraging Drone Data for Commercial Roof Inspections"],
  ["ideas-use-cases", "Mastermind Facilitator Scaling Strategies"],
  ["faq-collections", "AI Customer Support Automation FAQs for Small Business"],
];

const NICHES = ["AI For Business", "Roofers", "Chiropractors", "Coaches"];

describe("composePageTitle", () => {
  it("never pastes a long audience paragraph into the title", () => {
    const title = composePageTitle({
      schemaSlug: "templates-frameworks",
      angle: "AI-Powered Content Creation Workflow Templates",
      niche: "AI For Business",
      audience: AUDIENCE_PARAGRAPH,
      year: 2026,
      actualCount: 12,
    });
    expect(title.length).toBeLessThanOrEqual(PAGE_TITLE_MAX_LENGTH);
    expect(title).not.toMatch(/solopreneurs|typically|theory/i);
    expect(title).not.toMatch(/Templates Templates/i);
  });

  it("produces short, lint-clean titles for every production angle", () => {
    for (const [schemaSlug, angle] of PRODUCTION_ANGLES) {
      for (const niche of NICHES) {
        for (const actualCount of [0, 5, 12, 45]) {
          const title = composePageTitle({
            schemaSlug,
            angle,
            niche,
            audience: AUDIENCE_PARAGRAPH,
            year: 2026,
            actualCount,
          });
          expect(title.length, title).toBeLessThanOrEqual(
            PAGE_TITLE_MAX_LENGTH,
          );
          expect(lintPageTitle(title), title).toEqual([]);
          expect(title, title).not.toMatch(/\bChecklists? Checklist/i);
          expect(title, title).not.toMatch(/^How to \S+ing\b/i);
          expect(title, title).not.toMatch(/^How to [A-Z]{2}/);
        }
      }
    }
  });

  it("uses the real content type slugs, not only the legacy keys", () => {
    const title = composePageTitle({
      schemaSlug: "implementation-checklists",
      angle: "Roof Inspection Prep",
      niche: "Roofers",
      audience: "Roofers",
      year: 2026,
      actualCount: 14,
    });
    expect(title).toMatch(/Checklist/);
    expect(title).not.toMatch(/Ideas That Actually Work|Best Roof/);
    // Legacy alias still resolves to the checklist patterns.
    const legacy = composePageTitle({
      schemaSlug: "checklists",
      angle: "Roof Inspection Prep",
      niche: "Roofers",
      audience: "Roofers",
      year: 2026,
      actualCount: 14,
    });
    expect(legacy).toBe(title);
  });

  it("only uses How-to patterns when the angle starts with a plain verb", () => {
    const verbTitle = composePageTitle({
      schemaSlug: "strategy-guides",
      angle: "Build a Referral Engine",
      niche: "Chiropractors",
      audience: "Chiropractors",
      year: 2026,
      actualCount: 6,
    });
    expect(verbTitle.length).toBeLessThanOrEqual(PAGE_TITLE_MAX_LENGTH);
    expect(lintPageTitle(verbTitle)).toEqual([]);
    const nounTitle = composePageTitle({
      schemaSlug: "strategy-guides",
      angle: "Leveraging drone imagery for insurance claims",
      niche: "Roofers",
      audience: "Roofers",
      year: 2026,
      actualCount: 6,
    });
    expect(nounTitle).not.toMatch(/^How to/);
  });

  it("skips count patterns below 10 items and is deterministic", () => {
    const params = {
      schemaSlug: "tool-roundups",
      angle: "AI Scheduling Tools",
      niche: "Coaches",
      audience: "Coaches",
      year: 2026,
      actualCount: 7,
    };
    const first = composePageTitle(params);
    expect(first).not.toMatch(/\b7\b/);
    expect(composePageTitle(params)).toBe(first);
  });

  it("does not repeat a year the angle already has", () => {
    const title = composePageTitle({
      schemaSlug: "tool-roundups",
      angle: "AI Scheduling Tools in 2026",
      niche: "Coaches",
      audience: "Coaches",
      year: 2026,
      actualCount: 12,
    });
    expect(title.match(/2026/g)?.length ?? 0).toBeLessThanOrEqual(1);
  });
});

describe("shortAudienceLabel", () => {
  it("prefers a short audience label and falls back to the niche name", () => {
    expect(shortAudienceLabel({ audience_short: "Roofers" }, "Roofing")).toBe(
      "Roofers",
    );
    expect(
      shortAudienceLabel({ audience: AUDIENCE_PARAGRAPH }, "Coaches"),
    ).toBe("Coaches");
    expect(shortAudienceLabel({ audience: "Dentists" }, "Dental")).toBe(
      "Dentists",
    );
    expect(shortAudienceLabel(null, "Dental")).toBe("Dental");
  });
});

describe("slugifyTitle", () => {
  it("cuts long slugs on a word boundary", () => {
    const slug = slugifyTitle(
      `AI Tools for Streamlining Client Onboarding: A Practical Guide for ${AUDIENCE_PARAGRAPH}`,
    );
    expect(slug.length).toBeLessThanOrEqual(PAGE_SLUG_MAX_LENGTH);
    expect(slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    const words = new Set(
      "ai tools for streamlining client onboarding a practical guide small business owners solopreneurs and entrepreneurs typically 1 50 employees who know matters but havent implemented it yet".split(
        " ",
      ),
    );
    for (const part of slug.split("-"))
      expect(words.has(part), part).toBe(true);
  });

  it("keeps short titles intact and strips punctuation", () => {
    expect(slugifyTitle("Client Onboarding & Management Software")).toBe(
      "client-onboarding-management-software",
    );
    expect(slugifyTitle("What's New in 2026?")).toBe("whats-new-in-2026");
  });
});

describe("lintPageTitle / applyTitleLint", () => {
  it("flags the broken production patterns", () => {
    const types = (t: string) => lintPageTitle(t).map((f) => f.type);
    expect(types("How to Leveraging Drone Data in 2026")).toContain(
      "title_how_to_gerund",
    );
    expect(types("How to AI-Powered Content Creation in 2026")).toContain(
      "title_how_to_noun",
    );
    expect(types("AI Customer Support Workflow Checklist Checklist")).toContain(
      "title_repeated_word",
    );
    expect(
      types(`AI Tools: A Practical Guide for ${AUDIENCE_PARAGRAPH}`),
    ).toContain("title_too_long");
    expect(lintPageTitle("12 Best AI Scheduling Tools in 2026")).toEqual([]);
  });

  it("lowers the quality score enough to block publishing", () => {
    const base = { score: 100, issues: [] };
    const linted = applyTitleLint(base, "How to Leveraging Drone Data");
    expect(linted.score).toBeLessThan(75);
    expect(linted.issues.join(" ")).toMatch(/How to/);
    expect(applyTitleLint(base, "12 Best AI Scheduling Tools in 2026")).toEqual(
      base,
    );
  });
});
