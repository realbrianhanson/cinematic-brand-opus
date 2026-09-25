// @vitest-environment jsdom
import React, { useSyncExternalStore } from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PublicSiteChat from "@/components/PublicSiteChat";
import SiteChat from "@/components/SiteChat";

const state = vi.hoisted(() => ({
  snapshot: {
    location: { pathname: "/" },
    matches: [] as { routeId: string; loaderData?: unknown }[],
  },
  listeners: new Set<() => void>(),
}));
vi.mock("@tanstack/react-router", () => ({
  useRouterState: ({
    select,
  }: {
    select: (value: typeof state.snapshot) => unknown;
  }) =>
    select(
      useSyncExternalStore(
        (listener) => {
          state.listeners.add(listener);
          return () => {
            state.listeners.delete(listener);
          };
        },
        () => state.snapshot,
      ),
    ),
}));
vi.mock("@/lib/offerBuilder", () => ({
  readPresentation: (value: unknown) => value,
}));
vi.mock("@/components/SiteChatPanel", () => ({
  default: ({ onClose }: { onClose: () => void }) => (
    <button onClick={onClose}>Close assistant panel</button>
  ),
}));
beforeEach(() => {
  state.snapshot = { location: { pathname: "/" }, matches: [] };
});
afterEach(() => {
  cleanup();
  state.listeners.clear();
});

describe("public assistant navigation", () => {
  it.each(["/first-ai-build", "/first-ai-build/"])(
    "does not compete with the free planner on %s",
    (pathname) => {
      state.snapshot = { location: { pathname }, matches: [] };
      render(<PublicSiteChat />);
      expect(
        screen.queryByRole("button", { name: "Ask a question" }),
      ).toBeNull();
    },
  );
  it("updates visibility on navigation without rerendering the root", () => {
    render(<PublicSiteChat />);
    expect(screen.getByRole("button", { name: "Ask a question" })).toBeTruthy();
    act(() => {
      state.snapshot = { location: { pathname: "/admin" }, matches: [] };
      state.listeners.forEach((listener) => listener());
    });
    expect(screen.queryByRole("button", { name: "Ask a question" })).toBeNull();
    act(() => {
      state.snapshot = {
        location: { pathname: "/offers/focused" },
        matches: [
          {
            routeId: "/offers/$slug",
            loaderData: {
              offer: { presentation: { landing: { focusMode: true } } },
            },
          },
        ],
      };
      state.listeners.forEach((listener) => listener());
    });
    expect(screen.queryByRole("button", { name: "Ask a question" })).toBeNull();
    act(() => {
      state.snapshot = { location: { pathname: "/resources" }, matches: [] };
      state.listeners.forEach((listener) => listener());
    });
    expect(screen.getByRole("button", { name: "Ask a question" })).toBeTruthy();
  });
  it("returns keyboard focus to the launcher after closing the panel", async () => {
    render(<SiteChat />);
    fireEvent.click(screen.getByRole("button", { name: "Ask a question" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Close assistant panel" }),
    );
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Ask a question" }),
    );
  });
});
