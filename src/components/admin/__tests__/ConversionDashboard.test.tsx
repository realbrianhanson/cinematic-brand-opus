// @vitest-environment jsdom
import React from "react";
import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc } }));
vi.mock("@/lib/router-compat", () => ({
  Link: ({
    to,
    children,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { to: string }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));
vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-router")>()),
  Link: ({
    to,
    search,
    children,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & {
    to: string;
    search?: { days?: unknown };
  }) => (
    <a
      href={to}
      data-days={JSON.stringify(search?.days)}
      data-testid="range-link"
      {...props}
    >
      {children}
    </a>
  ),
}));
import { createMemoryHistory, createRouter } from "@tanstack/react-router";
import { routeTree } from "@/routeTree.gen";
// External reconciliation has its own provider/RPC tests.
vi.mock("../ExternalConversionPanel", () => ({ default: () => null }));
import ConversionDashboard, {
  ConversionOverview,
} from "../ConversionDashboard";
import { SiteConfigContext } from "@/config/SiteConfigContext";
import { memberPreset } from "@/config/presets/member";
import {
  campaignLabel,
  conversionMoney,
  conversionRate,
  conversionSearch,
  loadConversionReport,
  type ConversionReport,
} from "@/lib/conversions";

function report(): ConversionReport {
  return {
    generated_at: new Date().toISOString(),
    measurement_started_at: "2026-09-19T10:00:00+00:00",
    range: {
      start: "2026-08-21T00:00:00+00:00",
      end: "2026-09-19T12:00:00+00:00",
      timezone: "UTC",
    },
    summary: {
      measured_sessions: 0,
      page_views: 0,
      shop_sessions: 0,
      offer_sessions: 0,
      outbound_sessions: 0,
      attributed_free_claim_sessions: 0,
      attributed_paid_order_sessions: 0,
    },
    native_totals: {
      free_claims: 0,
      paid_orders: 0,
      test_paid_orders: 0,
      unknown_mode_paid_orders: 0,
      refunded_orders: 0,
      download_links_issued: 0,
      revenue_by_currency: [],
    },
    coverage: {
      session_retention_days: 90,
      unattributed_free_claims: 0,
      unattributed_paid_orders: 0,
    },
    daily: [],
    sources: [],
    offers: [],
    placements: [],
  };
}
function populated(): ConversionReport {
  const result = report();
  result.summary = {
    measured_sessions: 10,
    page_views: 30,
    shop_sessions: 8,
    offer_sessions: 5,
    outbound_sessions: 4,
    attributed_free_claim_sessions: 2,
    attributed_paid_order_sessions: 1,
  };
  result.native_totals = {
    free_claims: 23,
    paid_orders: 7,
    test_paid_orders: 3,
    unknown_mode_paid_orders: 2,
    refunded_orders: 4,
    download_links_issued: 16,
    revenue_by_currency: [
      { currency: "usd", amount_minor: 10000 },
      { currency: "eur", amount_minor: 12000 },
    ],
  };
  result.coverage = {
    session_retention_days: 90,
    unattributed_free_claims: 21,
    unattributed_paid_orders: 6,
  };
  result.daily = [
    {
      date: "2026-09-19",
      sessions: 10,
      outbound_sessions: 4,
      free_claim_sessions: 2,
      paid_order_sessions: 1,
    },
  ];
  result.sources = [
    {
      source: "newsletter",
      medium: "email",
      campaign: "starter_kit_launch",
      sessions: 4,
      shop_sessions: 4,
      offer_sessions: 3,
      outbound_sessions: 2,
      free_claim_sessions: 2,
      paid_order_sessions: 1,
      free_claims: 3,
      paid_orders: 1,
    },
  ];
  result.offers = [
    {
      offer_id: "10000000-0000-4000-8000-000000000001",
      title: "Starter Kit",
      slug: "starter-kit",
      checkout_mode: "native",
      view_sessions: 4,
      outbound_sessions: 0,
      free_claim_sessions: 2,
      paid_order_sessions: 0,
      free_claims: 3,
      paid_orders: 0,
    },
    {
      offer_id: "10000000-0000-4000-8000-000000000002",
      title: "Partner Workshop",
      slug: "partner-workshop",
      checkout_mode: "external",
      view_sessions: 1,
      outbound_sessions: 1,
      free_claim_sessions: 0,
      paid_order_sessions: 0,
      free_claims: 0,
      paid_orders: 0,
    },
  ];
  result.placements = [
    { placement: "hero", destination: "summit", clicks: 6, sessions: 4 },
  ];
  return result;
}
function setup(data?: ConversionReport) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  if (data) client.setQueryData(["admin-conversions", 30], data);
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, wrapper };
}
beforeEach(() => rpc.mockReset());
afterEach(cleanup);

