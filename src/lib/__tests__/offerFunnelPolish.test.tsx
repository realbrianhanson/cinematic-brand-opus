// @vitest-environment jsdom
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  emptyBuilder,
  emptyPage,
  newSection,
  pageRecipe,
  reviewOffer,
  sectionFromProof,
  type OfferProof,
} from "../offerBuilder";
import { offerFaqLayout, offerListLayout } from "../offerSectionLayout";
import OfferSections from "@/components/offers/OfferSections";
import OfferPageFields from "@/components/admin/offers/OfferPageFields";

const evidence: OfferProof = {
  id: "33333333-3333-4333-8333-333333333333",
  title: "Customer experience",
  kind: "testimonial",
  content: "The template made my next step clearer.",
  attribution: "Alex, consultant",
  source_url: "https://example.com/private-record",
  notes: "Private permissions",
  approved: true,
  created_at: "2026-09-25",
  updated_at: "2026-09-25",
};
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("guided direct-response pages", () => {
  it("uses supplied brief facts without turning private evidence or unanswered objections into public claims", () => {
    const strategy = {
      ...emptyBuilder().strategy,
      outcome: "Organize your next client follow-up",
      problem: "Notes are scattered",
      mechanism: "Turn notes into a checklist",
      deliverables: "- One PDF checklist\n- A follow-up template",
      evidence: "PRIVATE: unverified earnings claim",
      objections: "PRIVATE: Is there a refund?",
    };
    const page = pageRecipe("sales", {
      strategy,
      offer: {
        title: "Follow-up kit",
        summary: "Reusable resources",
        kind: "paid",
      },
    });
    expect(page.headline).toBe(strategy.outcome);
    expect(
      page.sections.find((section) => section.type === "deliverables")?.body,
    ).toBe(strategy.deliverables);
    expect(
      page.sections.find((section) => section.type === "method")?.body,
    ).toBe(strategy.mechanism);
    expect(page.sections.find((section) => section.type === "faq")?.body).toBe(
      "",
    );
    expect(
      page.sections.find((section) => section.type === "proof")?.body,
    ).toBe("");
    expect(JSON.stringify(page)).not.toMatch(/PRIVATE|refund|earnings/);
    expect(page.ctaText).toBe("Continue to checkout");
    expect(page.focusMode).toBe(true);
  });
  it("keeps an existing headline and button when applying a guided recipe", () => {
    const change = vi.fn();
    render(
      <OfferPageFields
        value={{
          ...emptyPage(),
          headline: "Reviewed headline",
          ctaText: "Reviewed button",
        }}
        stage="landing"
        onChange={change}
        recipeContext={{
          strategy: {
            ...emptyBuilder().strategy,
            outcome: "A supplied result",
          },
          offer: { title: "Kit", summary: "Useful", kind: "free" },
        }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Use this layout" }));
    expect(change).toHaveBeenCalledWith(
      expect.objectContaining({
        headline: "Reviewed headline",
        ctaText: "Reviewed button",
        subheadline: "Useful",
      }),
    );
  });
  it("links empty sections and missing testimonial attribution to the right presentation", () => {
    const builder = emptyBuilder();
    const section = { ...newSection("proof"), body: evidence.content };
    builder.presentation.upsell.sections = [section];
    builder.presentation.landing = pageRecipe("sales");
    const advice = reviewOffer(builder, {
      title: "Kit",
      body: "Legacy copy",
      checkout_mode: "external",
    });
    expect(advice).toContainEqual(
      expect.objectContaining({
        title: "Attribute the upsell testimonial",
        step: "pages",
        stage: "upsell",
        sectionId: section.id,
      }),
    );
    expect(
      advice.some(
        (item) =>
          item.sectionId === builder.presentation.landing.sections[0].id,
      ),
    ).toBe(true);
    expect(advice.some((item) => item.stage === "thank-you")).toBe(false);
    expect(JSON.stringify(advice)).not.toMatch(/\d+%/);
  });
  it("does not demand copy for an unused upsell", () => {
    expect(
      reviewOffer(emptyBuilder(), { title: "Kit", body: "Description" }).some(
        (item) => item.stage === "upsell",
      ),
    ).toBe(false);
  });
});

describe("trustworthy proof editing", () => {
  it("keeps exact testimonial attribution editable without exposing private references", () => {
    const change = vi.fn();
    const section = sectionFromProof(evidence);
    render(
      <OfferPageFields
        value={{ ...emptyPage(), sections: [section] }}
        stage="landing"
        onChange={change}
      />,
    );
    fireEvent.change(screen.getByLabelText("Public testimonial attribution"), {
      target: { value: "Alex (approved attribution)" },
    });
    expect(change).toHaveBeenCalledWith(
      expect.objectContaining({
        sections: [
          expect.objectContaining({
            caption: "Alex (approved attribution)",
            body: evidence.content,
          }),
        ],
      }),
    );
    expect(JSON.stringify(section)).not.toContain("private-record");
    expect(JSON.stringify(section)).not.toContain("Private permissions");
  });
  it("renders documented facts as evidence text, not as a customer quotation", () => {
    const section = sectionFromProof({ ...evidence, kind: "fact" });
    const html = renderToStaticMarkup(<OfferSections sections={[section]} />);
    expect(section.type).toBe("text");
    expect(html).not.toContain("<blockquote");
    expect(html).toContain(evidence.attribution);
    expect(
      renderToStaticMarkup(
        <OfferSections sections={[sectionFromProof(evidence)]} />,
      ),
    ).toContain("<blockquote");
  });
});

describe("scannable sections with legacy compatibility", () => {
  it("preserves the original description when a recipe only contains empty placeholders", () => {
    const page = pageRecipe("sales");
    const html = renderToStaticMarkup(
      <OfferSections
        sections={page.sections}
        fallback="The complete original offer description."
        preview
      />,
    );
    expect(html).toContain("The complete original offer description.");
    expect(html).not.toContain("What customers say");
    expect(html).not.toContain("<blockquote");
  });
  it("renders supplied benefits as semantic lists and method steps as a numbered process", () => {
    const body =
      "A practical way to start.\n\n- Open the checklist\n- Complete the next action";
    const benefits = renderToStaticMarkup(
      <OfferSections sections={[{ ...newSection("benefits"), body }]} />,
    );
    const method = renderToStaticMarkup(
      <OfferSections sections={[{ ...newSection("method"), body }]} />,
    );
    expect(benefits).toContain("<ul");
    expect(method).toContain("<ol");
    expect(benefits).toContain("A practical way to start.");
    expect(method).toContain("Complete the next action");
    expect(
      offerListLayout("## Existing heading\n\n- Keep original formatting"),
    ).toBeNull();
  });
  it("makes confirmed FAQ answers expandable and renders HTML as text", () => {
    const body =
      "## Who is this for?\nConsultants.\n\n## What is included?\n<script>alert(1)</script>";
    const html = renderToStaticMarkup(
      <OfferSections sections={[{ ...newSection("faq"), body }]} />,
    );
    expect(html).toContain("<details");
    expect(html).toContain("Who is this for?");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(offerFaqLayout("Keep this existing prose intact.")).toBeNull();
    expect(offerFaqLayout("## An unanswered question?")).toBeNull();
  });
});
