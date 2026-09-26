// @vitest-environment jsdom
import React from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SiteConfigContext } from "@/config/SiteConfigContext";
import { brianPreset } from "@/config/presets/brian";
import { memberPreset } from "@/config/presets/member";
import type { SiteConfig } from "@/config/types";
import MobileSummitBar, {
  MOBILE_BAR_DISMISS_KEY,
} from "@/components/MobileSummitBar";

const route = vi.hoisted(() => ({ pathname: "/" }));
vi.mock("@/lib/router-compat", () => ({
  useLocation: () => route,
}));

function mount(config: SiteConfig = brianPreset) {
  return render(
    <SiteConfigContext.Provider value={config}>
      <MobileSummitBar />
    </SiteConfigContext.Provider>,
  );
}

function scrollPastFirstScreen() {
  act(() => {
    Object.defineProperty(window, "scrollY", {
      configurable: true,
      value: 2000,
    });
    window.dispatchEvent(new Event("scroll"));
  });
}

beforeEach(() => {
  route.pathname = "/";
  sessionStorage.clear();
  Object.defineProperty(window, "scrollY", { configurable: true, value: 0 });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

describe("mobile Summit bar", () => {
  it("keeps chat above the bar when the viewport crosses the phone breakpoint", () => {
    let phone = false;
    vi.stubGlobal("matchMedia", () => ({ matches: phone }));
    mount();
    scrollPastFirstScreen();
    const region = screen.getByRole("region", { name: "Free AI Summit" });
    region.getBoundingClientRect = () => ({ height: 60 }) as DOMRect;
    expect(
      document.documentElement.style.getPropertyValue("--mobile-bar-space"),
    ).toBe("0px");
    phone = true;
    fireEvent(window, new Event("resize"));
    expect(
      document.documentElement.style.getPropertyValue("--mobile-bar-space"),
    ).toBe("60px");
    phone = false;
    fireEvent(window, new Event("resize"));
    expect(
      document.documentElement.style.getPropertyValue("--mobile-bar-space"),
    ).toBe("0px");
  });
  it.each(["/first-ai-build", "/first-ai-build/"])(
    "leaves the project planner's mobile controls clear on %s",
    (pathname) => {
      route.pathname = pathname;
      mount();
      scrollPastFirstScreen();
      expect(
        screen.queryByRole("region", { name: "Free AI Summit" }),
      ).toBeNull();
    },
  );
  it("waits until the visitor scrolls past the first screen", () => {
    mount();
    expect(screen.queryByRole("region", { name: "Free AI Summit" })).toBeNull();
    scrollPastFirstScreen();
    expect(screen.getByRole("region", { name: "Free AI Summit" })).toBeTruthy();
  });

  it("is phone-only and links to the Summit tagged as the sticky placement", () => {
    mount();
    scrollPastFirstScreen();
    const region = screen.getByRole("region", { name: "Free AI Summit" });
    expect(region.className).toContain("md:hidden");
    const link = region.querySelector("a")!;
    const url = new URL(link.getAttribute("href")!);
    expect(url.searchParams.get("_go")).toBe("brian60");
    expect(url.searchParams.get("utm_content")).toBe("sticky");
    expect(url.searchParams.get("utm_campaign")).toBe("summit");
    expect(link.textContent).toContain(brianPreset.event.cta!.label);
  });

  it("stays dismissed for the session", () => {
    mount();
    scrollPastFirstScreen();
    fireEvent.click(
      screen.getByRole("button", { name: "Dismiss the Summit bar" }),
    );
    expect(screen.queryByRole("region", { name: "Free AI Summit" })).toBeNull();
    expect(sessionStorage.getItem(MOBILE_BAR_DISMISS_KEY)).toBe("1");
    cleanup();
    mount();
    scrollPastFirstScreen();
    expect(screen.queryByRole("region", { name: "Free AI Summit" })).toBeNull();
  });

  it("sits above the measurement pill instead of covering it", () => {
    const pill = document.createElement("section");
    pill.setAttribute("data-measurement-pill", "");
    pill.getBoundingClientRect = () => ({ height: 48 }) as DOMRect;
    document.body.appendChild(pill);
    mount();
    scrollPastFirstScreen();
    const region = screen.getByRole("region", { name: "Free AI Summit" });
    expect(region.style.bottom).toBe("60px");
  });

  it("never renders when the site has no Summit event", () => {
    mount(memberPreset);
    scrollPastFirstScreen();
    expect(screen.queryByRole("region")).toBeNull();
  });
});
