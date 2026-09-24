// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
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
  it("groups discovery beneath Free Resources in the intended main-menu order", () => {
    mount();
    const nav = screen.getByRole("navigation", { name: "Main navigation" });
    const groups = nav.querySelectorAll("details");
    expect(groups).toHaveLength(1);
    expect(groups[0].querySelector("summary")?.textContent).toBe(
      "Free Resources",
    );
    expect(
      Array.from(groups[0].querySelectorAll("a")).map((link) =>
        link.getAttribute("href"),
      ),
    ).toEqual(["/start-here", "/resources", "/blog", "/news"]);
    const allText = nav.textContent || "";
    expect(allText.indexOf("Shop")).toBeLessThan(
      allText.indexOf("Free Resources"),
    );
    expect(allText.indexOf("Free Resources")).toBeLessThan(
      allText.indexOf("About Brian"),
    );
    expect(allText.indexOf("About Brian")).toBeLessThan(
      allText.indexOf("Speaking"),
    );
    expect(within(nav).queryByText("Expertise")).toBeNull();
    expect(
      within(nav)
        .getByRole("link", { name: "Free AI Summit" })
        .getAttribute("href"),
    ).toBe(
      "https://go.aiforbusiness.com/summit?_go=brian60&utm_source=brianhanson.com&utm_medium=site&utm_campaign=summit&utm_content=nav",
    );
  });
  it("closes resource disclosure on Escape, focus-away and outside interaction", () => {
    mount();
    const detail = document.querySelector("details")!;
    const summary = detail.querySelector("summary")!;
    detail.open = true;
    fireEvent.keyDown(detail, { key: "Escape" });
    expect(detail.open).toBe(false);
    expect(document.activeElement).toBe(summary);
    detail.open = true;
    fireEvent.blur(detail, {
      relatedTarget: screen.getByRole("link", { name: "Shop" }),
    });
    expect(detail.open).toBe(false);
    detail.open = true;
    fireEvent.pointerDown(document.body);
    expect(detail.open).toBe(false);
  });
  it("makes mobile resource destinations usable and closes the drawer after selection", async () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Open menu" }));
    const dialog = screen.getByRole("dialog", { name: "Site menu" });
    const detail = dialog.querySelector("details")!;
    fireEvent.click(detail.querySelector("summary")!);
    expect(detail.open).toBe(true);
    fireEvent.click(within(dialog).getByRole("link", { name: /Start Here/ }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.body.style.overflow).toBe("");
  });
  it("closes the mobile disclosure before closing the containing drawer with Escape", () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Open menu" }));
    const dialog = screen.getByRole("dialog", { name: "Site menu" });
    const detail = dialog.querySelector("details")!;
    fireEvent.click(detail.querySelector("summary")!);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(detail.open).toBe(false);
    expect(screen.getByRole("dialog", { name: "Site menu" })).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
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
