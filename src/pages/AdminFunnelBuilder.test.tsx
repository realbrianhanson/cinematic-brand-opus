// @vitest-environment jsdom
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import AdminFunnelBuilder from "./AdminFunnelBuilder";

vi.mock("@/lib/router-compat", () => ({
  Link: ({
    to,
    children,
    ...props
  }: AnchorHTMLAttributes<HTMLAnchorElement> & {
    to: string;
    children: ReactNode;
  }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));
afterEach(cleanup);

describe("funnel type chooser", () => {
  it("offers all six supported goals with distinct working destinations", () => {
    render(<AdminFunnelBuilder />);
    const chooser = within(
      screen.getByRole("region", { name: "Choose a funnel type" }),
    );
    const destinations = [
      ["Sell a product", "/admin/offers/new?starter=sales"],
      ["Give away a free download", "/admin/offers/new?starter=lead-magnet"],
      ["Book a call", "/admin/call-funnels"],
      [
        "External checkout or registration",
        "/admin/offers/new?starter=external",
      ],
      ["Upsell or downsell offer", "/admin/offers/new?starter=upsell"],
      ["Custom branching funnel", "/admin/funnels"],
    ];
    expect(chooser.getAllByRole("link")).toHaveLength(destinations.length);
    for (const [name, href] of destinations) {
      const choice = chooser.getByRole("link", { name });
      expect(choice.getAttribute("href")).toBe(href);
      expect(within(choice).getAllByRole("listitem")).toHaveLength(3);
      expect(choice.getAttribute("aria-describedby")).toBeTruthy();
    }
  });

  it("keeps saved work accessible without starting a replacement draft", () => {
    render(<AdminFunnelBuilder />);
    const existing = within(
      screen.getByRole("navigation", { name: "Manage existing funnels" }),
    );
    expect(
      existing
        .getByRole("link", { name: "Products & downloads" })
        .getAttribute("href"),
    ).toBe("/admin/offers");
    expect(
      existing.getByRole("link", { name: "Call funnels" }).getAttribute("href"),
    ).toBe("/admin/call-funnels");
    expect(
      existing
        .getByRole("link", { name: "Custom branching funnels" })
        .getAttribute("href"),
    ).toBe("/admin/funnels");
  });

  it("explains payment and follow-up setup without promising one-click billing", () => {
    render(<AdminFunnelBuilder />);
    expect(
      screen.getByText(/Paid follow-ups use a separate checkout/),
    ).toBeTruthy();
    expect(
      screen.getByText(
        /taking payment through this site requires configured Stripe/,
      ),
    ).toBeTruthy();
    expect(screen.queryByText(/one.click/i)).toBeNull();
  });
});
