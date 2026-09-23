// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import AdminLayout from "../AdminLayout";

vi.mock("@/config/SiteConfigContext", () => ({
  useSiteConfig: () => ({
    identity: { name: "Brian Hanson", logoInitials: "BH" },
  }),
}));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { email: "a@example.com" }, signOut: vi.fn() }),
}));
vi.mock("@/hooks/useAdminPreferences", () => ({
  useAdminPreferences: () => ({
    prefs: { theme: "dark" },
    updatePref: vi.fn(),
  }),
}));
vi.mock("@/lib/router-compat", () => ({
  useNavigate: () => vi.fn(),
  Outlet: () => <h1>Categories</h1>,
  Link: ({ to, children, ...rest }: { to: string; children: ReactNode }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
  NavLink: ({
    to,
    children,
    className,
    end: _end,
    ...rest
  }: {
    to: string;
    children: ReactNode;
    end?: boolean;
    className?: (s: { isActive: boolean }) => string;
  }) => (
    <a href={to} className={className?.({ isActive: false })} {...rest}>
      {children}
    </a>
  ),
}));

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});
afterEach(cleanup);

describe("admin layout", () => {
  it("offers a skip link as the first focus stop that targets the main region", () => {
    const { container } = render(<AdminLayout />);
    const skip = screen.getByRole("link", { name: "Skip to content" });
    expect(skip.getAttribute("href")).toBe("#admin-main");
    const focusables = container.querySelectorAll("a[href], button");
    expect(focusables[0]).toBe(skip);
    const main = screen.getByRole("main");
    expect(main.id).toBe("admin-main");
    expect(main.getAttribute("tabindex")).toBe("-1");
  });

  it("labels the page jumper as navigation, not a content search", () => {
    render(<AdminLayout />);
    expect(screen.getAllByRole("button", { name: "Go to page" }).length).toBe(
      2,
    );
    expect(screen.queryByText("Find anything")).toBeNull();
    expect(screen.getByText("Go to page")).toBeTruthy();
  });
});
