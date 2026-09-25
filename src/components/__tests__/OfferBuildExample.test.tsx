// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import OfferBuildExample from "../OfferBuildExample";
import { SiteConfigContext } from "@/config/SiteConfigContext";
import { brianPreset } from "@/config/presets/brian";
import { memberPreset } from "@/config/presets/member";
import type { SiteConfig } from "@/config/types";

vi.mock("@/lib/router-compat", () => ({
  Link: ({
    to,
    children,
    ...rest
  }: {
    to: string;
    children: React.ReactNode;
  }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}));
afterEach(cleanup);
function show(config: SiteConfig, offers = [{ slug: "pushten" }]) {
  return render(
    <SiteConfigContext.Provider value={config}>
      <OfferBuildExample offers={offers} />
    </SiteConfigContext.Provider>,
  );
}
describe("offer-matched participant evidence", () => {
  it("connects the sourced participant account only to the matching public product", () => {
    show(brianPreset);
    expect(
      screen
        .getByRole("link", { name: /See what PushTen includes/ })
        .getAttribute("href"),
    ).toBe("/offers/pushten");
    expect(screen.getByText("Susie Satram")).toBeTruthy();
    expect(screen.getByText(/Her account of her own experience/)).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: /full message and screenshot/ })
        .getAttribute("href"),
    ).toBe("#testimonials");
  });
  it("does not apply Brian's results to a member brand even with a matching slug", () => {
    const { container } = show({
      ...memberPreset,
      homepageTestimonials: brianPreset.homepageTestimonials,
    });
    expect(container.textContent).toBe("");
  });
  it("hides the recommendation when its offer or source is absent", () => {
    const { container, unmount } = show(brianPreset, [
      { slug: "different-offer" },
    ]);
    expect(container.textContent).toBe("");
    unmount();
    expect(
      show({ ...brianPreset, homepageTestimonials: undefined }).container
        .textContent,
    ).toBe("");
  });
});
