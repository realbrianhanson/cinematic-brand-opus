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

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc, functions: { invoke: vi.fn() } },
}));
vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { error: vi.fn() }),
}));
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
// Recharts needs layout measurements jsdom does not provide.
vi.mock("recharts", () => {
  const Stub = ({ children }: { children?: React.ReactNode }) => (
    <div>{children}</div>
  );
  return {
    LineChart: Stub,
    Line: Stub,
    XAxis: Stub,
    YAxis: Stub,
    CartesianGrid: Stub,
    Tooltip: Stub,
    ResponsiveContainer: Stub,
  };
});
import PseoDashboard from "../PseoDashboard";

function snapshot(views: number) {
  return {
    generated_at: "2026-09-23T15:00:00+00:00",
    published_resources: 1,
    resource_views_all_time: views,
    published_articles: 348,
    review_needed: 0,
    top_pages: [
      {
        id: "p1",
        title: "45 best AI tools",
        slug: "45-best",
        views,
        content_type: "listicles",
      },
    ],
    daily_views: [{ day: "2026-09-20", views: 3 }],
    search: {
      period_end: "2026-09-20",
      period_start: "2026-08-24",
      fetched_at: new Date().toISOString(),
      rows: 68,
      clicks: 2,
      impressions: 1155,
      sections: [
        { section: "other", pages: 1, clicks: 1, impressions: 1000 },
        { section: "articles", pages: 47, clicks: 1, impressions: 133 },
        { section: "resources", pages: 5, clicks: 0, impressions: 22 },
      ],
    },
    top_articles: [
      {
        path: "/blog/automate-browser-research",
        title: "Automate browser research",
        post_id: "a1",
        clicks: 1,
        impressions: 60,
        position: 8.4,
      },
    ],
    queries: [],
    jobs: [],
  };
}
const breakdown = {
  formats: [{ name: "Listicle", pages: 1, views: 18 }],
  niches: [{ name: "Solo founders", pages: 1, views: 18, clicks: 0 }],
};
function renderDashboard() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <PseoDashboard />
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  rpc.mockReset();
  rpc.mockImplementation((name: string) =>
    Promise.resolve(
      name === "admin_content_breakdown"
        ? { data: breakdown, error: null }
        : { data: snapshot(18), error: null },
    ),
  );
});
afterEach(cleanup);

describe("search performance report", () => {
  it("leads with articles as well as resources, using recorded views", async () => {
    renderDashboard();
    const headline = await screen.findByRole("region", {
      name: "Headline numbers",
    });
    const card = (label: string) =>
      within(headline).getByText(label).closest("div")!;
    expect(card("Published articles")).toHaveTextContent("348");
    expect(card("Resource views · all time")).toHaveTextContent("18");
    const articles = screen.getByText("Articles").closest("tr")!;
    expect(articles).toHaveTextContent("47");
    expect(articles).toHaveTextContent("133");
    expect(
      screen.getByRole("link", { name: "Automate browser research" }),
    ).toHaveAttribute("href", "/admin/posts/a1/edit");
    expect(
      await screen.findByText(/Listicle: 1 pages · 18 views/),
    ).toBeVisible();
  });

  it("keeps the report and the focused range control while another range loads", async () => {
    renderDashboard();
    const select = await screen.findByRole("combobox", {
      name: "Activity window",
    });
    let resolve!: (value: unknown) => void;
    rpc.mockImplementation((name: string) =>
      name === "admin_content_breakdown"
        ? Promise.resolve({ data: breakdown, error: null })
        : new Promise((done) => {
            resolve = done;
          }),
    );
    select.focus();
    fireEvent.change(select, { target: { value: "7" } });
    await waitFor(() =>
      expect(rpc).toHaveBeenLastCalledWith("admin_performance_snapshot", {
        days: 7,
      }),
    );
    expect(screen.getByRole("combobox", { name: "Activity window" })).toBe(
      select,
    );
    expect(document.activeElement).toBe(select);
    expect(select).toHaveValue("7");
    expect(screen.getByText("Published articles")).toBeInTheDocument();
    expect(screen.getByText(/Updating the report/)).toBeInTheDocument();
    resolve({ data: snapshot(25), error: null });
    const headline = screen.getByRole("region", { name: "Headline numbers" });
    await waitFor(() =>
      expect(
        within(headline).getByText("Resource views · all time").closest("div"),
      ).toHaveTextContent("25"),
    );
  });

  it("keeps the last good numbers when a background refresh fails", async () => {
    renderDashboard();
    await screen.findByText("Published articles");
    rpc.mockImplementation((name: string) =>
      Promise.resolve(
        name === "admin_content_breakdown"
          ? { data: breakdown, error: null }
          : { data: null, error: { message: "offline" } },
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    expect(
      await screen.findByText(/Showing the last successful report/),
    ).toBeInTheDocument();
    expect(screen.getByText("Published articles")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows an error with a retry when there is nothing to fall back to", async () => {
    rpc.mockImplementation((name: string) =>
      Promise.resolve(
        name === "admin_content_breakdown"
          ? { data: breakdown, error: null }
          : { data: null, error: { message: "offline" } },
      ),
    );
    renderDashboard();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "could not be loaded",
    );
    expect(
      screen.getByRole("combobox", { name: "Activity window" }),
    ).toBeInTheDocument();
  });
});
