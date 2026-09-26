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
import { renderToString } from "react-dom/server";
import { buildFirstAiPlan, PROJECT_OPTIONS } from "@/lib/firstAiBuild";
import { subscribeToNewsletter } from "@/lib/newsletterSubscribe";
import { recordMeasurement } from "@/lib/measurement";
import type { ShopOffer } from "@/lib/shop";
import { getFunnelJourney } from "@/lib/funnelJourneysClient";
import { firstBuildRecoveryKey } from "@/lib/firstAiBuildRecovery";
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
  window.localStorage.clear();
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
  it("delivers a task-specific plan without email or network waiting, keeping recovery local", async () => {
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
    expect(storage).toHaveBeenCalled();
    expect(
      storage.mock.calls.every(([key]) =>
        key.startsWith("first-ai-build:recovery:v1:"),
      ),
    ).toBe(true);
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
    fireEvent.click(
      screen.getByRole("button", { name: "Resume saved progress" }),
    );
    expect(
      screen
        .getByRole("link", { name: "Read the free getting-started guide" })
        .getAttribute("href"),
    ).toBe("/guides/ai-for-small-business");
    expect(screen.queryByRole("link", { name: /Explore PushTen/ })).toBeNull();
  });
  it("offers explicit recovery after remount without creating a second measured plan", () => {
    const first = render(<FirstAiBuild />);
    createPlan();
    first.unmount();
    render(<FirstAiBuild />);
    expect(
      screen.queryByRole("heading", { name: buildFirstAiPlan(input).title }),
    ).toBeNull();
    expect(
      (
        screen.getByRole("button", {
          name: "Create my free build plan",
        }) as HTMLButtonElement
      ).closest("fieldset")?.disabled,
    ).toBe(true);
    fireEvent.click(
      screen.getByRole("button", { name: "Resume saved progress" }),
    );
    expect(
      screen.getByRole("heading", { name: buildFirstAiPlan(input).title }),
    ).toBeTruthy();
    expect(screen.getByText(/saved progress is restored/)).toBeTruthy();
    expect(
      vi
        .mocked(recordMeasurement)
        .mock.calls.filter(
          ([events]) => events[0].type === "build_plan_created",
        ),
    ).toHaveLength(1);
  });

  it("restores unfinished edits instead of replacing them with the older generated plan", () => {
    const first = render(<FirstAiBuild />);
    createPlan();
    fireEvent.click(screen.getByRole("button", { name: "Edit my answers" }));
    fireEvent.change(screen.getByLabelText(/Type of business/), {
      target: { value: "New draft business " },
    });
    fireEvent.click(
      screen.getByRole("radio", { name: new RegExp(PROJECT_OPTIONS[2].title) }),
    );
    first.unmount();
    render(<FirstAiBuild />);
    fireEvent.click(
      screen.getByRole("button", { name: "Resume saved progress" }),
    );
    expect(
      (screen.getByLabelText(/Type of business/) as HTMLInputElement).value,
    ).toBe("New draft business ");
    expect(
      (
        screen.getByRole("radio", {
          name: new RegExp(PROJECT_OPTIONS[2].title),
        }) as HTMLInputElement
      ).checked,
    ).toBe(true);
    expect(
      screen.queryByRole("button", { name: "Edit my answers" }),
    ).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "Create my free build plan" }),
    );
    expect(
      screen.getByRole("heading", {
        name: buildFirstAiPlan({ ...input, project: "onboarding" }).title,
      }),
    ).toBeTruthy();
  });

  it("confirms starting over and only removes the planner copy", () => {
    localStorage.setItem("unrelated-setting", "keep");
    render(<FirstAiBuild />);
    createPlan();
    fireEvent.click(screen.getByRole("button", { name: "Start over" }));
    fireEvent.click(screen.getByRole("button", { name: "Keep my progress" }));
    expect(
      screen.getByRole("heading", { name: buildFirstAiPlan(input).title }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Start over" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Clear and start over" }),
    );
    expect(
      (screen.getByLabelText(/Type of business/) as HTMLInputElement).value,
    ).toBe("");
    expect(
      localStorage.getItem(
        firstBuildRecoveryKey("brian|https://brianhanson.com|Brian Hanson"),
      ),
    ).toBeNull();
    expect(localStorage.getItem("unrelated-setting")).toBe("keep");
  });

  it("keeps a temporary session usable when storage writes fail", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("full");
    });
    render(<FirstAiBuild />);
    createPlan();
    expect(
      screen.getByRole("heading", { name: buildFirstAiPlan(input).title }),
    ).toBeTruthy();
    expect(
      screen.getByText(/Temporary session: browser saving is unavailable/),
    ).toBeTruthy();
  });

  it("shows an actionable recovery notice for malformed storage without overwriting it", () => {
    const key = firstBuildRecoveryKey(
      "brian|https://brianhanson.com|Brian Hanson",
    );
    localStorage.setItem(key, "invalid");
    render(<FirstAiBuild />);
    expect(
      screen.getByText(/different version or could not be read/),
    ).toBeTruthy();
    expect(localStorage.getItem(key)).toBe("invalid");
    fireEvent.click(screen.getByRole("button", { name: "Start over" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Clear and start over" }),
    );
    createPlan();
    expect(
      screen.getByRole("heading", { name: buildFirstAiPlan(input).title }),
    ).toBeTruthy();
  });

  it("does not replace an active draft when another tab updates saved progress", () => {
    render(<FirstAiBuild />);
    fireEvent.change(screen.getByLabelText(/Type of business/), {
      target: { value: "My current draft" },
    });
    const key = firstBuildRecoveryKey(
      "brian|https://brianhanson.com|Brian Hanson",
    );
    localStorage.setItem(key, "another-tab-value");
    fireEvent.change(screen.getByLabelText(/Who does it help/), {
      target: { value: "My audience" },
    });
    expect(screen.getByText(/Another tab changed the saved copy/)).toBeTruthy();
    expect(
      (screen.getByLabelText(/Type of business/) as HTMLInputElement).value,
    ).toBe("My current draft");
    expect(localStorage.getItem(key)).toBe("another-tab-value");
  });

  it("does not restore another brand’s saved plan", () => {
    const first = render(<FirstAiBuild recoveryScope="brand-a" />);
    createPlan();
    first.rerender(<FirstAiBuild recoveryScope="brand-b" />);
    expect(
      screen.queryByRole("button", { name: "Resume saved progress" }),
    ).toBeNull();
    expect(
      (screen.getByLabelText(/Type of business/) as HTMLInputElement).value,
    ).toBe("");
  });

  it("prints a full plan document with no optional promotion or email form", () => {
    const print = vi.spyOn(window, "print").mockImplementation(() => {});
    render(<FirstAiBuild />);
    createPlan();
    fireEvent.click(
      screen.getByRole("button", { name: "Print / Save as PDF" }),
    );
    expect(print).toHaveBeenCalledOnce();
    const document = window.document.querySelector(".first-build-print");
    const plan = buildFirstAiPlan(input);
    // Tailwind preflight hides [hidden] with !important, blanking print output.
    expect(document?.hasAttribute("hidden")).toBe(false);
    expect(document?.textContent).toContain(plan.buildPrompt);
    expect(document?.textContent).toContain(plan.sample.input);
    expect(document?.textContent).toContain(plan.sample.output);
    expect(document?.textContent).toContain(plan.tests[2].expected);
    expect(document?.querySelector("form, nav, button, a")).toBeNull();
    expect(document?.textContent).not.toMatch(
      /Keep building with Brian|PushTen|Subscribe/,
    );
    expect(screen.getByText(/Choose “Save as PDF”/)).toBeTruthy();
    expect(screen.queryByText(/PDF saved/)).toBeNull();
  });

  it("keeps download available if the browser cannot print", () => {
    vi.spyOn(window, "print").mockImplementation(() => {
      throw new Error("unavailable");
    });
    render(<FirstAiBuild />);
    createPlan();
    fireEvent.click(
      screen.getByRole("button", { name: "Print / Save as PDF" }),
    );
    expect(screen.getByText(/Printing is unavailable here/)).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Download full plan" }),
    ).toBeTruthy();
  });
  it("does not read recovery storage during server rendering", () => {
    const read = vi.spyOn(Storage.prototype, "getItem");
    const html = renderToString(<FirstAiBuild />);
    expect(read).not.toHaveBeenCalled();
    expect(html).toContain("Checking this browser for a saved plan");
  });

  it("does not claim that a denied browser clear removed the saved copy", () => {
    render(<FirstAiBuild />);
    createPlan();
    const key = firstBuildRecoveryKey(
      "brian|https://brianhanson.com|Brian Hanson",
    );
    const saved = localStorage.getItem(key);
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new Error("denied");
    });
    fireEvent.click(screen.getByRole("button", { name: "Start over" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Clear and start over" }),
    );
    expect(
      screen.getByText(/browser storage could not be cleared/),
    ).toBeTruthy();
    expect(
      (screen.getByLabelText(/Type of business/) as HTMLInputElement).value,
    ).toBe("");
    expect(localStorage.getItem(key)).toBe(saved);
  });
});
