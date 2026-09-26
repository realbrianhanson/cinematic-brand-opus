// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PublicOffer } from "@/lib/offers";
const state = vi.hoisted(() => ({
  allowed: true,
  request: vi.fn(),
  observers: [] as Array<(entries: Array<{ isIntersecting: boolean }>) => void>,
}));
vi.mock("@/lib/measurement", () => ({
  MEASUREMENT_CHANGE: "choice-changed",
  measurementAllowed: () => state.allowed,
  measurementForClaim: async () =>
    state.allowed
      ? { session_id: "session", session_token: "token" }
      : undefined,
}));
vi.mock("@/lib/offerExperiments", async () => {
  const original = await vi.importActual<
    typeof import("@/lib/offerExperiments")
  >("@/lib/offerExperiments");
  return { ...original, requestExperiment: state.request };
});
vi.mock("@/pages/OfferLanding", () => ({
  default: ({ offer }: { offer: PublicOffer }) => (
    <div>
      <h1>{offer.presentation?.landing.headline || offer.title}</h1>
      <button>Checkout</button>
      <span>{offer.amount_minor}</span>
    </div>
  ),
}));
import ExperimentOffer from "../ExperimentOffer";
const offer = {
  id: "offer",
  title: "Original title",
  kind: "paid",
  checkout_mode: "native",
  amount_minor: 700,
} as PublicOffer;
const decision = {
  experiment_id: "test",
  variant: "b",
  copy: {
    headline: "Alternate title",
    subheadline: "Useful details",
    ctaText: "Continue",
  },
  exposed: false,
};
beforeEach(() => {
  state.allowed = true;
  state.request.mockReset();
  state.request.mockResolvedValue(decision);
  state.observers = [];
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value: "visible",
  });
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(
        callback: (entries: Array<{ isIntersecting: boolean }>) => void,
      ) {
        state.observers.push(callback);
      }
      observe() {}
      disconnect() {}
    },
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
describe("optional offer copy delivery", () => {
  it("keeps the published offer when measurement is declined", async () => {
    state.allowed = false;
    render(<ExperimentOffer offer={offer} />);
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(screen.getByText("Original title")).toBeTruthy();
    expect(state.request).not.toHaveBeenCalled();
  });
  it("counts exposure only after the assigned headline is visible", async () => {
    render(<ExperimentOffer offer={offer} />);
    await screen.findByText("Alternate title");
    expect(state.request).toHaveBeenCalledTimes(1);
    expect(screen.getByText("700")).toBeTruthy();
    await waitFor(() => expect(state.observers).toHaveLength(1));
    await act(async () => state.observers[0]([{ isIntersecting: true }]));
    await waitFor(() => expect(state.request).toHaveBeenCalledTimes(2));
    expect(state.request.mock.calls[1][3]).toEqual(decision);
  });
  it("does not count a background tab as an exposure", async () => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "hidden",
    });
    render(<ExperimentOffer offer={offer} />);
    await screen.findByText("Alternate title");
    await waitFor(() => expect(state.observers).toHaveLength(1));
    await act(async () => state.observers[0]([{ isIntersecting: true }]));
    expect(state.request).toHaveBeenCalledTimes(1);
  });
  it("preserves copy after a visitor begins interacting", async () => {
    let finish: (value: typeof decision) => void = () => {};
    state.request.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    render(<ExperimentOffer offer={offer} />);
    await waitFor(() => expect(state.request).toHaveBeenCalledTimes(1));
    fireEvent.pointerDown(screen.getByText("Checkout"));
    finish(decision);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.getByText("Original title")).toBeTruthy();
    expect(state.observers).toHaveLength(0);
  });
  it("restores the published copy when consent is withdrawn", async () => {
    render(<ExperimentOffer offer={offer} />);
    await screen.findByText("Alternate title");
    state.allowed = false;
    fireEvent(window, new Event("choice-changed"));
    expect(screen.getByText("Original title")).toBeTruthy();
  });
  it("keeps checkout usable if experiment delivery fails", async () => {
    state.request.mockRejectedValue(new Error("offline"));
    render(<ExperimentOffer offer={offer} />);
    await waitFor(() => expect(state.request).toHaveBeenCalledTimes(1));
    expect(screen.getByText("Original title")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Checkout" })).not.toBeDisabled();
  });
  it("cannot carry copy across offer navigation or source revision changes", async () => {
    const view = render(
      <ExperimentOffer offer={{ ...offer, updated_at: "v1" }} />,
    );
    await screen.findByText("Alternate title");
    state.allowed = false;
    view.rerender(
      <ExperimentOffer
        offer={{
          ...offer,
          id: "second",
          title: "Second offer",
          updated_at: "v1",
        }}
      />,
    );
    expect(screen.getByText("Second offer")).toBeTruthy();
    state.allowed = true;
    view.rerender(<ExperimentOffer offer={{ ...offer, updated_at: "v1" }} />);
    await screen.findByText("Alternate title");
    state.allowed = false;
    view.rerender(
      <ExperimentOffer
        offer={{ ...offer, title: "Revised title", updated_at: "v2" }}
      />,
    );
    expect(screen.getByText("Revised title")).toBeTruthy();
  });
});
