// @vitest-environment jsdom
import React from "react";
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

type Row = Record<string, unknown>;
const mock = vi.hoisted(() => ({
  tables: {} as Record<string, Row[]>,
  write: vi.fn(),
  reads: [] as { table: string; filters: unknown[][] }[],
  health: {} as Row,
}));
vi.mock("@/lib/router-compat", () => ({
  Link: ({
    to,
    children,
    ...props
  }: {
    to: string;
    children: React.ReactNode;
  }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
  useNavigate: () => vi.fn(),
}));
vi.mock("@/lib/offers", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/offers")>()),
  invokeOfferApi: async () => ({
    payments_ready: false,
    secret_configured: false,
    webhook_configured: false,
    mode: "unconfigured",
    webhook_url: "https://backend.example.com/webhook",
    ...mock.health,
  }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      const filters: unknown[][] = [];
      let update: unknown = null;
      const query = {
        select: () => query,
        update: (values: unknown) => {
          update = values;
          return query;
        },
        eq: (...args: unknown[]) => {
          filters.push(["eq", ...args]);
          return query;
        },
        in: (...args: unknown[]) => {
          filters.push(["in", ...args]);
          return query;
        },
        gt: () => query,
        ilike: () => query,
        order: () => query,
        range: () => query,
        abortSignal: () => query,
        maybeSingle: () => mock.write(update, filters),
        then: (resolve: (value: unknown) => unknown) => {
          mock.reads.push({ table, filters });
          const data = mock.tables[table] ?? [];
          return Promise.resolve({
            data,
            count: data.length,
            error: null,
          }).then(resolve);
        },
      };
      return query;
    },
  },
}));
import OffersManager from "../OffersManager";

const offer = (id: string, status: string, title: string) => ({
  id,
  title,
  slug: title.toLowerCase().replace(/\s+/g, "-"),
  summary: "",
  status,
  kind: "free",
  amount_minor: 0,
  currency: "usd",
  checkout_mode: "native",
  price_display_mode: "fixed",
  is_affiliate: false,
  funnel_only: false,
  show_in_shop: false,
  shop_category: "resource",
  shop_featured: false,
  updated_at: `2026-09-19T00:00:0${id}Z`,
});
function mount(tab?: "offers" | "setup") {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <OffersManager tab={tab} />
    </QueryClientProvider>,
  );
}
const card = (title: string) =>
  screen.getByRole("heading", { name: title }).closest("article")!;

beforeEach(() => {
  vi.clearAllMocks();
  mock.reads.length = 0;
  mock.health = {};
  mock.tables = {
    offers: [
      offer("1", "published", "Live guide"),
      offer("2", "published", "Clean guide"),
      offer("3", "draft", "Draft guide"),
      offer("4", "archived", "Old guide"),
    ],
    offer_builder_drafts: [
      { offer_id: "1", version: 4 },
      { offer_id: "2", version: 2 },
      { offer_id: "3", version: 1 },
    ],
    offer_builder_revisions: [
      { offer_id: "1", version: 4, published: false },
      { offer_id: "2", version: 2, published: true },
      { offer_id: "3", version: 1, published: false },
      { offer_id: "1", version: 2, published: true },
    ],
  };
});
afterEach(cleanup);