describe("conversion reporting", () => {
  it("uses canonical shareable ranges and guards zero denominators", () => {
    expect(conversionSearch({ days: "7" })).toEqual({ days: 7 });
    expect(conversionSearch({ days: 90 })).toEqual({ days: 90 });
    expect(conversionSearch({ days: "900" })).toEqual({ days: 30 });
    expect(conversionSearch({ days: [] })).toEqual({ days: 30 });
    expect(conversionRate(0, 0)).toBe("—");
    expect(conversionRate(2, 0)).toBe("—");
    expect(conversionRate(3, 2)).toBe("—");
    expect(conversionRate(0, 3)).toBe("0%");
    expect(conversionRate(1, 3)).toBe("33.3%");
    expect(conversionMoney(12000, "eur")).toMatch(/EUR.*120\.00/);
  });
  it("loads the authenticated aggregate RPC and rejects malformed data rather than inventing zeroes", async () => {
    rpc.mockResolvedValueOnce({ data: report(), error: null });
    expect((await loadConversionReport(7)).summary.measured_sessions).toBe(0);
    expect(rpc).toHaveBeenCalledWith("admin_conversion_snapshot", { _days: 7 });
    rpc.mockResolvedValueOnce({ data: { summary: {} }, error: null });
    await expect(loadConversionReport(30)).rejects.toThrow();
    rpc.mockResolvedValueOnce({
      data: null,
      error: { message: "Administrator required" },
    });
    await expect(loadConversionReport(30)).rejects.toThrow(
      "Administrator required",
    );
  });
  it("shows pending and empty states without suggesting missing data is failed conversions", async () => {
    let resolve!: (value: { data: ConversionReport; error: null }) => void;
    rpc.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const { wrapper } = setup();
    render(<ConversionDashboard days={30} />, { wrapper });
    expect(screen.getByRole("status")).toHaveTextContent(
      "Loading current information",
    );
    expect(screen.queryByText("0%")).not.toBeInTheDocument();
    resolve({ data: report(), error: null });
    expect(
      await screen.findByRole("heading", {
        name: "Ready for your first measured visits.",
      }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("—")).toHaveLength(8);
    expect(screen.getByRole("link", { name: "Last 30 days" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    // Numeric search values: TanStack writes ?days=7, never ?days=%227%22.
    expect(
      screen
        .getAllByTestId("range-link")
        .map((link) => link.getAttribute("data-days")),
    ).toEqual(["7", "30", "90"]);
    expect(
      screen.getByText(/earlier traffic is not reconstructed/),
    ).toBeInTheDocument();
  });
  it("keeps measured-cohort rates separate from native totals, external sales, and currencies", () => {
    const { wrapper } = setup(populated());
    render(<ConversionDashboard days={30} />, { wrapper });
    const metric = screen
      .getByText("Confirmed free claim rate")
      .closest("div")!;
    expect(within(metric).getByText("20%")).toBeInTheDocument();
    expect(metric).not.toHaveTextContent("230%");
    const sources = screen.getByRole("table", {
      name: "Source and campaign performance",
    });
    expect(within(sources).getByText("50%")).toBeInTheDocument();
    expect(
      within(sources).getByText("2 sessions · 3 claims"),
    ).toBeInTheDocument();
    const external = screen.getByRole("row", { name: /Partner Workshop/ });
    expect(within(external).getAllByText("Not tracked")).toHaveLength(2);
    expect(screen.getByText(/USD.*100\.00/)).toBeInTheDocument();
    expect(screen.getByText(/EUR.*120\.00/)).toBeInTheDocument();
    expect(screen.queryByText(/220\.00/)).not.toBeInTheDocument();
    const native = screen.getByRole("region", {
      name: "Confirmed native outcomes",
    });
    expect(within(native).getByText("23")).toBeInTheDocument();
    expect(
      within(native).getByText(
        /3 test paid orders and 2 paid orders of unknown mode/,
      ),
    ).toBeInTheDocument();
    expect(
      within(native).getByText(
        /does not confirm that the file finished downloading/,
      ),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByText("View daily counts"));
    expect(
      screen.getByRole("table", {
        name: "Daily measured sessions and confirmed outcomes",
      }),
    ).toBeVisible();
  });
  it("offers recovery from a failed request without replacing it with a zero report", async () => {
    rpc.mockResolvedValueOnce({
      data: null,
      error: { message: "Unavailable" },
    });
    const { wrapper } = setup();
    render(<ConversionDashboard days={7} />, { wrapper });
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "could not be loaded",
    );
    expect(screen.queryByText("Measured sessions")).not.toBeInTheDocument();
    rpc.mockResolvedValueOnce({ data: report(), error: null });
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Measured sessions")).toBeInTheDocument();
    expect(rpc).toHaveBeenLastCalledWith("admin_conversion_snapshot", {
      _days: 7,
    });
  });
  it("preserves and labels last successful data when refresh fails", async () => {
    const { wrapper } = setup(populated());
    rpc.mockResolvedValueOnce({
      data: null,
      error: { message: "Unavailable" },
    });
    render(<ConversionDashboard days={30} />, { wrapper });
    fireEvent.click(
      screen.getByRole("button", { name: "Refresh conversions" }),
    );
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.getByRole("status")).toHaveTextContent(
      "last successful report",
    );
    expect(
      screen.getByText("Confirmed free claim rate").closest("div"),
    ).toHaveTextContent("20%");
  });
  it("reuses the thirty-day report in the overview without another request", () => {
    const { wrapper } = setup(populated());
    render(<ConversionOverview />, { wrapper });
    expect(screen.getByText("10")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "View conversion dashboard" }),
    ).toHaveAttribute("href", "/admin/conversions");
    expect(
      screen.getByText(/External clicks are not registrations or sales/),
    ).toBeInTheDocument();
    expect(rpc).not.toHaveBeenCalled();
  });
  it("uses a portable featured event label in member installations", () => {
    const { wrapper } = setup(populated());
    render(
      <SiteConfigContext.Provider value={memberPreset}>
        <ConversionDashboard days={30} />
      </SiteConfigContext.Provider>,
      { wrapper },
    );
    const destinations = screen.getByRole("table", {
      name: "Outbound destination and placement performance",
    });
    expect(
      within(destinations).getByText("Featured event"),
    ).toBeInTheDocument();
    expect(within(destinations).queryByText("Summit")).not.toBeInTheDocument();
  });
  it("builds canonical range URLs without JSON-quoted values", () => {
    const router = createRouter({
      routeTree,
      history: createMemoryHistory(),
      context: { queryClient: new QueryClient() },
    });
    const href = (days: number) =>
      router.buildLocation({
        to: "/admin/conversions",
        search: { days } as never,
      }).href;
    expect(href(7)).toBe("/admin/conversions?days=7");
    expect(href(90)).toBe("/admin/conversions?days=90");
    expect(href(30)).toBe("/admin/conversions");
  });
  it("labels untagged traffic instead of printing the stored placeholder", () => {
    expect(campaignLabel("none")).toBe("(no campaign)");
    expect(campaignLabel(null)).toBe("(no campaign)");
    expect(campaignLabel("")).toBe("(no campaign)");
    expect(campaignLabel("spring_launch")).toBe("spring_launch");
    const data = populated();
    data.sources = [{ ...data.sources[0], campaign: "none" }];
    const { wrapper } = setup(data);
    render(<ConversionDashboard days={30} />, { wrapper });
    const sources = screen.getByRole("table", {
      name: "Source and campaign performance",
    });
    expect(within(sources).getByText(/\(no campaign\)/)).toBeInTheDocument();
    expect(within(sources).queryByText(/· none/)).not.toBeInTheDocument();
  });
  it("does not claim unlinked orders had no measured visit", () => {
    const { wrapper } = setup(populated());
    render(<ConversionDashboard days={30} />, { wrapper });
    const native = screen.getByRole("region", {
      name: "Confirmed native outcomes",
    });
    expect(native).toHaveTextContent("could not be linked to a measured visit");
    expect(native).not.toHaveTextContent("have no qualifying measured");
  });
  it("reserves the overview counts with skeletons while loading", () => {
    rpc.mockReturnValueOnce(new Promise(() => {}));
    const { wrapper } = setup();
    render(<ConversionOverview />, { wrapper });
    const counts = screen.getByTestId("conversion-overview-counts");
    expect(counts).toHaveAttribute("aria-busy", "true");
    expect(
      screen.queryByText("Loading current information…"),
    ).not.toBeInTheDocument();
  });
});
