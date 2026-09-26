// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import FunnelJourney from "./FunnelJourney";
import {
  advanceFunnelJourney,
  loadFunnelSession,
  startFunnelJourney,
} from "@/lib/funnelJourneysClient";
import type { FunnelSession } from "@/lib/funnelJourneys";
vi.mock("@/lib/funnelJourneysClient", () => ({
  startFunnelJourney: vi.fn(),
  advanceFunnelJourney: vi.fn(),
  loadFunnelSession: vi.fn(),
  newFunnelToken: () => "a".repeat(64),
}));
const initial: FunnelSession = {
  title: "Find your next step",
  revision: 2,
  version: 0,
  visited: [],
  offer: null,
  step: {
    id: "question",
    kind: "choice",
    title: "What help fits?",
    body: "Choose the support you want.",
    options: [
      { id: "guided", label: "Training" },
      { id: "independent", label: "Myself" },
    ],
  },
};
const end: FunnelSession = {
  ...initial,
  version: 1,
  visited: [{ id: "question", title: "What help fits?" }],
  step: {
    id: "finish",
    kind: "end",
    title: "Keep building",
    body: "Your free plan is yours.",
  },
};
beforeEach(() => {
  vi.resetAllMocks();
  sessionStorage.clear();
  vi.mocked(startFunnelJourney).mockResolvedValue(structuredClone(initial));
});
afterEach(cleanup);
describe("public journey runner", () => {
  it("reuses the bounded planner project through a server-validated transition", async () => {
    const projectSession: FunnelSession = {
      ...initial,
      step: {
        id: "project",
        kind: "choice",
        title: "Project?",
        body: "",
        options: [
          { id: "follow-up", label: "Follow-up" },
          { id: "inquiries", label: "Inquiries" },
        ],
      },
    };
    vi.mocked(startFunnelJourney).mockResolvedValue(projectSession);
    vi.mocked(advanceFunnelJourney).mockResolvedValue(end);
    render(
      <FunnelJourney
        slug="first-ai-build-next-step"
        initialProject="follow-up"
      />,
    );
    await screen.findByRole("heading", { name: "Keep building" });
    expect(advanceFunnelJourney).toHaveBeenCalledWith(
      "a".repeat(64),
      projectSession,
      expect.any(String),
      "follow-up",
    );
    expect(
      sessionStorage.getItem("journey:first-ai-build-next-step:follow-up"),
    ).toBe("a".repeat(64));
  });
  it("leaves unknown planner values and other journeys on their normal first question", async () => {
    render(
      <FunnelJourney
        slug="first-ai-build-next-step"
        initialProject="private business details"
      />,
    );
    await screen.findByRole("heading", { name: "What help fits?" });
    expect(advanceFunnelJourney).not.toHaveBeenCalled();
  });
  it("can safely retry an uncertain automatic project transition", async () => {
    const projectSession: FunnelSession = {
      ...initial,
      step: {
        id: "project",
        kind: "choice",
        title: "Project?",
        body: "",
        options: [
          { id: "follow-up", label: "Follow-up" },
          { id: "inquiries", label: "Inquiries" },
        ],
      },
    };
    vi.mocked(startFunnelJourney).mockResolvedValue(projectSession);
    vi.mocked(advanceFunnelJourney)
      .mockRejectedValueOnce(new Error("Request timed out"))
      .mockResolvedValueOnce(end);
    render(
      <FunnelJourney
        slug="first-ai-build-next-step"
        initialProject="follow-up"
      />,
    );
    await screen.findByRole("alert");
    fireEvent.click(screen.getByRole("button", { name: "Retry this step" }));
    await screen.findByRole("heading", { name: "Keep building" });
    expect(vi.mocked(advanceFunnelJourney).mock.calls[1]).toEqual(
      vi.mocked(advanceFunnelJourney).mock.calls[0],
    );
  });
  it("shows a server question and advances only after a valid choice", async () => {
    vi.mocked(advanceFunnelJourney).mockResolvedValue(end);
    render(<FunnelJourney slug="sample" />);
    await screen.findByRole("heading", { name: "What help fits?" });
    const button = screen.getByRole("button", { name: "Continue" });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("radio", { name: "Myself" }));
    fireEvent.click(button);
    await screen.findByRole("heading", { name: "Keep building" });
    expect(advanceFunnelJourney).toHaveBeenCalledWith(
      "a".repeat(64),
      initial,
      expect.any(String),
      "independent",
    );
    expect(screen.getByLabelText("Journey progress").textContent).toContain(
      "What help fits?",
    );
    expect(screen.queryByRole("button", { name: "Continue" })).toBeNull();
    expect(document.activeElement?.id).toBe("journey-step-title");
  });
  it("reuses the same request and bounded answer after an uncertain response", async () => {
    vi.mocked(advanceFunnelJourney)
      .mockRejectedValueOnce(new Error("Connection interrupted"))
      .mockResolvedValueOnce(end);
    render(<FunnelJourney slug="sample" />);
    fireEvent.click(await screen.findByRole("radio", { name: "Training" }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await screen.findByRole("alert");
    fireEvent.click(screen.getByRole("button", { name: "Retry this step" }));
    await screen.findByRole("heading", { name: "Keep building" });
    expect(vi.mocked(advanceFunnelJourney).mock.calls[1]).toEqual(
      vi.mocked(advanceFunnelJourney).mock.calls[0],
    );
  });
  it("resumes the browser session without exposing its token in a link", async () => {
    sessionStorage.setItem("journey:sample", "b".repeat(64));
    render(<FunnelJourney slug="sample" />);
    await screen.findByRole("heading", { name: "What help fits?" });
    expect(startFunnelJourney).toHaveBeenCalledWith("sample", "b".repeat(64));
    expect(document.body.innerHTML).not.toContain("b".repeat(64));
  });
  it("explains provider handoffs and never accepts a booking confirmation", async () => {
    vi.mocked(startFunnelJourney).mockResolvedValue({
      ...initial,
      step: {
        id: "booking",
        kind: "provider",
        title: "Choose a time",
        body: "Review details.",
        url: "https://calendar.example.com/booking",
      },
    });
    render(<FunnelJourney slug="sample" />);
    const link = await screen.findByRole("link", { name: /Open the provider/ });
    expect(link.getAttribute("href")).toBe(
      "https://calendar.example.com/booking",
    );
    expect(
      screen.getByText(/does not confirm a booking or payment/),
    ).toBeTruthy();
    fireEvent.click(link);
    expect(advanceFunnelJourney).not.toHaveBeenCalled();
  });
  it("never links a retired offer and lets visitors continue without it", async () => {
    vi.mocked(startFunnelJourney).mockResolvedValue({
      ...initial,
      step: {
        id: "offer",
        kind: "offer",
        title: "Your resource",
        body: "",
        offerId: "00000000-0000-4000-8000-000000000001",
      },
    });
    vi.mocked(advanceFunnelJourney).mockResolvedValue(end);
    render(<FunnelJourney slug="sample" />);
    await screen.findByText(/not available right now/);
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await screen.findByRole("heading", { name: "Keep building" });
    expect(vi.mocked(advanceFunnelJourney).mock.calls[0][3]).toBeUndefined();
  });
  it("recovers from a stale transition using current server state", async () => {
    vi.mocked(advanceFunnelJourney).mockRejectedValue(
      new Error("Your progress changed"),
    );
    vi.mocked(loadFunnelSession).mockResolvedValue(end);
    render(<FunnelJourney slug="sample" />);
    fireEvent.click(await screen.findByRole("radio", { name: "Training" }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await screen.findByRole("alert");
    fireEvent.click(
      screen.getByRole("button", { name: "Reload current step" }),
    );
    await screen.findByRole("heading", { name: "Keep building" });
    expect(loadFunnelSession).toHaveBeenCalledWith("a".repeat(64));
  });
  it("handles private or paused journeys without showing a graph", async () => {
    vi.mocked(startFunnelJourney).mockRejectedValue(
      new Error("This journey is not available."),
    );
    render(<FunnelJourney slug="private" />);
    await screen.findByRole("alert");
    expect(screen.queryByRole("radio")).toBeNull();
    await waitFor(() =>
      expect(
        (
          screen.getByRole("button", {
            name: "Start again",
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(false),
    );
  });
  it("ignores an old transition response after changing journeys", async () => {
    let finish: (value: FunnelSession) => void = () => {};
    vi.mocked(advanceFunnelJourney).mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const view = render(<FunnelJourney slug="first" />);
    await screen.findByText("What help fits?");
    fireEvent.click(screen.getByLabelText("Training"));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await waitFor(() => expect(advanceFunnelJourney).toHaveBeenCalledTimes(1));
    vi.mocked(startFunnelJourney).mockResolvedValue({
      ...initial,
      step: { ...initial.step, title: "Different journey" },
    });
    view.rerender(<FunnelJourney slug="second" />);
    await screen.findByText("Different journey");
    finish(end);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(screen.getByText("Different journey")).toBeTruthy();
    expect(screen.queryByText("Keep building")).toBeNull();
  });
});
