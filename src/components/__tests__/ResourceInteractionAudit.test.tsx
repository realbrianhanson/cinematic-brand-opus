// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  insert: vi.fn(),
  loaderData: {} as Record<string, unknown>,
}));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: Record<string, unknown>) => ({
    options,
    useLoaderData: () => mocks.loaderData,
  }),
  notFound: () => new Error("Not found"),
}));
vi.mock("@/lib/publicData.functions", () => ({
  getPublicGeneratedPage: vi.fn(),
  getPublicSiteSettings: vi.fn(),
}));
vi.mock("@/lib/router-compat", () => ({
  useParams: () => ({ contentType: "checklists", pageSlug: "example" }),
  Link: ({ to, children }: { to: string; children: React.ReactNode }) => (
    <a href={to}>{children}</a>
  ),
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: ({ initialData }: { initialData?: unknown }) => ({
    data: initialData,
    isLoading: false,
  }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: () => ({ insert: mocks.insert }) },
}));
vi.mock("@/components/Nav", () => ({ default: () => null }));
vi.mock("@/components/Footer", () => ({ default: () => null }));
vi.mock("@/components/WidgetRenderer", () => ({ default: () => null }));
vi.mock("@/components/PublicCTA", () => ({ default: () => null }));
vi.mock("@/components/PillarBanner", () => ({ default: () => null }));
vi.mock("@/components/RelatedResources", () => ({ default: () => null }));
vi.mock("@/components/SiloSidebar", () => ({ default: () => null }));
vi.mock("@/components/PublicRouteError", () => ({ default: () => null }));

import { Route } from "@/routes/resources.$contentType.$pageSlug";
const ResourceRoute = Route.options.component as React.ComponentType;

function resource(id: string) {
  return {
    page: {
      id,
      title: `Checklist ${id}`,
      status: "published",
      slug: id,
      schema: {
        id: "checklist",
        name: "Checklists",
        renderer_component: "ChecklistRenderer",
      },
      niche: { id: "niche", name: "Business", slug: "business" },
      content_json: {
        sections: [
          { title: "Getting started", items: [{ title: "Choose one task" }] },
        ],
      },
      seo_meta: {},
    },
    settings: { site_url: "https://example.test" },
  };
}
beforeEach(() => {
  mocks.loaderData = resource("first");
  mocks.insert.mockReset().mockResolvedValue({ error: null });
});
afterEach(cleanup);

describe("resource interactions", () => {
  it("labels a refresh timestamp as refreshed, without inventing a source review", () => {
    const data = resource("refreshed");
    mocks.loaderData = {
      ...data,
      page: {
        ...data.page,
        last_refreshed: "2026-07-11T12:00:00Z",
        created_at: "2026-07-01T12:00:00Z",
      },
      settings: { ...data.settings, author_name: "Brian Hanson" },
    };
    render(<ResourceRoute />);
    expect(screen.getByText(/Last refreshed/)).toBeTruthy();
    expect(screen.queryByText(/Last verified/)).toBeNull();
    expect(
      screen.queryByText(/reviewed against|Researched with live web data/),
    ).toBeNull();
  });
  it("does not turn a creation date into a verification date", () => {
    const data = resource("new");
    mocks.loaderData = {
      ...data,
      page: { ...data.page, created_at: "2026-07-01T12:00:00Z" },
      settings: { ...data.settings, author_name: "Brian Hanson" },
    };
    render(<ResourceRoute />);
    expect(
      screen.queryByText(/Last verified|Last refreshed|reviewed against/),
    ).toBeNull();
  });
  it("resets checklist and feedback state and records the next resource on client navigation", async () => {
    const view = render(<ResourceRoute />);
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(
      screen.getByRole("button", { name: "This resource was helpful" }),
    );
    await screen.findByText("Thanks for your feedback!");
    expect(screen.getByText("1 of 1 completed (100%)")).toBeTruthy();
    mocks.loaderData = resource("second");
    view.rerender(<ResourceRoute />);
    expect(screen.getByText("0 of 1 completed (0%)")).toBeTruthy();
    expect(screen.queryByText("Thanks for your feedback!")).toBeNull();
    expect(
      (
        screen.getByRole("button", {
          name: "This resource was helpful",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false);
    expect(
      mocks.insert.mock.calls
        .filter(([row]) => row.event_type === "view")
        .map(([row]) => row.page_id),
    ).toEqual(["first", "second"]);
  });
  it("does not thank the visitor for feedback that failed to save and permits retry", async () => {
    mocks.insert.mockImplementation((row) =>
      Promise.resolve({
        error:
          row.event_type === "feedback" ? { message: "unavailable" } : null,
      }),
    );
    render(<ResourceRoute />);
    const helpful = screen.getByRole("button", {
      name: "This resource was helpful",
    });
    fireEvent.click(helpful);
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.queryByText("Thanks for your feedback!")).toBeNull();
    expect((helpful as HTMLButtonElement).disabled).toBe(false);
    mocks.insert.mockResolvedValue({ error: null });
    fireEvent.click(helpful);
    await waitFor(() =>
      expect(screen.getByText("Thanks for your feedback!")).toBeTruthy(),
    );
  });
  it("gives the icon share links clear accessible names", () => {
    render(<ResourceRoute />);
    expect(
      screen.getByRole("link", { name: "Share on LinkedIn" }),
    ).toBeTruthy();
    expect(screen.getByRole("link", { name: "Share on X" })).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Share on Facebook" }),
    ).toBeTruthy();
  });
});