describe("offers list", () => {
  it("marks published offers whose latest draft is not published", async () => {
    mount();
    await screen.findByText("Live guide");
    await waitFor(() =>
      expect(
        within(card("Live guide")).getByText("Draft changes not published"),
      ).toBeTruthy(),
    );
    expect(
      within(card("Clean guide")).queryByText("Draft changes not published"),
    ).toBeNull();
    expect(
      within(card("Draft guide")).queryByText("Draft changes not published"),
    ).toBeNull();
  });
  it("offers unpublish, archive and restore according to status", async () => {
    mount();
    await screen.findByText("Live guide");
    const names = (title: string) =>
      within(card(title))
        .getAllByRole("button")
        .map((button) => button.textContent);
    expect(names("Live guide")).toEqual(["Unpublish", "Archive"]);
    expect(names("Draft guide")).toEqual(["Archive"]);
    expect(names("Old guide")).toEqual(["Restore to draft"]);
  });
  it("unpublishes only after confirmation, guarded by the version shown", async () => {
    mock.write.mockResolvedValue({
      data: { id: "1", status: "draft", updated_at: "2026-09-20T00:00:00Z" },
      error: null,
    });
    mount();
    await screen.findByText("Live guide");
    fireEvent.click(
      screen.getByRole("button", { name: "Unpublish: Live guide" }),
    );
    const dialog = screen.getByRole("alertdialog");
    expect(dialog.textContent).toContain(
      "Existing customers keep their access",
    );
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(mock.write).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("button", { name: "Unpublish: Live guide" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Unpublish offer" }));
    await screen.findByText(/Live guide: Offer unpublished/);
    expect(mock.write).toHaveBeenCalledWith({ status: "draft" }, [
      ["eq", "id", "1"],
      ["eq", "updated_at", "2026-09-19T00:00:01Z"],
    ]);
  });
  it("archives and restores with the matching target status", async () => {
    mock.write.mockImplementation(async (values: { status: string }) => ({
      data: { id: "x", status: values.status, updated_at: "now" },
      error: null,
    }));
    mount();
    await screen.findByText("Old guide");
    fireEvent.click(
      screen.getByRole("button", { name: "Archive: Draft guide" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Archive offer" }));
    await screen.findByText(/Offer archived/);
    fireEvent.click(
      screen.getByRole("button", { name: "Restore to draft: Old guide" }),
    );
    fireEvent.click(
      within(screen.getByRole("alertdialog")).getByRole("button", {
        name: "Restore to draft",
      }),
    );
    await screen.findByText(/Offer restored to a private draft/);
    expect(mock.write.mock.calls.map((call) => call[0])).toEqual([
      { status: "archived" },
      { status: "draft" },
    ]);
  });
  it("reports a concurrent change instead of overwriting it", async () => {
    mock.write.mockResolvedValue({ data: null, error: null });
    mount();
    await screen.findByText("Live guide");
    fireEvent.click(
      screen.getByRole("button", { name: "Archive: Live guide" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Archive offer" }));
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toMatch(
        /changed in another tab/,
      ),
    );
  });
});

describe("offer setup delivery status", () => {
  const stuck = {
    delivery_ready: true,
    delivery_missing: [],
    delivery_pending: 1,
    delivery_needs_review: 0,
    delivery_failed: 2,
    delivery_next_retry_at: "2026-09-23T10:20:00.000Z",
    delivery_last_issue: {
      id: "7d0f5c1e-2b3a-4c5d-8e9f-0a1b2c3d4e5f",
      status: "failed",
      attempts: 10,
      provider_status: 422,
      detail: "Resend rejected the sender domain as unverified.",
      at: "2026-09-23T10:00:00.000Z",
      next_attempt_at: null,
    },
  };
  it("does not claim readiness while download emails are stuck", async () => {
    mock.health = stuck;
    mount("setup");
    await screen.findByText(/1 pending · 0 need review · 2 failed/);
    const page = document.body.textContent ?? "";
    expect(page).toContain("Download emails need attention");
    expect(page).not.toMatch(/Free downloads & external links ready/);
    expect(page).not.toMatch(/Ready when you are/);
    expect(screen.getByRole("button", { name: "Requeue" })).toBeTruthy();
  });
  it.each([
    ["needs review", { delivery_failed: 0, delivery_needs_review: 1 }],
    [
      "retrying after a problem",
      {
        delivery_failed: 0,
        delivery_last_issue: {
          ...stuck.delivery_last_issue,
          status: "pending",
          attempts: 2,
          next_attempt_at: "2026-09-23T10:20:00.000Z",
        },
      },
    ],
  ])("flags the summary when an email is %s", async (_label, extra) => {
    mock.health = { ...stuck, ...extra };
    mount();
    await screen.findByText(/Download emails need attention/);
    expect(document.body.textContent).not.toMatch(
      /Free downloads & external links ready/,
    );
  });
  it("keeps the ready summary when the queue is healthy", async () => {
    mock.health = {
      ...stuck,
      delivery_pending: 0,
      delivery_failed: 0,
      delivery_last_issue: null,
    };
    mount("setup");
    await screen.findByText(/Free downloads & external links ready/);
    expect(document.body.textContent).toContain("Ready when you are");
    expect(document.body.textContent).toContain(
      "0 pending · 0 need review · 0 failed",
    );
    expect(screen.queryByRole("button", { name: "Requeue" })).toBeNull();
  });
});
