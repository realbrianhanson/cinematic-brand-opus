// @vitest-environment jsdom
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  emptyBuilder,
  offerBuilderSchema,
  offerVideoEmbed,
  pageRecipe,
  newSection,
  readPresentation,
  reviewOffer,
} from "../offerBuilder";
import type { PublicOffer } from "../offers";
import OfferLanding from "@/pages/OfferLanding";
import OfferBody from "@/components/offers/OfferBody";
import OfferSections from "@/components/offers/OfferSections";
import OfferBuilderPreview from "@/components/offers/OfferBuilderPreview";

const invoke = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke } },
}));
const offer: PublicOffer = {
  id: "11111111-1111-4111-8111-111111111111",
  slug: "kit",
  title: "Product name",
  summary: "A useful kit",
  body: "## Legacy heading\n\n- Useful resource\n\n> Verified quotation.\n>\n> — Real author",
  cover_url: null,
  status: "published",
  kind: "paid",
  checkout_mode: "native",
  price_display_mode: "fixed",
  external_url: null,
  external_button_text: "",
  is_affiliate: false,
  affiliate_disclosure: null,
  amount_minor: 2900,
  currency: "usd",
  thank_you_message: "Your file is ready",
  funnel_only: false,
  created_at: "2026-09-23",
  updated_at: "2026-09-23",
};
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("offer presentation contract", () => {
  it("rejects private keys, unknown sections and executable media URLs", () => {
    const builder = emptyBuilder();
    expect(offerBuilderSchema.safeParse(builder).success).toBe(true);
    expect(
      readPresentation({
        ...builder.presentation,
        strategy: { secret: "private" },
      }),
    ).toBeNull();
    builder.presentation.landing = pageRecipe("sales");
    builder.presentation.landing.sections[0].imageUrl = "javascript:alert(1)";
    expect(offerBuilderSchema.safeParse(builder).success).toBe(false);
    builder.presentation.landing.sections[0].imageUrl =
      "https://user:password@example.com/media";
    expect(offerBuilderSchema.safeParse(builder).success).toBe(false);
  });
  it("only embeds supported video hosts with valid identifiers", () => {
    expect(offerVideoEmbed("https://youtu.be/abcdefghijk")).toBe(
      "https://www.youtube-nocookie.com/embed/abcdefghijk",
    );
    expect(offerVideoEmbed("https://vimeo.com/123456")).toBe(
      "https://player.vimeo.com/video/123456",
    );
    expect(
      offerVideoEmbed("https://youtube.com.evil.example/watch?v=abcdefghijk"),
    ).toBeNull();
    expect(offerVideoEmbed("javascript:alert(1)")).toBeNull();
  });
  it("returns actionable gaps instead of pretending to predict conversion", () => {
    const issues = reviewOffer(emptyBuilder());
    expect(issues.map((issue) => issue.title)).toContain(
      "Spell out what they receive",
    );
    expect(JSON.stringify(issues)).not.toMatch(/\d+%/);
  });
});

describe("consistent landing and follow-up rendering", () => {
  it("preserves video captions while disabling embeds in admin preview", () => {
    const section = {
      ...newSection("video"),
      imageUrl: "https://youtu.be/abcdefghijk",
      caption: "Three-minute product walkthrough",
    };
    const preview = renderToStaticMarkup(
      <OfferSections sections={[section]} preview />,
    );
    const published = renderToStaticMarkup(
      <OfferSections sections={[section]} />,
    );
    expect(preview).toContain(section.caption);
    expect(preview).not.toContain("<iframe");
    expect(published).toContain(section.caption);
    expect(published).toContain("<iframe");
  });
  it("keeps legacy headings, lists and testimonial attribution", () => {
    const html = renderToStaticMarkup(<OfferBody body={offer.body} />);
    expect(html).toContain("<h2");
    expect(html).toContain("<ul");
    expect(html).toContain("<blockquote");
    expect(html).toContain("Real author");
    expect(html).not.toContain("## Legacy");
  });
  it("renders sales headline and custom CTA with explicit paid amount", () => {
    const builder = emptyBuilder();
    builder.presentation.landing.headline =
      "Turn your notes into a useful follow-up";
    builder.presentation.landing.ctaText = "Get the implementation kit";
    builder.presentation.landing.focusMode = true;
    const html = renderToStaticMarkup(
      <OfferLanding offer={{ ...offer, presentation: builder.presentation }} />,
    );
    expect(html).toContain("Turn your notes into a useful follow-up");
    expect(html).toContain("Get the implementation kit");
    expect(html).toContain("· $29<");
    expect(html).not.toContain("Browse the Shop");
  });
  it("does not render raw HTML as executable content", () => {
    const builder = emptyBuilder();
    const page = pageRecipe("sales");
    page.sections[0].body =
      '<script>alert(1)</script><img src=x onerror="alert(2)">';
    builder.presentation.landing = page;
    const html = renderToStaticMarkup(
      <OfferSections sections={page.sections} />,
    );
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img src=x");
  });
  it("simulates fulfillment, decline and expiry locally without API calls", () => {
    render(
      <OfferBuilderPreview
        offer={offer}
        builder={emptyBuilder()}
        device="phone"
        nextOffer={{ ...offer, id: "next", title: "Actual next product" }}
      />,
    );
    expect(
      screen
        .getByRole("button", { name: "Preview only" })
        .hasAttribute("disabled"),
    ).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: /^Follow-up$/ }));
    expect(screen.getByText("Actual next product")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /^Declined$/ }));
    expect(screen.getByText(/Follow-up offer declined/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /^Expired$/ }));
    expect(screen.getByText(/window has ended/)).toBeTruthy();
    expect(invoke).not.toHaveBeenCalled();
  });
});
