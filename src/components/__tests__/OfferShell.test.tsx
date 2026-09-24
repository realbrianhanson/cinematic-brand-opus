// @vitest-environment jsdom
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SiteConfigContext } from "@/config/SiteConfigContext";
import { brianPreset } from "@/config/presets/brian";

vi.mock("@/components/PublicMeasurement", () => ({
  MeasurementPreferencesButton: () => null,
}));
import OfferShell from "@/components/OfferShell";

const render = (props: { focused?: boolean; preview?: boolean } = {}) =>
  renderToStaticMarkup(
    <SiteConfigContext.Provider value={brianPreset}>
      <OfferShell {...props}>
        <p>Offer</p>
      </OfferShell>
    </SiteConfigContext.Provider>,
  );

describe("offer page header", () => {
  it("uses the main-site caps wordmark and links home and to the Shop", () => {
    const html = render();
    const doc = new DOMParser().parseFromString(html, "text/html");
    const header = doc.querySelector("header")!;
    const wordmark = header.querySelector('a[aria-label="Brian Hanson home"]')!;
    expect(wordmark.getAttribute("href")).toBe("/");
    expect(wordmark.innerHTML).toContain("uppercase");
    const nav = header.querySelector('nav[aria-label="Site"]')!;
    expect(
      Array.from(nav.querySelectorAll("a")).map((a) => [
        a.textContent,
        a.getAttribute("href"),
      ]),
    ).toEqual([
      ["Home", "/"],
      ["Shop", "/shop"],
    ]);
  });

  it("keeps focus-mode pages free of site navigation", () => {
    const html = render({ focused: true });
    expect(html).not.toContain('aria-label="Site"');
    expect(html).toContain('aria-label="Brian Hanson home"');
  });
});
