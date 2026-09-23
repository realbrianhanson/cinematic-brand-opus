// @vitest-environment jsdom
import React from "react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { overviewSnapshot } from "./overviewFixture";

const h = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
  invoke: vi.fn(),
  offerApi: vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: h.rpc, from: h.from, functions: { invoke: h.invoke } },
}));
vi.mock("@/lib/offers", () => ({ invokeOfferApi: h.offerApi }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
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
vi.mock("../NewsletterPreviewCard", () => ({
  default: () => <section>Newsletter card</section>,
}));
vi.mock("../BriansNotesWidget", () => ({ default: () => null }));
vi.mock("../ConversionDashboard", () => ({ ConversionOverview: () => null }));

import Dashboard from "../Dashboard";

function indexingQuery() {
  const query = {
    select: () => query,
    order: () => query,
    limit: () => Promise.resolve({ data: [], error: null }),
  };
  return query;
}
function renderDashboard() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <Dashboard />
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  h.rpc.mockReset();
  h.from.mockReset().mockImplementation(indexingQuery);
  h.offerApi.mockReset();
});
afterEach(cleanup);

describe("business overview", () => {
  it("reserves the card grid with skeletons and makes one request while loading", () => {
    h.rpc.mockReturnValue(new Promise(() => {}));
    renderDashboard();
    const metrics = screen.getByTestId("overview-metrics");
    expect(metrics).toHaveAttribute("aria-busy", "true");
    expect(metrics.querySelectorAll(".admin-overview-metric")).toHaveLength(4);
    expect(
      screen.queryByText("Loading current information…"),
    ).not.toBeInTheDocument();
    expect(h.rpc).toHaveBeenCalledTimes(1);
    expect(h.rpc).toHaveBeenCalledWith("admin_overview_snapshot");
    expect(h.from).not.toHaveBeenCalled();
  });

  it("counts live payments only and says how many test purchases were left out", async () => {
    h.rpc.mockResolvedValue({
      data: overviewSnapshot({
        counts: { paid_orders: 2, test_paid_orders: 1, unknown_paid_orders: 1 },
      }),
      error: null,
    });
    renderDashboard();
    const card = (await screen.findByText("Paid orders")).closest("a")!;
    expect(within(card).getByText("2")).toBeInTheDocument();
    expect(card).toHaveTextContent("Live payments only");
    expect(card).toHaveTextContent("1 test purchase not counted");
    expect(card).toHaveTextContent("1 unverified");
    const subscribers = screen.getByText("Confirmed subscribers").closest("a")!;
    expect(subscribers).toHaveAttribute("href", "/admin/audience");
    expect(subscribers).toHaveTextContent("5 awaiting confirmation");
  });

  it("lists every attention item from the snapshot with a link that fixes it", async () => {
    h.rpc.mockResolvedValue({
      data: overviewSnapshot({
        attention: [
          {
            key: "newsletter_delivery",
            severity: "high",
            count: 1,
            message:
              "The 2026-W39 newsletter reached nobody (0 of 1 delivered)",
            detail: "Provider returned HTTP 403",
            link: "/admin#newsletter",
          },
          {
            key: "contradicted_live",
            severity: "high",
            count: 104,
            message:
              "104 live articles contain claims the fact-check contradicted",
            detail: "Readers can see these now.",
            link: "/admin/posts?status=published",
          },
          {
            key: "pending_subscribers",
            severity: "medium",
            count: 5,
            message: "5 newsletter signups never confirmed",
            detail: null,
            link: "/admin/audience",
          },
          {
            key: "drafts",
            severity: "low",
            count: 8,
            message: "8 drafts to review",
            detail: "Check the hook, sources, and next step for readers.",
            link: "/admin/posts?status=draft",
          },
        ],
      }),
      error: null,
    });
    renderDashboard();
    const list = await screen.findByRole("list", {
      name: "Needs your attention",
    });
    const rows = within(list).getAllByRole("link");
    expect(rows.map((row) => row.getAttribute("href"))).toEqual([
      "/admin#newsletter",
      "/admin/posts?status=published",
      "/admin/audience",
      "/admin/posts?status=draft",
    ]);
    expect(rows[0]).toHaveTextContent("reached nobody");
    expect(rows[0]).toHaveTextContent("HTTP 403");
    expect(rows[0]).toHaveTextContent("Urgent");
    expect(screen.queryByText(/queue is clear/i)).not.toBeInTheDocument();
    expect(document.getElementById("newsletter")).toHaveTextContent(
      "Newsletter card",
    );
  });

  it("says so plainly when nothing needs attention", async () => {
    h.rpc.mockResolvedValue({
      data: overviewSnapshot({ attention: [] }),
      error: null,
    });
    renderDashboard();
    expect(
      await screen.findByText("Nothing needs your attention right now"),
    ).toBeInTheDocument();
  });

  it("shows recent posts and stale resources from the same snapshot", async () => {
    h.rpc.mockResolvedValue({
      data: overviewSnapshot({ counts: { stale_pages: 3 } }),
      error: null,
    });
    renderDashboard();
    expect(await screen.findByText("Newest")).toBeInTheDocument();
    expect(
      screen.getByText(/3 published resources are flagged for review/),
    ).toBeInTheDocument();
    expect(h.rpc).toHaveBeenCalledTimes(1);
  });

  it("loads search submissions only when that section is opened", async () => {
    h.rpc.mockResolvedValue({ data: overviewSnapshot(), error: null });
    renderDashboard();
    await screen.findByText("Newest");
    expect(h.from).not.toHaveBeenCalled();
    const details = screen
      .getByText("Search engine submissions")
      .closest("details")!;
    details.open = true;
    fireEvent(details, new Event("toggle"));
    await waitFor(() => expect(h.from).toHaveBeenCalledWith("indexing_log"));
  });

  it("keeps the last numbers visible when a refresh fails", async () => {
    h.rpc
      .mockResolvedValueOnce({ data: overviewSnapshot(), error: null })
      .mockResolvedValueOnce({ data: null, error: { message: "offline" } });
    renderDashboard();
    await screen.findByText("Paid orders");
    fireEvent.click(screen.getByRole("button", { name: "Refresh dashboard" }));
    expect(
      await screen.findByText(/Showing the last successful counts/),
    ).toBeInTheDocument();
    expect(screen.getByText("Paid orders")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
