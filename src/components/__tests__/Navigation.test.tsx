// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
  waitFor,
} from "@testing-library/react";
import { SiteConfigContext } from "@/config/SiteConfigContext";
import { brianPreset } from "@/config/presets/brian";
import { memberPreset } from "@/config/presets/member";
import type { SiteConfig } from "@/config/types";
import Nav from "@/components/Nav";
const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  pathname: "/blog/article",
}));
vi.mock("@/lib/router-compat", () => ({
  Link: ({
    to,
    children,
    onClick,
    ...props
  }: {
    to: string;
    children: React.ReactNode;
    onClick?: React.MouseEventHandler<HTMLAnchorElement>;
  }) => (
    <a
      href={to}
      {...props}
      onClick={(event) => {
        event.preventDefault();
        onClick?.(event);
      }}
    >
      {children}
    </a>
  ),
  useLocation: () => ({ pathname: mocks.pathname }),
  useNavigate: () => mocks.navigate,
}));
afterEach(() => {
  cleanup();
  mocks.navigate.mockReset();
});
function mount(config: SiteConfig = brianPreset) {
  return render(
    <SiteConfigContext.Provider value={config}>
      <Nav />
    </SiteConfigContext.Provider>,
  );
}
describe("public navigation journeys", () => {
  it("keeps the desktop menu concise and resource discovery in the footer configuration", () => {
    mount();
    const nav = screen.getByRole("navigation", { name: "Main navigation" });
    expect(within(nav).queryByText("Free Resources")).toBeNull();
    expect(within(nav).queryByRole("link", { name: "Resources" })).toBeNull();
    expect(
      brianPreset.footer.routeLinks.some((link) => link.href === "/resources"),
    ).toBe(true);
    expect(
      within(nav).getByRole("link", { name: "Shop" }).getAttribute("href"),
    ).toBe("/shop");
  });
  it("keeps the mobile menu concise and closes it after navigation", () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Open menu" }));
    const dialog = screen.getByRole("dialog", { name: "Site menu" });
    expect(within(dialog).queryByText("Free Resources")).toBeNull();
    fireEvent.click(within(dialog).getByRole("link", { name: "Shop" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.body.style.overflow).toBe("");
  });
  it("closes the mobile drawer with Escape and restores trigger focus", async () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Open menu" }));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole("button", { name: "Open menu" }),
      ),
    );
  });
  it("sends About Brian to the dedicated /about page", () => {
    mount();
    const about = screen.getByRole("link", { name: "About Brian" });
    expect(about.getAttribute("href")).toBe("/about");
    fireEvent.click(about);
    expect(mocks.navigate).not.toHaveBeenCalledWith("/#story");
  });
  it("does not inherit owner destinations or disabled sections in a member install", () => {
    const { unmount } = mount(memberPreset);
    expect(screen.queryByRole("link", { name: "About Brian" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Speaking" })).toBeNull();
    expect(document.body.textContent).not.toContain("Brian");
    unmount();
    mount({
      ...brianPreset,
      sections: { ...brianPreset.sections, story: false, speaking: false },
    });
    expect(screen.queryByRole("link", { name: "About Brian" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Speaking" })).toBeNull();
  });
});
