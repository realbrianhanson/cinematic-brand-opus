// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import Shop from "@/pages/Shop";
import { shopFilters, type ShopOffer } from "@/lib/shop";
const navigate = vi.hoisted(() => vi.fn());
vi.mock("@/lib/router-compat", () => ({
  Link: ({
    to,
    children,
    ...rest
  }: {
    to: string;
    children: React.ReactNode;
  }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
  useNavigate: () => navigate,
}));
vi.mock("@/components/Nav", () => ({ default: () => <nav>Navigation</nav> }));
vi.mock("@/components/Footer", () => ({
  default: () => <footer>Footer</footer>,
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
afterEach(() => {
  cleanup();
  navigate.mockReset();
});
const free: ShopOffer = {
  id: "1",
  slug: "starter-guide",
  title: "A useful starter guide",
  summary: "A practical next step.",
  cover_url: null,
  kind: "free",
  checkout_mode: "native",
  price_display_mode: "fixed",
  external_url: null,
  external_button_text: "",
  is_affiliate: false,
  affiliate_disclosure: null,
  amount_minor: 0,
  currency: "usd",
  updated_at: "2026-09-19T00:00:00Z",
  shop_category: "resource",
  shop_featured: true,
};
describe("shop browsing", () => {
  it("only offers populated categories and omits a redundant single-price filter", () => {
    render(
      <Shop
        catalog={{
          items: [{ ...free, kind: "paid", shop_category: "training" }],
          total: 1,
          page: 1,
          pageSize: 24,
          availableFilters: {
            categories: ["training", "tool"],
            prices: ["paid"],
          },
        }}
        filters={shopFilters({})}
      />,
    );
    expect(screen.getByRole("link", { name: "Trainings" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Tools" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Courses" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Resources" })).toBeNull();
    expect(
      screen.queryByRole("navigation", { name: "Price filter" }),
    ).toBeNull();
  });
  it("keeps a selected empty saved filter visible and recoverable", () => {
    render(
      <Shop
        catalog={{
          items: [],
          total: 0,
          page: 1,
          pageSize: 24,
          availableFilters: { categories: ["training"], prices: ["paid"] },
        }}
        filters={shopFilters({ category: "course", price: "free" })}
      />,
    );
    expect(
      screen
        .getByRole("link", { name: "Courses" })
        .getAttribute("aria-current"),
    ).toBe("true");
    expect(
      screen.getByRole("link", { name: "Free" }).getAttribute("aria-current"),
    ).toBe("true");
    expect(
      screen.getByRole("link", { name: "Paid" }).getAttribute("href"),
    ).toBe("/shop?category=course&price=paid");
    expect(
      screen.getByRole("link", { name: "Clear filters" }).getAttribute("href"),
    ).toBe("/shop");
  });
  it("retains all filters if catalog-wide availability is unknown", () => {
    render(
      <Shop
        catalog={{
          items: [],
          total: 0,
          page: 1,
          pageSize: 24,
          availableFilters: null,
        }}
        filters={shopFilters({ q: "missing" })}
      />,
    );
    expect(screen.getByRole("link", { name: "Courses" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Free" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Paid" })).toBeTruthy();
  });
  it("shows provider pricing honestly and keeps external cards on local detail pages", () => {
    render(
      <Shop
        catalog={{
          items: [
            {
              ...free,
              title: "External program",
              slug: "external-program",
              checkout_mode: "external",
              kind: "paid",
              price_display_mode: "provider",
              external_url: "https://example.com/program?_go=member60",
            },
          ],
          total: 1,
          page: 1,
          pageSize: 24,
        }}
        filters={shopFilters({})}
      />,
    );
    expect(
      screen
        .getByRole("link", { name: "External program — View current pricing" })
        .getAttribute("href"),
    ).toBe("/offers/external-program");
    expect(screen.getByText("View current pricing")).toBeTruthy();
    expect(screen.queryByText("Free", { selector: "span" })).toBeNull();
    expect(
      document.querySelector('a[href^="https://example.com/program"]'),
    ).toBeNull();
  });
  it("links free and paid cards to their existing opt-in/checkout pages with clear prices", () => {
    render(
      <Shop
        catalog={{
          items: [
            free,
            {
              ...free,
              id: "2",
              slug: "training",
              title: "Workflow training",
              kind: "paid",
              amount_minor: 2900,
              shop_category: "training",
              shop_featured: false,
            },
          ],
          total: 2,
          page: 1,
          pageSize: 24,
        }}
        filters={shopFilters({})}
      />,
    );
    expect(
      screen
        .getByRole("link", { name: "A useful starter guide — Free" })
        .getAttribute("href"),
    ).toBe("/offers/starter-guide");
    expect(
      screen
        .getByRole("link", { name: "Workflow training — $29" })
        .getAttribute("href"),
    ).toBe("/offers/training");
    expect(screen.getAllByText("Featured")).toHaveLength(1);
    expect(screen.queryByRole("button", { name: /Buy/ })).toBeNull();
  });
  it("resets pagination on filter/search changes and keeps existing filters", () => {
    render(
      <Shop
        catalog={{ items: [free], total: 50, page: 2, pageSize: 24 }}
        filters={shopFilters({
          category: "resource",
          price: "free",
          q: "old",
          page: 2,
        })}
      />,
    );
    expect(
      screen.getByRole("link", { name: "Courses" }).getAttribute("href"),
    ).toBe("/shop?q=old&category=course&price=free");
    expect(
      screen.getByRole("link", { name: "Next page" }).getAttribute("href"),
    ).toContain("page=3");
    fireEvent.change(screen.getByLabelText("Search the shop by title"), {
      target: { value: "new query" },
    });
    fireEvent.submit(screen.getByRole("search"));
    expect(navigate).toHaveBeenCalledWith(
      "/shop?q=new+query&category=resource&price=free",
    );
  });
  it("provides honest empty and filtered states without inventing products", () => {
    const { rerender } = render(
      <Shop
        catalog={{ items: [], total: 0, page: 1, pageSize: 24 }}
        filters={shopFilters({})}
      />,
    );
    expect(
      screen.getByRole("heading", { name: "Something useful is on the way" }),
    ).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: /Explore free resources/ })
        .getAttribute("href"),
    ).toBe("/resources");
    rerender(
      <Shop
        catalog={{ items: [], total: 0, page: 1, pageSize: 24 }}
        filters={shopFilters({ q: "missing" })}
      />,
    );
    expect(
      screen
        .getByRole("link", { name: /Browse all items/ })
        .getAttribute("href"),
    ).toBe("/shop");
  });
});
