// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import CallFunnelExperience from "../CallFunnelExperience";
import { SiteConfigContext } from "@/config/SiteConfigContext";
import { siteConfig } from "@/config/site";
import {
  validateSiteConfig,
  SiteConfigError,
  type CallShowcase,
  type SiteConfig,
} from "@/config/types";
import {
  emptyCallFunnelConfig,
  publicCallConfig,
  type CallApplicationState,
  type CallPublication,
} from "@/lib/callFunnels";

const showcase: CallShowcase = {
  showResults: true,
  system: {
    heading: "One team builds your whole system",
    intro: "Every stage wired together",
    stages: [
      { title: "Get found", text: "Bring people in", items: ["Ads"] },
      { title: "Follow up fast", text: "Answer in seconds", items: [] },
    ],
    note: "Built with the tools we use every day",
  },
  steps: [
    { title: "Apply", text: "Answer a few questions" },
    { title: "Pick a time", text: "Book a call" },
  ],
  testimonials: [
    { quote: "Built me an app in 30 minutes", attribution: "First Person" },
    { quote: "Talk to him", attribution: "Last Person", context: "Chat" },
  ],
};

function publication(slug = "work-with-brian"): CallPublication {
  const config = emptyCallFunnelConfig();
  config.brand.name = "Example business";
  config.brand.hostName = "Host Name";
  config.brand.hostRole = "Founder";
  config.brand.hostImage = "/host.webp";
  config.invitation.cta = "Apply now";
  config.questions = [
    {
      id: "role",
      label: "Which best describes you?",
      help: "",
      type: "single",
      required: true,
      options: [
        { id: "owner", label: "Business owner" },
        { id: "agency", label: "Agency or consultant" },
        { id: "local", label: "Local service business" },
        { id: "other", label: "Other" },
      ],
    },
    {
      id: "phone",
      label: "Best mobile number",
      help: "",
      type: "text",
      required: true,
      options: [],
    },
  ];
  config.booking.url = "https://calendar.example.com/book";
  return {
    id: "11111111-1111-4111-8111-111111111111",
    slug,
    title: "Example call",
    revision: 1,
    config: publicCallConfig(config),
    proof: [],
  };
}

function bookingState(
  pub: CallPublication,
  status: "unconfirmed" | "booked",
): CallApplicationState {
  return {
    id: "application-1",
    outcome: "qualified",
    revision: pub.revision,
    slug: pub.slug,
    title: pub.title,
    config: pub.config,
    proof: pub.proof,
    submittedAt: "2026-10-24T12:00:00Z",
    booking:
      status === "booked"
        ? {
            status: "booked",
            startsAt: "2026-10-30T13:00:00Z",
            timezone: "UTC",
            source: "signed_webhook",
          }
        : { status: "unconfirmed", startsAt: null, source: null },
  };
}

function renderWithSite(element: React.ReactElement) {
  const site: SiteConfig = {
    ...siteConfig,
    callShowcases: { "work-with-brian": showcase },
  };
  return render(
    <SiteConfigContext.Provider value={site}>
      {element}
    </SiteConfigContext.Provider>,
  );
}

afterEach(() => {
  cleanup();
  sessionStorage.clear();
});

describe("call funnel showcase", () => {
  it("shows the site's sales sections for the funnel they are keyed to", () => {
    renderWithSite(<CallFunnelExperience publication={publication()} />);
    expect(
      screen.getByRole("heading", {
        name: "One team builds your whole system",
      }),
    ).toBeTruthy();
    expect(
      screen.getByText("Built with the tools we use every day"),
    ).toBeTruthy();
    expect(screen.getByRole("list", { name: "Track record" })).toBeTruthy();
    expect(screen.getByText("Answer a few questions")).toBeTruthy();
    expect(screen.getByText("“Built me an app in 30 minutes”")).toBeTruthy();
    expect(
      screen.getByRole("img", { name: "Portrait of Host Name" }),
    ).toBeTruthy();
  });

  it("leaves other funnels on the plain template", () => {
    renderWithSite(<CallFunnelExperience publication={publication("other")} />);
    expect(
      screen.queryByRole("heading", {
        name: "One team builds your whole system",
      }),
    ).toBeNull();
    expect(screen.queryByText("“Built me an app in 30 minutes”")).toBeNull();
    expect(screen.queryByRole("list", { name: "Track record" })).toBeNull();
  });

  it("prefers proof the owner selected in the builder over site quotes", () => {
    const pub = publication();
    pub.proof = [
      {
        id: "22222222-2222-4222-8222-222222222222",
        title: "Selected story",
        content: "Chosen in the builder",
        attribution: "Builder Person",
        source_url: "",
      },
    ];
    pub.config.proofIds = ["22222222-2222-4222-8222-222222222222"];
    renderWithSite(<CallFunnelExperience publication={pub} />);
    expect(screen.getByText("Chosen in the builder")).toBeTruthy();
    expect(screen.queryByText("“Built me an app in 30 minutes”")).toBeNull();
  });

  it("marks where the visitor is in the journey", () => {
    renderWithSite(<CallFunnelExperience publication={publication()} />);
    const journey = screen.getByRole("list", { name: "Your progress" });
    expect(journey.querySelector('[aria-current="step"]')?.textContent).toBe(
      "1Apply",
    );
  });
});

