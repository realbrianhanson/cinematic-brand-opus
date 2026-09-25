// @vitest-environment jsdom
import type React from "react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createFakeSupabase,
  type FakeOp,
  type FakeResult,
  type FakeState,
} from "./fakeSupabaseQuery";

const h = vi.hoisted(() => ({
  toast: vi.fn(),
  invoke: vi.fn(),
  state: null as unknown as FakeState,
  respond: (_op: FakeOp): FakeResult => ({ data: [], error: null }),
}));

vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: h.toast }) }));
vi.mock("@/lib/withTimeout", () => ({
  safeMutation: (run: () => unknown) => run(),
}));
vi.mock("@/lib/router-compat", () => ({
  Link: ({ to, children }: { to: string; children: React.ReactNode }) => (
    <a href={to}>{children}</a>
  ),
  useSearchParams: () => [new URLSearchParams(), vi.fn()],
}));
// Render menu items inline so tests can click them without pointer emulation.
vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuItem: ({
    children,
    onClick,
    asChild,
    disabled,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    asChild?: boolean;
    disabled?: boolean;
  }) =>
    asChild ? (
      <>{children}</>
    ) : (
      <button type="button" onClick={onClick} disabled={disabled}>
        {children}
      </button>
    ),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) =>
      createFakeSupabase({
        get ops() {
          return h.state.ops;
        },
        respond: (op) => h.respond(op),
      }).from(table),
    functions: { invoke: (...args: unknown[]) => h.invoke(...args) },
    auth: {
      getSession: async () => ({ data: { session: null }, error: null }),
    },
  },
}));

import GeneratedPagesManager from "../GeneratedPagesManager";

const page = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  title: `Page ${id.toUpperCase()}`,
  slug: `page-${id}`,
  status: "draft",
  niche_id: "n1",
  content_schema_id: "s1",
  performance_trend: null,
  quality_score: 80,
  lint_flags: [],
  views: 0,
  created_at: "2026-09-01T00:00:00Z",
  refresh_count: 0,
  niches: { name: "Roofers", slug: "roofers" },
  content_schemas: { name: "Tool Roundups", slug: "tool-roundups" },
  ...extra,
});

const PAGES = [
  page("a"),
  page("b", { niche_id: "n2", niches: { name: "Coaches", slug: "coaches" } }),
  page("c", { status: "published" }),
];

function setup(
  respond?: (op: FakeOp) => FakeResult | undefined,
  qc = new QueryClient({ defaultOptions: { queries: { retry: false } } }),
) {
  h.state = { ops: [], respond: () => ({ data: null, error: null }) };
  h.respond = (op) => {
    const custom = respond?.(op);
    if (custom) return custom;
    if (op.table === "generated_pages" && op.action === "select")
      return { data: PAGES, error: null };
    if (op.table === "indexing_log")
      return { data: [{ page_id: "c", status: "submitted" }], error: null };
    if (op.table === "niches")
      return {
        data: [
          { id: "n1", name: "Roofers", slug: "roofers" },
          { id: "n2", name: "Coaches", slug: "coaches" },
        ],
        error: null,
      };
    if (op.table === "content_schemas")
      return {
        data: [{ id: "s1", name: "Tool Roundups", slug: "tool-roundups" }],
        error: null,
      };
    return { data: null, error: null };
  };
  return render(
    <QueryClientProvider client={qc}>
      <GeneratedPagesManager />
    </QueryClientProvider>,
  );
}

