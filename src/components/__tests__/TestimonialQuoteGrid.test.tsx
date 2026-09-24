// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import TestimonialQuoteGrid, {
  AboutTestimonials,
} from "@/components/testimonials/TestimonialQuoteGrid";
import SpeakingTestimonials from "@/components/testimonials/SpeakingTestimonials";
import { quoteGridLayout } from "@/components/testimonials/layout";
import { testimonialCopy } from "@/components/testimonials/copy";
import { SiteConfigContext } from "@/config/SiteConfigContext";
import { memberPreset } from "@/config/presets/member";
import {
  brianAboutTestimonials,
  brianSpeakingTestimonials,
} from "@/config/presets/brianTestimonials";
import type { SiteConfig } from "@/config/types";
import {
  SPEC_ABOUT,
  SPEC_SPEAKING,
} from "@/config/__tests__/fixtures/testimonialSpec";

const wired: SiteConfig = {
  ...memberPreset,
  aboutTestimonials: brianAboutTestimonials,
  speakingTestimonials: brianSpeakingTestimonials,
};
function withConfig(node: React.ReactNode, config: SiteConfig = wired) {
  return render(
    <SiteConfigContext.Provider value={config}>
      {node}
    </SiteConfigContext.Provider>,
  );
}

afterEach(cleanup);

describe("About quote grid", () => {
  it("leads with Randi's line as a large pull quote, then the other five in a list", () => {
    render(<TestimonialQuoteGrid {...brianAboutTestimonials} />);
    const section = screen.getByRole("region", {
      name: brianAboutTestimonials.heading,
    });
    expect(
      within(section).getByRole("heading", {
        level: 2,
        name: brianAboutTestimonials.heading,
      }),
    ).toBeTruthy();
    const [pull, ...rest] = Array.from(section.querySelectorAll("figure"));
    expect(pull.closest("li")).toBeNull();
    expect(pull.querySelector("blockquote")?.textContent).toBe(
      SPEC_ABOUT[0].quote,
    );
    expect(pull.textContent).toContain("Randi Winter");
    expect(pull.textContent).toContain(SPEC_ABOUT[0].context);
    const items = within(within(section).getByRole("list")).getAllByRole(
      "listitem",
    );
    expect(items).toHaveLength(5);
    expect(rest).toHaveLength(5);
    SPEC_ABOUT.slice(1).forEach((item, i) => {
      expect(items[i].querySelector("blockquote")?.textContent).toBe(
        item.quote,
      );
      expect(items[i].textContent).toContain(item.attribution);
      expect(items[i].textContent).toContain(item.context);
    });
  });

  it("fills the wide grid in rows of three, then two", () => {
    expect([0, 1, 2, 3, 4].map((i) => quoteGridLayout(i, 5))).toEqual([
      "lg:col-span-2",
      "lg:col-span-2",
      "lg:col-span-2",
      "lg:col-span-3",
      "md:col-span-2 lg:col-span-3",
    ]);
    expect([0, 1, 2, 3].map((i) => quoteGridLayout(i, 4))).toEqual([
      "lg:col-span-2",
      "lg:col-span-2",
      "lg:col-span-2",
      "lg:col-span-6",
    ]);
  });

  it("renders from site config on the About page and hides for member sites", () => {
    withConfig(<AboutTestimonials />);
    expect(
      screen.getByRole("region", { name: brianAboutTestimonials.heading }),
    ).toBeTruthy();
    cleanup();
    const { container } = withConfig(<AboutTestimonials />, memberPreset);
    expect(container.innerHTML).toBe("");
  });
});

describe("speaking page quotes", () => {
  it("shows Randi and Lisa Wald's SBA line under a small heading", () => {
    withConfig(<SpeakingTestimonials />);
    const section = screen.getByRole("region", {
      name: brianSpeakingTestimonials.label,
    });
    expect(
      within(section).getByRole("heading", {
        level: 2,
        name: brianSpeakingTestimonials.label,
      }),
    ).toBeTruthy();
    const items = within(within(section).getByRole("list")).getAllByRole(
      "listitem",
    );
    expect(items).toHaveLength(2);
    SPEC_SPEAKING.forEach((item, i) => {
      expect(items[i].querySelector("blockquote")?.textContent).toBe(
        item.quote,
      );
      expect(items[i].textContent).toContain(item.attribution);
      expect(items[i].textContent).toContain(item.context);
    });
    expect(section.textContent).toContain("SBA");
  });

  it("accepts quotes as props and renders nothing for member sites", () => {
    const { container } = withConfig(<SpeakingTestimonials />, memberPreset);
    expect(container.innerHTML).toBe("");
    cleanup();
    withConfig(
      <SpeakingTestimonials
        config={{ label: "From the event", items: [SPEC_SPEAKING[0]] }}
      />,
      memberPreset,
    );
    expect(screen.getByRole("region", { name: "From the event" })).toBeTruthy();
  });
});

describe("testimonial interface copy", () => {
  it.each(Object.entries(testimonialCopy))(
    "%s follows Brian's voice",
    (_key, text) => {
      expect(text.trim()).not.toMatch(/(?<!\.)\.$/);
      expect(text).not.toContain("—");
    },
  );
});
