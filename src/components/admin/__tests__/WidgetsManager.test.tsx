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
import WidgetsManager, {
  WIDGET_REQUEST_TIMEOUT_MS,
  WIDGET_SAVE_DELAY_MS,
} from "../WidgetsManager";
import {
  type FakeOp,
  type FakeResult,
  type FakeState,
} from "./fakeSupabaseQuery";

const h = vi.hoisted(() => ({
  toast: vi.fn(),
  rpc: vi.fn(),
  state: {
    ops: [] as FakeOp[],
    respond: (_op: FakeOp): FakeResult => ({ data: [], error: null }),
  } as FakeState,
}));

vi.mock("@tanstack/react-router", () => ({ useBlocker: vi.fn() }));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: h.toast }),
  toast: h.toast,
}));
vi.mock("@/integrations/supabase/client", async () => {
  const { createFakeSupabase } = await import("./fakeSupabaseQuery");
  return {
    supabase: {
      ...createFakeSupabase(h.state),
      rpc: (name: string, args: unknown) => ({
        abortSignal: () => h.rpc(name, args),
      }),
    },
  };
});

beforeAll(() => {
  h.rpc.mockResolvedValue({ data: { saved: true }, error: null });
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
  h.state.ops = [];
  h.rpc.mockReset().mockResolvedValue({ data: { saved: true }, error: null });
});