const rowFor = (title: string) =>
  screen.getByTitle(title).closest("[data-row]") as HTMLElement;

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("GeneratedPagesManager", () => {
  it("shows a failed load honestly and retries without losing the filters", async () => {
    let unavailable = true;
    setup((op) =>
      op.table === "generated_pages" && op.action === "select" && unavailable
        ? { data: null, error: { message: "Network unavailable" } }
        : undefined,
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Couldn't load generated pages",
    );
    expect(screen.queryByText("No generated pages found.")).toBeNull();
    unavailable = false;
    fireEvent.click(
      screen.getByRole("button", { name: "Retry loading pages" }),
    );
    expect(await screen.findByTitle("Page A")).toBeTruthy();
  });

  it("returns to an existing page when a refresh removes the last page of results", async () => {
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const many = Array.from({ length: 51 }, (_, i) => page(`item-${i}`));
    setup(
      (op) =>
        op.table === "generated_pages" && op.action === "select"
          ? { data: many, error: null }
          : undefined,
      qc,
    );
    fireEvent.click(await screen.findByRole("button", { name: /Next/ }));
    await act(async () => {
      qc.setQueryData(["admin-generated-pages"], [many[0]]);
    });
    expect(await screen.findByTitle(many[0].title)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Next/ })).toBeNull();
  });
  it("renders the same grid cells for indexed and non-indexed rows", async () => {
    setup();
    await screen.findByTitle("Page C");
    const indexed = rowFor("Page C");
    const plain = rowFor("Page A");
    expect(indexed.children.length).toBe(9);
    expect(plain.children.length).toBe(9);
    expect(within(indexed).getByLabelText("Submitted to Google")).toBeTruthy();
  });

  it("does not load page bodies for the list", async () => {
    setup();
    await screen.findByTitle("Page A");
    const listOp = h.state.ops.find(
      (op) => op.table === "generated_pages" && op.action === "select",
    )!;
    expect(listOp.columns).not.toMatch(/content_json|\*/);
  });

  it("clears the bulk selection when a filter changes", async () => {
    setup();
    await screen.findByTitle("Page A");
    fireEvent.click(screen.getByLabelText("Select Page A"));
    expect(screen.getByText(/1 selected/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Filter by niche"), {
      target: { value: "n2" },
    });
    expect(screen.queryByText(/1 selected/)).toBeNull();
  });

  it("publishes row by row and reports blocked pages", async () => {
    h.invoke.mockImplementation(
      async (_name: string, opts: { body: { page_id: string } }) => ({
        data:
          opts.body.page_id === "a"
            ? { score: 90, issues: [] }
            : { score: 60, issues: ["Thin"] },
        error: null,
      }),
    );
    setup();
    await screen.findByTitle("Page A");
    fireEvent.click(screen.getByLabelText("Select Page A"));
    fireEvent.click(screen.getByLabelText("Select Page B"));
    fireEvent.click(screen.getByRole("button", { name: "Publish Selected" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    await waitFor(() =>
      expect(h.toast).toHaveBeenCalledWith(
        expect.objectContaining({ title: "1 published, 1 blocked" }),
      ),
    );
    const updates = h.state.ops.filter(
      (op) => op.table === "generated_pages" && op.action === "update",
    );
    expect(updates).toHaveLength(1);
    expect(updates[0].filters).toContainEqual(["eq", "id", "a"]);
    expect(h.invoke).toHaveBeenCalledWith("score-content-quality", {
      body: { page_id: "b" },
    });
    // The blocked page stays selected so Brian can open it.
    expect(screen.getByText(/1 selected/)).toBeTruthy();
  });

  it("shows an error when delete fails, and deletes in one call", async () => {
    setup((op) =>
      op.action === "delete"
        ? { data: null, error: { message: "delete refused" } }
        : undefined,
    );
    await screen.findByTitle("Page A");
    fireEvent.click(
      within(rowFor("Page A")).getByRole("button", { name: /Delete/ }),
    );
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
    await waitFor(() =>
      expect(h.toast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Could not delete",
          variant: "destructive",
        }),
      ),
    );
    const tables = h.state.ops
      .filter((op) => op.action === "delete")
      .map((op) => op.table);
    expect(tables).toEqual(["generated_pages"]);
  });

  it("asks before Regenerate and uses the per-page refresh", async () => {
    h.invoke.mockResolvedValue({
      data: { refreshed: 1, failed: 0 },
      error: null,
    });
    setup();
    await screen.findByTitle("Page A");
    fireEvent.click(
      within(rowFor("Page A")).getByRole("button", { name: /Regenerate/ }),
    );
    expect(h.invoke).not.toHaveBeenCalled();
    const dialog = screen.getByRole("dialog");
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Rewrite content" }),
    );
    await waitFor(() =>
      expect(h.invoke).toHaveBeenCalledWith("refresh-stale-content", {
        body: { page_id: "a" },
      }),
    );
    await waitFor(() =>
      expect(h.toast).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Content refreshed" }),
      ),
    );
  });
});