describe("hero video", () => {
  it("puts a published video in the hero and moves the portrait to the host card", () => {
    const pub = publication();
    pub.config.invitation.video = {
      ...pub.config.invitation.video,
      url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    };
    const { container } = renderWithSite(
      <CallFunnelExperience publication={pub} />,
    );
    const hero = container.querySelector(".cf-hero")!;
    expect(hero.className).toContain("has-video");
    expect(hero.querySelector(".cf-hero-video .cf-media")).toBeTruthy();
    expect(hero.querySelector(".cf-hero-portrait")).toBeNull();
    expect(container.querySelector(".cf-video-section")).toBeNull();
    expect(
      container.querySelector(".cf-host-card img")?.getAttribute("src"),
    ).toBe("/host.webp");
  });

  it("keeps the portrait in the hero until a video is published", () => {
    const { container } = renderWithSite(
      <CallFunnelExperience publication={publication()} />,
    );
    expect(container.querySelector(".cf-hero")!.className).toContain(
      "has-portrait",
    );
    expect(container.querySelector(".cf-hero-video")).toBeNull();
  });
});

describe("application form layout", () => {
  it("asks for contact details and phone first, then shows short answer lists in two columns", () => {
    renderWithSite(<CallFunnelExperience publication={publication()} />);
    // The phone question joins name and email on the first step.
    const phone = screen.getByRole("textbox", { name: "Best mobile number" });
    expect(phone.getAttribute("type")).toBe("tel");
    expect(phone.getAttribute("autocomplete")).toBe("tel");
    fireEvent.change(screen.getByLabelText("Your name"), {
      target: { value: "Pat Lee" },
    });
    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "pat@example.com" },
    });
    fireEvent.change(phone, { target: { value: "555 123 4567" } });
    fireEvent.click(
      screen.getByRole("checkbox", { name: /I agree to be contacted/ }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByRole("radiogroup").className).toContain("is-grid");
  });
});

describe("booking page", () => {
  it("greets the applicant by first name and keeps the agenda beside the calendar", () => {
    const pub = publication();
    renderWithSite(
      <CallFunnelExperience
        publication={pub}
        initialState={bookingState(pub, "unconfirmed")}
        contact={{ name: "Pat Lee", email: "pat@example.com" }}
      />,
    );
    expect(
      screen.getByRole("heading", {
        name: "Thanks, Pat. Pick a time for your call",
      }),
    ).toBeTruthy();
    expect(
      screen.getByRole("heading", { name: "What we’ll cover" }),
    ).toBeTruthy();
    expect(screen.getByText("“Talk to him”")).toBeTruthy();
  });

  it("confirms a booking with the time and the next step", () => {
    const pub = publication();
    renderWithSite(
      <CallFunnelExperience
        publication={pub}
        initialState={bookingState(pub, "booked")}
        contact={{ name: "Pat Lee", email: "pat@example.com" }}
      />,
    );
    expect(
      screen.getByRole("heading", { name: "You’re booked, Pat" }),
    ).toBeTruthy();
    expect(screen.getByText("Your call is booked")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Prepare for your call" }),
    ).toBeTruthy();
    expect(screen.getByText(/reschedule link in your confirmation email/));
  });

  it("promises no email or reschedule link for a booking the team recorded", () => {
    const pub = publication();
    const recorded = bookingState(pub, "booked");
    recorded.booking = { ...recorded.booking, source: "admin" };
    renderWithSite(
      <CallFunnelExperience publication={pub} initialState={recorded} />,
    );
    expect(
      screen.getByText("The team has your call on the calendar"),
    ).toBeTruthy();
    expect(screen.queryByText(/reschedule link/)).toBeNull();
    expect(screen.queryByText(/on the way to your inbox/)).toBeNull();
  });

  it("keeps builder proof ahead of the site quote beside the calendar", () => {
    const pub = publication();
    pub.proof = [
      {
        id: "22222222-2222-4222-8222-222222222222",
        title: "Selected story",
        content: "Chosen in the builder",
        attribution: "Builder Person",
        source_url: "",
      },
    ];
    pub.config.proofIds = ["22222222-2222-4222-8222-222222222222"];
    renderWithSite(
      <CallFunnelExperience
        publication={pub}
        initialState={bookingState(pub, "unconfirmed")}
      />,
    );
    expect(screen.queryByText("“Talk to him”")).toBeNull();
  });
});

describe("accent text", () => {
  function contrastWithWhite(hex: string) {
    const lum = [1, 3, 5]
      .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map((n) => (n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4))
      .reduce((sum, n, i) => sum + n * [0.2126, 0.7152, 0.0722][i], 0);
    return 1.05 / (lum + 0.05);
  }

  it("darkens a pale brand color until small accent text reads at 4.5:1", () => {
    const pub = publication();
    pub.config.theme = { mode: "light", accent: "#92f2cc", font: "sans" };
    const { container } = renderWithSite(
      <CallFunnelExperience publication={pub} />,
    );
    const root = container.querySelector<HTMLElement>(".call-funnel")!;
    const text = root.style.getPropertyValue("--cf-accent-text");
    expect(text).toMatch(/^#[0-9a-f]{6}$/);
    expect(contrastWithWhite(text)).toBeGreaterThanOrEqual(4.5);
  });
});

describe("site config validation", () => {
  it("rejects a showcase keyed by something other than a page address", () => {
    expect(() =>
      validateSiteConfig({
        ...siteConfig,
        callShowcases: { "Not A Slug": showcase },
      }),
    ).toThrow(SiteConfigError);
  });

  it("rejects empty showcase copy", () => {
    expect(() =>
      validateSiteConfig({
        ...siteConfig,
        callShowcases: {
          "work-with-brian": { ...showcase, steps: [{ title: "", text: "x" }] },
        },
      }),
    ).toThrow(/steps\[0\]\.title must not be empty/);
  });
});