const widget = (over: Record<string, unknown>) => ({
  id: "w1",
  widget_slug: "page-share-bar",
  widget_zone: "page",
  display_name: "Share Bar",
  is_enabled: true,
  config: {},
  sort_order: 1,
  updated_at: "2026-09-25T00:00:00Z",
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
    if (op.action === "select" && op.columns === "updated_at")
      return { data: { updated_at: "2026-09-25T00:00:00Z" }, error: null };
    if (op.action === "select") return { data: server, error: null };
    const id = op.filters.find((f) => f[0] === "eq")?.[2];
    return { data: [{ id, updated_at: "2026-09-25T00:00:01Z" }], error: null };
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
  it("keeps the edited version across a background refresh and preserves a conflicting draft", async () => {
    server = rows;
    h.state.respond = respond((op) =>
      op.action === "update" ? { data: [], error: null } : undefined,
    );
    const client = wrap();
    fireEvent.click(await screen.findByRole("tab", { name: /Sidebar/ }));
    vi.useFakeTimers();
    const title = screen.getByLabelText("Title") as HTMLInputElement;
    fireEvent.change(title, { target: { value: "My unsaved draft" } });
    server = rows.map((row) =>
      row.id === "w3"
        ? {
            ...row,
            updated_at: "2026-09-25T00:00:09Z",
            config: { title: "Other tab" },
          }
        : row,
    );
    await act(() => client.refetchQueries({ queryKey: ["admin-widgets"] }));
    await act(async () => vi.advanceTimersByTimeAsync(WIDGET_SAVE_DELAY_MS));
    expect(updates()[0].filters).toContainEqual([
      "eq",
      "updated_at",
      "2026-09-25T00:00:00Z",
    ]);
    expect(title.value).toBe("My unsaved draft");
    expect(screen.getByText("Not saved")).toBeTruthy();
    fireEvent.change(title, { target: { value: "Still my draft" } });
    await act(async () => vi.advanceTimersByTimeAsync(WIDGET_SAVE_DELAY_MS));
    expect(updates()).toHaveLength(1);
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    fireEvent.click(
      screen.getByRole("button", { name: "Reload saved Newsletter Signup" }),
    );
    expect(title.value).toBe("Still my draft");
    confirm.mockReturnValue(true);
    h.state.respond = (op) =>
      op.action === "select" &&
      op.filters.some(([method]) => method === "maybeSingle")
        ? { data: server.find((row) => row.id === "w3"), error: null }
        : respond()(op);
    fireEvent.click(
      screen.getByRole("button", { name: "Reload saved Newsletter Signup" }),
    );
    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(title.value).toBe("Other tab");
    confirm.mockRestore();
  });
  it("keeps a dirty widget visible if a refresh reports it deleted", async () => {
    server = rows;
    h.state.respond = respond();
    const client = wrap();
    fireEvent.click(await screen.findByRole("tab", { name: /Sidebar/ }));
    vi.useFakeTimers();
    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "Don't lose this" },
    });
    server = rows.filter((row) => row.id !== "w3");
    await act(() => client.refetchQueries({ queryKey: ["admin-widgets"] }));
    expect((screen.getByLabelText("Title") as HTMLInputElement).value).toBe(
      "Don't lose this",
    );
  });

  it("releases reorder controls even when the following refresh stalls", async () => {
    server = rows;
    let reads = 0;
    h.state.respond = (op) => {
      if (op.action === "select" && op.columns === "*" && ++reads > 1)
        return new Promise<FakeResult>(() => {});
      return respond()(op);
    };
    wrap();
    const move = await screen.findByRole("button", {
      name: "Move Share Bar down",
    });
    vi.useFakeTimers();
    fireEvent.click(move);
    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(h.rpc).toHaveBeenCalledWith("admin_swap_widget_order", {
      _first_id: "w1",
      _second_id: "w2",
      _first_order: 1,
      _second_order: 2,
      _direction: "down",
    });
    expect(updates()).toHaveLength(0);
    expect((move as HTMLButtonElement).disabled).toBe(true);
    await act(async () =>
      vi.advanceTimersByTimeAsync(WIDGET_REQUEST_TIMEOUT_MS + 1),
    );
    expect((move as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getByRole("alert").textContent).toContain(
      "Couldn't load widgets",
    );
    const refresh = h.state.ops
      .filter((op) => op.action === "select" && op.columns === "*")
      .at(-1)!;
    expect(
      (
        refresh.filters.find(
          ([method]) => method === "abortSignal",
        )?.[1] as AbortSignal
      ).aborted,
    ).toBe(true);
  });
  it("aborts a stalled save, releases the queue, and ignores its late response", async () => {
    server = rows;
    let finishOld!: () => void;
    let version = "2026-09-25T00:00:00Z";
    let storedTitle = "Old";
    let first = true;
    h.state.respond = (op) => {
      if (op.action === "select" && op.columns === "updated_at")
        return { data: { updated_at: version }, error: null };
      if (op.action === "update") {
        const expected = op.filters.find(
          ([method, column]) => method === "eq" && column === "updated_at",
        )?.[2];
        const commit = () => {
          if (expected !== version) return { data: [], error: null };
          storedTitle = (op.payload as { config: { title: string } }).config
            .title;
          version = "2026-09-25T00:00:01Z";
          return {
            data: [{ id: "w3", updated_at: "2026-09-25T00:00:01Z" }],
            error: null,
          };
        };
        if (first) {
          first = false;
          return new Promise<FakeResult>((resolve) => {
            finishOld = () => resolve(commit());
          });
        }
        return commit();
      }
      return respond()(op);
    };
    const client = wrap();
    fireEvent.click(await screen.findByRole("tab", { name: /Sidebar/ }));
    vi.useFakeTimers();
    const title = screen.getByLabelText("Title");
    fireEvent.change(title, { target: { value: "First draft" } });
    await act(async () => vi.advanceTimersByTimeAsync(WIDGET_SAVE_DELAY_MS));
    expect(updates()).toHaveLength(1);
    const firstSignal = updates()[0].filters.find(
      ([method]) => method === "abortSignal",
    )?.[1] as AbortSignal;
    fireEvent.change(title, { target: { value: "Newest draft" } });
    await act(async () => vi.advanceTimersByTimeAsync(WIDGET_SAVE_DELAY_MS));
    expect(updates()).toHaveLength(1);
    await act(async () =>
      vi.advanceTimersByTimeAsync(WIDGET_REQUEST_TIMEOUT_MS),
    );
    expect(firstSignal.aborted).toBe(true);
    expect(updates()).toHaveLength(1);
    // A timeout is uncertain, so another keystroke does not restart writes.
    fireEvent.click(
      screen.getByRole("button", { name: "Retry saving Newsletter Signup" }),
    );
    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(updates()).toHaveLength(2);
    expect(storedTitle).toBe("Newest draft");
    expect(h.toast).toHaveBeenCalledWith(
      expect.objectContaining({
        description: expect.stringContaining("timed out"),
        variant: "destructive",
      }),
    );
    await act(async () => {
      finishOld();
    });
    expect(storedTitle).toBe("Newest draft");
    expect((title as HTMLInputElement).value).toBe("Newest draft");
    expect(
      client
        .getQueryData<Array<{ id: string; config: { title?: string } }>>([
          "admin-widgets",
        ])
        ?.find((entry) => entry.id === "w3")?.config.title,
    ).toBe("Newest draft");
  });

  it("returns a stalled single save to Retry with its draft intact", async () => {
    server = rows;
    h.state.respond = (op) =>
      op.action === "update"
        ? new Promise<FakeResult>(() => {})
        : respond()(op);
    wrap();
    fireEvent.click(await screen.findByRole("tab", { name: /Sidebar/ }));
    vi.useFakeTimers();
    const title = screen.getByLabelText("Title");
    fireEvent.change(title, { target: { value: "Recover this draft" } });
    await act(async () =>
      vi.advanceTimersByTimeAsync(
        WIDGET_SAVE_DELAY_MS + WIDGET_REQUEST_TIMEOUT_MS,
      ),
    );
    expect(
      screen.getByRole("button", { name: "Retry saving Newsletter Signup" }),
    ).toBeTruthy();
    expect((title as HTMLInputElement).value).toBe("Recover this draft");
    h.state.respond = respond();
    fireEvent.click(
      screen.getByRole("button", { name: "Retry saving Newsletter Signup" }),
    );
    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(screen.getByText("Saved")).toBeTruthy();
  });
  it("serializes edits across zone switches so a slow save cannot overwrite newer text", async () => {
    server = rows;
    let finishFirst!: (result: FakeResult) => void;
    let first = true;
    const normal = respond();
    h.state.respond = (op) => {
      if (op.action === "update" && first) {
        first = false;
        return new Promise<FakeResult>((resolve) => {
          finishFirst = resolve;
        });
      }
      return normal(op);
    };
    wrap();
    fireEvent.click(await screen.findByRole("tab", { name: /Sidebar/ }));
    fireEvent.change(await screen.findByLabelText("Title"), {
      target: { value: "First draft" },
    });
    await waitFor(() => expect(updates()).toHaveLength(1), { timeout: 2000 });
    fireEvent.click(screen.getByRole("tab", { name: /^Page$/ }));
    await waitFor(() => expect(updates()).toHaveLength(1));
    fireEvent.click(screen.getByRole("tab", { name: /Sidebar/ }));
    fireEvent.change(await screen.findByLabelText("Title"), {
      target: { value: "Final draft" },
    });
    fireEvent.click(screen.getByRole("tab", { name: /^Page$/ }));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 700));
    });
    expect(updates()).toHaveLength(1);
    await act(async () =>
      finishFirst({
        data: [{ id: "w3", updated_at: "2026-09-25T00:00:01Z" }],
        error: null,
      }),
    );
    await waitFor(() => expect(updates()).toHaveLength(2));
    expect(updates()[1].payload).toEqual({ config: { title: "Final draft" } });
  });

  it("keeps a failed draft and Retry available after changing zones", async () => {
    server = rows;
    h.state.respond = (op) =>
      op.action === "update"
        ? { data: null, error: { message: "Offline" } }
        : respond()(op);
    wrap();
    fireEvent.click(await screen.findByRole("tab", { name: /Sidebar/ }));
    fireEvent.change(await screen.findByLabelText("Title"), {
      target: { value: "Keep this across zones" },
    });
    fireEvent.click(screen.getByRole("tab", { name: /^Page$/ }));
    await waitFor(
      () =>
        expect(h.toast).toHaveBeenCalledWith(
          expect.objectContaining({ variant: "destructive" }),
        ),
      { timeout: 2000 },
    );
    fireEvent.click(screen.getByRole("tab", { name: /Sidebar/ }));
    expect((screen.getByLabelText("Title") as HTMLInputElement).value).toBe(
      "Keep this across zones",
    );
    expect(
      screen.getByRole("button", { name: "Retry saving Newsletter Signup" }),
    ).toBeTruthy();
  });

  it("retains the draft and lets a rejected request be retried", async () => {
    server = rows;
    h.state.respond = (op) => {
      if (op.action === "update") throw new Error("Network unavailable");
      return respond()(op);
    };
    wrap();
    fireEvent.click(await screen.findByRole("tab", { name: /Sidebar/ }));
    const title = await screen.findByLabelText("Title");
    fireEvent.change(title, { target: { value: "Keep this draft" } });
    const retry = await screen.findByRole("button", {
      name: "Retry saving Newsletter Signup",
    });
    expect((title as HTMLInputElement).value).toBe("Keep this draft");
    h.state.respond = respond();
    fireEvent.click(retry);
    await screen.findByText("Saved");
    expect(updates()).toHaveLength(2);
    expect(updates()[1].payload).toEqual({
      config: { title: "Keep this draft" },
    });
  });

  it("locks the visibility switch until its change completes", async () => {
    server = rows;
    let finish!: (result: FakeResult) => void;
    h.state.respond = (op) =>
      op.action === "update"
        ? new Promise<FakeResult>((resolve) => {
            finish = resolve;
          })
        : respond()(op);
    wrap();
    const toggle = await screen.findByRole("switch", {
      name: "Show Share Bar",
    });
    fireEvent.click(toggle);
    await waitFor(() => expect(updates()).toHaveLength(1));
    expect((toggle as HTMLInputElement).disabled).toBe(true);
    fireEvent.click(toggle);
    expect(updates()).toHaveLength(1);
    await act(async () =>
      finish({
        data: [{ id: "w1", updated_at: "2026-09-25T00:00:01Z" }],
        error: null,
      }),
    );
    await waitFor(() =>
      expect((toggle as HTMLInputElement).disabled).toBe(false),
    );
    expect((toggle as HTMLInputElement).checked).toBe(false);
  });

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
    h.state.respond = respond();
    h.rpc.mockResolvedValue({
      data: null,
      error: { message: "The widget order changed" },
    });
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
