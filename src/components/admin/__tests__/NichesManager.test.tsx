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
import NichesManager from "../NichesManager";
import type { FakeOp, FakeResult } from "./fakeSupabaseQuery";

type Op = FakeOp;
type Result = FakeResult;

const h = vi.hoisted(() => {
  const state = {
    toast: vi.fn(),
    ops: [] as FakeOp[],
    niches: [] as unknown[],
    respond: (_op: FakeOp): FakeResult => ({ data: [], error: null }),
    rpc: (_name: string): FakeResult => ({ data: state.niches, error: null }),
  };
  return state;
});
const readNiches = h.rpc;

vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: h.toast }) }));
vi.mock("@/lib/withTimeout", () => ({
  safeMutation: (run: () => unknown) => run(),
}));
vi.mock("@/integrations/supabase/client", async () => {
  const { createFakeSupabase } = await import("./fakeSupabaseQuery");
  return { supabase: createFakeSupabase(h) };
});

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

const niche = (over: Record<string, unknown> = {}) => ({
  id: "n1",
  name: "Wholesalers",
  slug: "wholesalers",
  parent_niche_id: null,
  is_active: true,
  expert_pov: null,
  created_at: null,
  updated_at: null,
  context: {
    audience: "Real estate wholesalers",
    target_keyword: "AI training for real estate wholesalers",
    content_focus: "deal flow",
  },
  ...over,
});

const defaultRespond = (op: Op): Result => {
  if (op.action === "select" && op.head) return { count: 0, error: null };
  if (op.action === "update" || op.action === "delete")
    return { data: [{ id: "n1" }], error: null };
  return { data: [], error: null };
};

const renderManager = () =>
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <NichesManager />
    </QueryClientProvider>,
  );

const lastOp = (pred: (op: Op) => boolean) => [...h.ops].reverse().find(pred);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  h.ops = [];
  h.respond = defaultRespond;
  h.rpc = readNiches;
  h.niches = [];
});

describe("NichesManager edit", () => {
  it("keeps target_keyword and content_focus when saving an edit", async () => {
    h.niches = [niche()];
    h.respond = defaultRespond;
    renderManager();
    fireEvent.click(await screen.findByRole("button", { name: /Edit/ }));
    const keyword = screen.getByLabelText(
      "Target keyword (topic guide)",
    ) as HTMLInputElement;
    expect(keyword.value).toBe("AI training for real estate wholesalers");
    fireEvent.change(screen.getByLabelText("Audience"), {
      target: { value: "Wholesalers who flip contracts" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save Niche" }));
    await waitFor(() =>
      expect(h.toast).toHaveBeenCalledWith({ title: "Niche updated" }),
    );
    const update = lastOp((o) => o.table === "niches" && o.action === "update");
    expect(update?.payload).toMatchObject({
      context: {
        audience: "Wholesalers who flip contracts",
        target_keyword: "AI training for real estate wholesalers",
        content_focus: "deal flow",
      },
    });
    expect(update?.filters).toContainEqual(["eq", "id", "n1"]);
  });

  it("saves an edited target keyword", async () => {
    h.niches = [niche()];
    h.respond = defaultRespond;
    renderManager();
    fireEvent.click(await screen.findByRole("button", { name: /Edit/ }));
    fireEvent.change(screen.getByLabelText("Target keyword (topic guide)"), {
      target: { value: "  AI for wholesalers  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save Niche" }));
    await waitFor(() =>
      expect(h.toast).toHaveBeenCalledWith({ title: "Niche updated" }),
    );
    const update = lastOp((o) => o.action === "update");
    expect(update?.payload).toMatchObject({
      context: {
        target_keyword: "AI for wholesalers",
        content_focus: "deal flow",
      },
    });
  });

  it("reports an error instead of success when the niche no longer exists", async () => {
    h.niches = [niche()];
    h.respond = (op) =>
      op.action === "update" ? { data: [], error: null } : defaultRespond(op);
    renderManager();
    fireEvent.click(await screen.findByRole("button", { name: /Edit/ }));
    fireEvent.click(screen.getByRole("button", { name: "Save Niche" }));
    await waitFor(() =>
      expect(h.toast).toHaveBeenCalledWith(
        expect.objectContaining({
          variant: "destructive",
          description: expect.stringContaining("no longer exists"),
        }),
      ),
    );
    expect(h.toast).not.toHaveBeenCalledWith({ title: "Niche updated" });
    // Dialog stays open so typed changes are not lost.
    expect(screen.getByRole("button", { name: "Save Niche" })).toBeTruthy();
  });

  it("gives a new niche an explicit target keyword when left blank", async () => {
    h.niches = [];
    h.respond = defaultRespond;
    renderManager();
    fireEvent.click(await screen.findByRole("button", { name: /Add Niche/ }));
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Dentists" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save Niche" }));
    await waitFor(() =>
      expect(h.toast).toHaveBeenCalledWith({ title: "Niche created" }),
    );
    const insert = lastOp((o) => o.action === "insert");
    expect(insert?.payload).toMatchObject({
      context: { target_keyword: "AI training for Dentists" },
    });
  });

  it("shows an error when niches fail to load instead of an empty state", async () => {
    h.rpc = () => ({ data: null, error: { message: "boom" } });
    renderManager();
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Couldn't load niches",
    );
    expect(screen.queryByText(/No niches yet/)).toBeNull();
  });
});

