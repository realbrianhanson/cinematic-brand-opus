// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import FirstAiBuild from "@/pages/FirstAiBuild";
import { buildFirstAiPlan, PROJECT_OPTIONS } from "@/lib/firstAiBuild";
import { subscribeToNewsletter } from "@/lib/newsletterSubscribe";
import { recordMeasurement } from "@/lib/measurement";
import type { ShopOffer } from "@/lib/shop";
import { getFunnelJourney } from "@/lib/funnelJourneysClient";
vi.mock("@/lib/funnelJourneysClient", () => ({
  getFunnelJourney: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/measurement", () => ({ recordMeasurement: vi.fn() }));
vi.mock("@/components/Nav", () => ({ default: () => <nav /> }));
vi.mock("@/components/Footer", () => ({ default: () => <footer /> }));
vi.mock("@/components/FormPrivacyLink", () => ({
  default: () => <a href="/privacy">Privacy notice</a>,
}));
vi.mock("@/lib/newsletterSubscribe", () => ({
  subscribeToNewsletter: vi.fn(),
}));

const input = {
  project: "inquiries",
  forWhom: "my-business",
  businessType: "Landscape design",
  audience: "Local homeowners",
} as const;
function createPlan() {
  fireEvent.click(
    screen.getByRole("radio", { name: new RegExp(PROJECT_OPTIONS[1].title) }),
  );
  fireEvent.click(screen.getByRole("radio", { name: "My own business" }));
  fireEvent.change(screen.getByLabelText(/Type of business/), {
    target: { value: input.businessType },
  });
  fireEvent.change(screen.getByLabelText(/Who does it help/), {
    target: { value: input.audience },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Create my free build plan" }),
  );
}

beforeEach(() => {
  vi.mocked(getFunnelJourney).mockResolvedValue(null);
  vi.stubGlobal("scrollTo", vi.fn());
  Element.prototype.scrollIntoView = vi.fn();
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
  });
  URL.createObjectURL = vi.fn().mockReturnValue("blob:test-plan");
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("Your First AI Build", () => {
  it("shows the continuation only after publication and sends no planner inputs", async () => {
    vi.mocked(getFunnelJourney).mockResolvedValue({
      slug: "first-ai-build-next-step",
      title: "Next step",
      revision: 2,
    });
    render(<FirstAiBuild offers={[]} />);
    createPlan();
    expect(
      screen.getByRole("heading", { name: buildFirstAiPlan(input).title }),
    ).toBeTruthy();
    const link = await screen.findByRole("link", { name: "Find my next step" });
    expect(link.getAttribute("href")).toBe(
      "/funnels/first-ai-build-next-step?project=inquiries",
    );
    expect(getFunnelJourney).toHaveBeenCalledExactlyOnceWith(
      "first-ai-build-next-step",
    );
    expect(link.getAttribute("href")).not.toContain(input.businessType);
  });
  it("keeps the immediate free output when the optional journey is unavailable", async () => {
    vi.mocked(getFunnelJourney).mockRejectedValue(new Error("Not deployed"));
    render(<FirstAiBuild offers={[]} />);
    createPlan();
    expect(
      screen.getByRole("heading", { name: buildFirstAiPlan(input).title }),
    ).toBeTruthy();
    await waitFor(() => expect(getFunnelJourney).toHaveBeenCalled());
    expect(
      screen.queryByRole("link", { name: "Find my next step" }),
    ).toBeNull();
    expect(
      screen.getByRole("button", { name: "Copy build prompt" }),
    ).toBeTruthy();
  });
  it("delivers a task-specific plan without email, waiting for a network response, or storing business inputs", async () => {
    const storage = vi.spyOn(Storage.prototype, "setItem");
    render(<FirstAiBuild offers={[]} />);
    createPlan();
    const plan = buildFirstAiPlan(input);
    const heading = await screen.findByRole("heading", { name: plan.title });
    expect(document.activeElement).toBe(heading);
    expect(
      screen.getByText(
        (_, element) =>
          element?.tagName === "PRE" &&
          element.textContent === plan.buildPrompt,
      ),
    ).toBeTruthy();
    expect(screen.getAllByText(plan.tests[0].action).length).toBeGreaterThan(0);
    expect(vi.mocked(subscribeToNewsletter)).not.toHaveBeenCalled();
    expect(storage).not.toHaveBeenCalled();
    expect(window.location.search).toBe("");
    expect(recordMeasurement).toHaveBeenCalledWith([
      {
        type: "build_plan_created",
        path: "/first-ai-build",
        project: "inquiries",
      },
    ]);
    expect(
      JSON.stringify(vi.mocked(recordMeasurement).mock.calls),
    ).not.toContain(input.businessType);
    expect(
      JSON.stringify(vi.mocked(recordMeasurement).mock.calls),
    ).not.toContain(input.audience);
    fireEvent.click(screen.getByRole("button", { name: "Copy build prompt" }));
    await screen.findByText(
      "Build prompt copied. Paste it into your app builder to begin.",
    );
    expect(recordMeasurement).toHaveBeenLastCalledWith([
      {
        type: "build_prompt_copied",
        path: "/first-ai-build",
        project: "inquiries",
      },
    ]);
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      plan.buildPrompt,
    );
  });

  it("keeps answers when editing and generates a different project after changing the task", () => {
    render(<FirstAiBuild offers={[]} />);
    createPlan();
    fireEvent.click(screen.getByRole("button", { name: "Edit my answers" }));
    expect(
      (screen.getByLabelText(/Type of business/) as HTMLInputElement).value,
    ).toBe(input.businessType);
    fireEvent.click(
      screen.getByRole("radio", { name: new RegExp(PROJECT_OPTIONS[2].title) }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Create my free build plan" }),
    );
    expect(
      screen.getByRole("heading", {
        name: buildFirstAiPlan({ ...input, project: "onboarding" }).title,
      }),
    ).toBeTruthy();
  });

  it("offers selectable text when the clipboard is unavailable", async () => {
    vi.mocked(navigator.clipboard.writeText).mockRejectedValue(
      new Error("denied"),
    );
    render(<FirstAiBuild offers={[]} />);
    createPlan();
    fireEvent.click(screen.getByRole("button", { name: "Copy build prompt" }));
    await screen.findByText(/Copy is unavailable here/);
    expect(recordMeasurement).toHaveBeenCalledTimes(1);
    expect(
      screen
        .getByText(
          (_, element) =>
            element?.tagName === "PRE" &&
            element.textContent === buildFirstAiPlan(input).buildPrompt,
        )
        .closest("details")?.open,
    ).toBe(true);
  });

  it("downloads the entire plan with a stable filename and cleans up its object URL", async () => {
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});
    render(<FirstAiBuild offers={[]} />);
    createPlan();
    fireEvent.click(screen.getByRole("button", { name: "Download full plan" }));
    expect(URL.createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    const anchor = click.mock.instances[0] as HTMLAnchorElement;
    expect(anchor.download).toBe("first-ai-build-inquiries.md");
    expect(anchor.href).toBe("blob:test-plan");
    await waitFor(
      () => expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:test-plan"),
      { timeout: 2000 },
    );
    expect(screen.getByText(/Download started/)).toBeTruthy();
    expect(recordMeasurement).toHaveBeenLastCalledWith([
      {
        type: "build_plan_downloaded",
        path: "/first-ai-build",
        project: "inquiries",
      },
    ]);
  });

  it("only submits the optional newsletter email and accurately reports delivery failures", async () => {
    vi.mocked(subscribeToNewsletter).mockResolvedValue({
      state: "error",
      message:
        "We couldn't send your confirmation email just now. Please try again in a few minutes",
    });
    render(<FirstAiBuild offers={[]} />);
    createPlan();
    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "reader@example.com" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Subscribe to Brian’s emails" }),
    );
    await screen.findByText(/We couldn't send your confirmation/);
    expect(subscribeToNewsletter).toHaveBeenCalledExactlyOnceWith(
      "reader@example.com",
      "first-ai-build",
    );
    expect(
      screen.getByRole("button", { name: "Download full plan" }),
    ).toBeTruthy();
    expect(screen.queryByText(/plan has been emailed/i)).toBeNull();
  });

  it("shows relevant available training and a free fallback when offers are unavailable", () => {
    const offers = [
      {
        id: "12345678-1234-4123-8123-123456789012",
        slug: "app-building-workshop",
        title: "App Building Workshop",
        kind: "paid",
      },
      { slug: "pushten", title: "PushTen", kind: "paid" },
    ] as ShopOffer[];
    const { unmount } = render(<FirstAiBuild offers={offers} />);
    createPlan();
    expect(
      screen
        .getByRole("link", { name: "Explore the App Building Workshop" })
        .getAttribute("href"),
    ).toBe("/offers/app-building-workshop");
    expect(
      screen
        .getByRole("link", { name: /Explore PushTen/ })
        .getAttribute("href"),
    ).toBe("/offers/pushten");
    const trainingLink = screen.getByRole("link", {
      name: "Explore the App Building Workshop",
    });
    trainingLink.addEventListener("click", (event) => event.preventDefault(), {
      once: true,
    });
    fireEvent.click(trainingLink);
    expect(recordMeasurement).toHaveBeenLastCalledWith([
      {
        type: "build_training_clicked",
        path: "/first-ai-build",
        project: "inquiries",
        offer_id: offers[0].id,
      },
    ]);
    unmount();
    render(<FirstAiBuild offers={[]} />);
    createPlan();
    expect(
      screen
        .getByRole("link", { name: "Read the free getting-started guide" })
        .getAttribute("href"),
    ).toBe("/guides/ai-for-small-business");
    expect(screen.queryByRole("link", { name: /Explore PushTen/ })).toBeNull();
  });
});
