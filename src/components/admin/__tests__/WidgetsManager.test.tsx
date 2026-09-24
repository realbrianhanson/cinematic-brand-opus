// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import WidgetsManager from "../WidgetsManager";
import {
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

const widget = (over: Record<string, unknown>) => ({
  id: "w1",
  widget_slug: "page-share-bar",
  widget_zone: "page",
  display_name: "Share Bar",
  is_enabled: true,
  config: {},
  sort_order: 1,
  ...over,
});
const rows = [
  widget({}),
  widget({
    id: "w2",
    widget_slug: "page-toc",
    display_name: "Table of Contents",
    sort_order: 2,
  }),
  widget({
    id: "w3",
    widget_slug: "sidebar-newsletter",
    widget_zone: "sidebar",
    display_name: "Newsletter Signup",
    config: { title: "Old" },
  }),
];

let server = rows;
const respond =
  (extra?: (op: FakeOp) => FakeResult | undefined) =>
  (op: FakeOp): FakeResult => {
    const custom = extra?.(op);
    if (custom) return custom;
    if (op.action === "select") return { data: server, error: null };
    const id = op.filters.find((f) => f[0] === "eq")?.[2];
    return { data: [{ id }], error: null };
  };

const wrap = () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <WidgetsManager />
    </QueryClientProvider>,
  );
  return client;
};
const updates = () => h.state.ops.filter((op) => op.action === "update");

describe("WidgetsManager", () => {
  it("opens on the Page zone and explains that sidebar widgets are not shown", async () => {
    server = rows;
    h.state.respond = respond();
    wrap();
    const pageTab = await screen.findByRole("tab", { name: /Page/ });
    expect(pageTab.getAttribute("aria-selected")).toBe("true");
    expect(await screen.findByText("Share Bar")).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: /Sidebar/ }));
    expect(screen.getByText(/not shown on the site/i)).toBeTruthy();
  });

  it("keeps every keystroke while a save and a refetch are in flight, without a toast", async () => {
    server = rows;
    h.state.respond = respond();
    const client = wrap();
    fireEvent.click(await screen.findByRole("tab", { name: /Sidebar/ }));
    const title = (await screen.findByLabelText("Title")) as HTMLInputElement;
    fireEvent.change(title, { target: { value: "Stay" } });
    await waitFor(() => expect(updates()).toHaveLength(1), { timeout: 2000 });
    fireEvent.change(title, { target: { value: "Stay Upd" } });
    // A background refetch returns the stale server copy mid-typing.
    await act(() => client.refetchQueries({ queryKey: ["admin-widgets"] }));
    expect(title.value).toBe("Stay Upd");
    fireEvent.change(title, { target: { value: "Stay Updated" } });
    await waitFor(() => expect(updates()).toHaveLength(2), { timeout: 2000 });
    expect(updates()[1].payload).toEqual({ config: { title: "Stay Updated" } });
    expect(title.value).toBe("Stay Updated");
    expect(await screen.findByText("Saved")).toBeTruthy();
    expect(h.toast).not.toHaveBeenCalled();
  });

  it("reports a failed config save", async () => {
    server = rows;
    h.state.respond = respond((op) =>
      op.action === "update"
        ? { data: null, error: { message: "permission denied" } }
        : undefined,
    );
    wrap();
    fireEvent.click(await screen.findByRole("tab", { name: /Sidebar/ }));
    fireEvent.change(await screen.findByLabelText("Title"), {
      target: { value: "New" },
    });
    await waitFor(
      () =>
        expect(h.toast).toHaveBeenCalledWith(
          expect.objectContaining({ variant: "destructive" }),
        ),
      { timeout: 2000 },
    );
  });

  it("reports a reorder that the database did not apply", async () => {
    server = rows;
    h.state.respond = respond((op) =>
      op.action === "update" ? { data: [], error: null } : undefined,
    );
    wrap();
    fireEvent.click(
      await screen.findByRole("button", { name: "Move Share Bar down" }),
    );
    await waitFor(() =>
      expect(h.toast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Couldn't reorder widgets",
          variant: "destructive",
        }),
      ),
    );
    expect(
      (
        screen.getByRole("button", {
          name: "Move Share Bar up",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });

  it("names each on/off switch", async () => {
    server = rows;
    h.state.respond = respond();
    wrap();
    const toggle = await screen.findByRole("switch", {
      name: "Show Share Bar",
    });
    expect((toggle as HTMLInputElement).checked).toBe(true);
  });
});
