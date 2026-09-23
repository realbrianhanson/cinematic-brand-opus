// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import CategoriesManager from "../CategoriesManager";
import {
  lastOp,
  type FakeOp,
  type FakeResult,
  type FakeState,
} from "./fakeSupabaseQuery";

const h = vi.hoisted(() => ({
  toast: vi.fn(),
  state: {
    ops: [] as FakeOp[],
    respond: (_op: FakeOp): FakeResult => ({ data: [], error: null }),
  } as FakeState,
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: h.toast }),
  toast: h.toast,
}));
vi.mock("@/integrations/supabase/client", async () => {
  const { createFakeSupabase } = await import("./fakeSupabaseQuery");
  return { supabase: createFakeSupabase(h.state) };
});

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  h.state.ops = [];
});

const wrap = () =>
  render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false },
          },
        })
      }
    >
      <CategoriesManager />
    </QueryClientProvider>,
  );

const category = {
  id: "c1",
  name: "Marketing",
  slug: "marketing",
  description: null,
  created_at: null,
};
const respondWith =
  (rows: unknown[], extra?: (op: FakeOp) => FakeResult | undefined) =>
  (op: FakeOp): FakeResult => {
    const custom = extra?.(op);
    if (custom) return custom;
    if (op.table === "categories" && op.action === "select")
      return { data: rows, error: null };
    if (op.table === "posts" && op.head) return { count: 4, error: null };
    return { data: [], error: null };
  };

describe("CategoriesManager", () => {
  it("explains what categories do when there are none", async () => {
    h.state.respond = respondWith([]);
    wrap();
    expect(await screen.findByText(/No categories yet/)).toBeTruthy();
    expect(screen.getByText(/group articles by topic/i)).toBeTruthy();
  });

  it("stacks its two panels on phones instead of a fixed two-column grid", async () => {
    h.state.respond = respondWith([]);
    const { container } = wrap();
    await screen.findByText(/No categories yet/);
    const grid = container.querySelector(".grid") as HTMLElement;
    expect(grid.className).toContain("grid-cols-1");
    expect(grid.style.gridTemplateColumns).toBe("");
  });

  it("names its form fields and icon buttons", async () => {
    h.state.respond = respondWith([category]);
    wrap();
    expect(screen.getByLabelText("Name")).toBeTruthy();
    expect(screen.getByLabelText("Slug")).toBeTruthy();
    expect(
      await screen.findByRole("button", { name: "Edit Marketing" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Delete Marketing" }),
    ).toBeTruthy();
  });

  it("warns that posts become uncategorized before deleting", async () => {
    h.state.respond = respondWith([category], (op) =>
      op.action === "delete"
        ? { data: [{ id: "c1" }], error: null }
        : undefined,
    );
    wrap();
    fireEvent.click(
      await screen.findByRole("button", { name: "Delete Marketing" }),
    );
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText(/4 articles/)).toBeTruthy();
    expect(within(dialog).getByText(/uncategorized/i)).toBeTruthy();
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Delete category" }),
    );
    await waitFor(() =>
      expect(
        lastOp(
          h.state,
          (op) => op.table === "categories" && op.action === "delete",
        ),
      ).toBeTruthy(),
    );
  });

  it("shows an error toast when a save fails", async () => {
    h.state.respond = respondWith([], (op) =>
      op.action === "insert"
        ? { data: null, error: { code: "23505", message: "duplicate key" } }
        : undefined,
    );
    wrap();
    await screen.findByText(/No categories yet/);
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Marketing" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Add Category/ }));
    await waitFor(() =>
      expect(h.toast).toHaveBeenCalledWith(
        expect.objectContaining({ variant: "destructive" }),
      ),
    );
  });

  it("shows an error toast when a delete fails", async () => {
    h.state.respond = respondWith([category], (op) =>
      op.action === "delete"
        ? { data: null, error: { message: "permission denied" } }
        : undefined,
    );
    wrap();
    fireEvent.click(
      await screen.findByRole("button", { name: "Delete Marketing" }),
    );
    const dialog = await screen.findByRole("alertdialog");
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Delete category" }),
    );
    await waitFor(() =>
      expect(h.toast).toHaveBeenCalledWith(
        expect.objectContaining({
          variant: "destructive",
          description: "permission denied",
        }),
      ),
    );
  });

  it("reports a failed load instead of an empty list", async () => {
    h.state.respond = (op) =>
      op.table === "categories"
        ? { data: null, error: { message: "offline" } }
        : { data: [], error: null };
    wrap();
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.queryByText(/No categories yet/)).toBeNull();
  });
});
