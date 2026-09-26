// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SITE_THEME_BOOTSTRAP } from "../siteTheme";

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute("data-site-theme");
  document.documentElement.className = "existing-class";
});
afterEach(() => vi.restoreAllMocks());

describe("theme before first paint", () => {
  it.each([
    [null, "dark"],
    ["dark", "dark"],
    ["light", "light"],
    ["system", "dark"],
    ["unexpected", "dark"],
  ])("uses saved %s as %s without changing classes", (saved, expected) => {
    if (saved !== null) localStorage.setItem("admin-theme", saved);
    new Function(SITE_THEME_BOOTSTRAP)();
    expect(document.documentElement.dataset.siteTheme).toBe(expected);
    expect(document.documentElement.className).toBe("existing-class");
  });

  it("keeps the dark default when browser storage is blocked", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("Storage blocked");
    });
    expect(() => new Function(SITE_THEME_BOOTSTRAP)()).not.toThrow();
    expect(document.documentElement.dataset.siteTheme).toBe("dark");
  });
});
