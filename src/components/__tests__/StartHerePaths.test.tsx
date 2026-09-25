// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { SiteConfigContext } from "@/config/SiteConfigContext";
import { brianPreset } from "@/config/presets/brian";
import { memberPreset } from "@/config/presets/member";
import StartHere from "@/pages/StartHere";
import { startHereGoal, startHereRecommendation } from "@/lib/startHere";
import type { ShopOffer } from "@/lib/shop";

vi.mock("@/components/Nav", () => ({ default: () => <nav /> }));
vi.mock("@/components/Footer", () => ({ default: () => <footer /> }));
beforeEach(() => vi.spyOn(window, "scrollTo").mockImplementation(() => {}));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
const offers = [
  {
    id: "1",
    slug: "unrelated-kit",
    title: "Unrelated kit",
    kind: "free",
    summary: "Wrong goal",
  },
  {
    id: "2",
    slug: "ai-follow-up-starter-kit",
    title: "Follow-Up Starter Kit",
    kind: "free",
    summary: "A follow-up guide",
  },
  {
    id: "3",
    slug: "app-building-workshop",
    title: "App Building Workshop",
    kind: "paid",
    summary: "Workshop details",
  },
] as ShopOffer[];

async function setup(url = "/start-here", member = false) {
  const rootRoute = createRootRoute();
  const route = createRoute({
    getParentRoute: () => rootRoute,
    path: "/start-here",
    component: () => (
      <SiteConfigContext.Provider value={member ? memberPreset : brianPreset}>
        <StartHere offers={offers} />
      </SiteConfigContext.Provider>
    ),
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([route]),
    history: createMemoryHistory({ initialEntries: [url] }),
    defaultPendingMinMs: 0,
  });
  await router.load();
  render(<RouterProvider router={router} />);
  await screen.findByRole("heading", { level: 1 });
  return router;
}

describe("goal-based visitor paths", () => {
  it("uses a relevant published free listing, never whichever free offer comes first", async () => {
    await setup();
    expect(
      screen
        .getByRole("link", { name: "Get the free follow-up kit" })
        .getAttribute("href"),
    ).toBe("/offers/ai-follow-up-starter-kit");
    expect(screen.queryByText("Unrelated kit")).toBeNull();
    expect(
      screen.getByRole("heading", {
        name: "From messy notes to a useful follow-up",
      }),
    ).toBeTruthy();
  });
  it("supports direct links, goal changes and back navigation without losing campaign parameters", async () => {
    const router = await setup("/start-here?goal=build&utm_source=partner");
    expect(
      screen
        .getByRole("link", { name: "See what the workshop includes" })
        .getAttribute("href"),
    ).toBe("/offers/app-building-workshop");
    expect(
      screen.getByText("Paid training · review the details first"),
    ).toBeTruthy();
    expect(
      screen.queryByRole("heading", {
        name: "From messy notes to a useful follow-up",
      }),
    ).toBeNull();
    fireEvent.click(screen.getByRole("link", { name: /Improve my marketing/ }));
    await screen.findByRole("link", { name: "Read the free marketing guide" });
    expect(router.state.location.searchStr).toContain("utm_source=partner");
    expect(router.state.location.searchStr).toContain("goal=marketing");
    router.history.back();
    await screen.findByRole("link", { name: "See what the workshop includes" });
    await waitFor(() =>
      expect(
        screen
          .getByRole("link", { name: /Build a website or app/ })
          .getAttribute("aria-current"),
      ).toBe("page"),
    );
  });
  it("falls back to free reading if the matching listing is absent or no longer free", () => {
    expect(startHereGoal("__proto__")).toBe("follow-up");
    expect(
      startHereRecommendation("follow-up", [{ ...offers[1], kind: "paid" }])
        .resource.href,
    ).toBe("/guides/ai-sales-customer-service");
    expect(startHereRecommendation("build", []).resource.href).toBe(
      "/guides/ai-for-small-business",
    );
  });
  it("keeps Brian-specific paths and claims out of member sites", async () => {
    await setup("/start-here?goal=build", true);
    expect(
      screen.queryByRole("navigation", { name: "Choose what you want to do" }),
    ).toBeNull();
    expect(screen.queryByText("App Building Workshop")).toBeNull();
    expect(
      screen.getByRole("heading", { name: "Find your next useful step" }),
    ).toBeTruthy();
  });
});