describe("NichesManager delete", () => {
  it("counts niche_id and silo_niche_id pages and offers Deactivate instead", async () => {
    h.niches = [niche()];
    h.respond = (op) => {
      if (op.table === "generated_pages" && op.head)
        return { count: 8, error: null };
      if (op.table === "pillar_pages" && op.head)
        return { count: 1, error: null };
      return defaultRespond(op);
    };
    renderManager();
    fireEvent.click(
      await screen.findByRole("button", { name: "Delete Wholesalers" }),
    );
    const dialog = await screen.findByRole("alertdialog");
    await within(dialog).findByText(/used by 8 generated pages/);
    expect(within(dialog).getByText(/Can't delete "Wholesalers"/)).toBeTruthy();
    expect(within(dialog).queryByRole("button", { name: "Delete" })).toBeNull();
    const countOp = lastOp((o) => o.table === "generated_pages" && !!o.head);
    expect(countOp?.filters).toContainEqual([
      "or",
      "niche_id.eq.n1,silo_niche_id.eq.n1",
    ]);

    fireEvent.click(
      within(dialog).getByRole("button", { name: "Deactivate instead" }),
    );
    await waitFor(() =>
      expect(h.toast).toHaveBeenCalledWith({ title: "Deactivated 1 niche" }),
    );
    const update = lastOp((o) => o.action === "update");
    expect(update?.payload).toEqual({ is_active: false });
    expect(update?.filters).toContainEqual(["in", "id", ["n1"]]);
    expect(h.ops.some((o) => o.action === "delete")).toBe(false);
  });

  it("deletes a niche with no generated pages and warns about unlinked guides", async () => {
    h.niches = [niche()];
    h.respond = (op) => {
      if (op.table === "pillar_pages" && op.head)
        return { count: 2, error: null };
      return defaultRespond(op);
    };
    renderManager();
    fireEvent.click(
      await screen.findByRole("button", { name: "Delete Wholesalers" }),
    );
    const dialog = await screen.findByRole("alertdialog");
    await within(dialog).findByText(/2 topic guides will be unlinked/);
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
    await waitFor(() =>
      expect(h.toast).toHaveBeenCalledWith({ title: "Niche deleted" }),
    );
  });

  it("maps a foreign-key failure to plain English", async () => {
    h.niches = [niche()];
    h.respond = (op) =>
      op.action === "delete"
        ? {
            data: null,
            error: {
              code: "23503",
              message:
                'update or delete on table "niches" violates foreign key constraint',
            },
          }
        : defaultRespond(op);
    renderManager();
    fireEvent.click(
      await screen.findByRole("button", { name: "Delete Wholesalers" }),
    );
    const dialog = await screen.findByRole("alertdialog");
    fireEvent.click(
      await within(dialog).findByRole("button", { name: "Delete" }),
    );
    await waitFor(() =>
      expect(h.toast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Couldn't delete niche",
          description: expect.stringContaining("still used by other content"),
        }),
      ),
    );
  });

  it("does not offer Delete when the dependent count fails", async () => {
    h.niches = [niche()];
    h.respond = (op) =>
      op.table === "generated_pages" && op.head
        ? { count: null, error: { message: "permission denied" } }
        : defaultRespond(op);
    renderManager();
    fireEvent.click(
      await screen.findByRole("button", { name: "Delete Wholesalers" }),
    );
    const dialog = await screen.findByRole("alertdialog");
    await within(dialog).findByText(/Couldn't check what uses this niche/);
    expect(within(dialog).queryByRole("button", { name: "Delete" })).toBeNull();
  });
});
