// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
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
import type { ReactNode } from "react";
import ContentTypesManager from "../ContentTypesManager";
import ContentTypeEditor from "../ContentTypeEditor";
import {
  lastOp,
  type FakeOp,
  type FakeResult,
  type FakeState,
} from "./fakeSupabaseQuery";

const h = vi.hoisted(() => ({
  toast: vi.fn(),
  navigate: vi.fn(),
  params: {} as { id?: string },
  blocker: { shouldBlockFn: () => false, enableBeforeUnload: false },
  state: {
    ops: [] as FakeOp[],
    respond: (_op: FakeOp): FakeResult => ({ data: [], error: null }),
  } as FakeState,
}));
vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useBlocker: (options: typeof h.blocker) => {
    h.blocker = options;
  },
}));

vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: h.toast }) }));
vi.mock("@/lib/withTimeout", () => ({
  safeMutation: (run: () => unknown) => run(),
}));
vi.mock("@/lib/router-compat", () => ({
  useNavigate: () => h.navigate,
  useParams: () => h.params,
  Link: ({ to, children, ...rest }: { to: string; children: ReactNode }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
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

const schema = (over: Record<string, unknown> = {}) => ({
  id: "cs1",
  name: "Tool Roundups",
  slug: "tool-roundups",
  description: null,
  title_template: "{{count}} tools for {{niche_name}}",
  description_template: null,
  items_per_section: 15,
  renderer_component: "ToolRoundupRenderer",
  is_active: true,
  schema_definition: {},
  created_at: null,
  ...over,
});

const wrap = (
  ui: ReactNode,
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } }),
) => render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  h.state.ops = [];
  h.params = {};
});

describe("ContentTypesManager delete", () => {
  const listRespond =
    (pageCount: number, extra?: (op: FakeOp) => FakeResult | undefined) =>
    (op: FakeOp): FakeResult => {
      const custom = extra?.(op);
      if (custom) return custom;
      if (op.table === "content_schemas" && op.action === "select")
        return { data: [schema()], error: null };
      if (op.table === "generated_pages" && op.head)
        return { count: pageCount, error: null };
      if (op.action === "update" || op.action === "delete")
        return { data: [{ id: "cs1" }], error: null };
      return { data: [], error: null };
    };

  it("uses the sidebar label as its heading and lets the table scroll on phones", async () => {
    h.state.respond = listRespond(0);
    wrap(<ContentTypesManager />);
    expect(
      screen.getByRole("heading", { level: 1, name: "Content formats" }),
    ).toBeTruthy();
    const table = await screen.findByRole("table");
    const card = table.parentElement as HTMLElement;
    expect(card.className).toContain("overflow-x-auto");
    expect(card.style.overflow).toBe("");
    expect(table.style.minWidth).toBe("760px");
  });

  it("refuses to delete a format that pages use and offers Deactivate instead", async () => {
    h.state.respond = listRespond(6);
    wrap(<ContentTypesManager />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Delete Tool Roundups" }),
    );
    const dialog = await screen.findByRole("alertdialog");
    await within(dialog).findByText(/6 generated pages use this format/);
    expect(within(dialog).queryByText(/will not be deleted/)).toBeNull();
    expect(within(dialog).queryByRole("button", { name: "Delete" })).toBeNull();
    const countOp = lastOp(
      h.state,
      (o) => o.table === "generated_pages" && !!o.head,
    );
    expect(countOp?.filters).toContainEqual(["eq", "content_schema_id", "cs1"]);

    fireEvent.click(
      within(dialog).getByRole("button", { name: "Deactivate instead" }),
    );
    await waitFor(() =>
      expect(h.toast).toHaveBeenCalledWith({
        title: "Content type deactivated",
      }),
    );
    expect(lastOp(h.state, (o) => o.action === "update")?.payload).toEqual({
      is_active: false,
    });
    expect(h.state.ops.some((o) => o.action === "delete")).toBe(false);
  });

  it("deletes an unused format", async () => {
    h.state.respond = listRespond(0);
    wrap(<ContentTypesManager />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Delete Tool Roundups" }),
    );
    const dialog = await screen.findByRole("alertdialog");
    fireEvent.click(
      await within(dialog).findByRole("button", { name: "Delete" }),
    );
    await waitFor(() =>
      expect(h.toast).toHaveBeenCalledWith({ title: "Content type deleted" }),
    );
  });

  it("shows a plain-English message when the database rejects the delete", async () => {
    h.state.respond = listRespond(0, (op) =>
      op.action === "delete"
        ? {
            data: null,
            error: {
              code: "23503",
              message:
                'update or delete on table "content_schemas" violates foreign key constraint',
            },
          }
        : undefined,
    );
    wrap(<ContentTypesManager />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Delete Tool Roundups" }),
    );
    const dialog = await screen.findByRole("alertdialog");
    fireEvent.click(
      await within(dialog).findByRole("button", { name: "Delete" }),
    );
    await waitFor(() =>
      expect(h.toast).toHaveBeenCalledWith(
        expect.objectContaining({
          description: expect.stringContaining(
            "This content format is still used by other content",
          ),
        }),
      ),
    );
  });
});

describe("ContentTypeEditor", () => {
  it("freezes a new format during insertion and leaves its saved form clean", async () => {
    let finish!: (result: FakeResult) => void;
    h.params = {};
    h.state.respond = (op) =>
      op.action === "insert"
        ? new Promise<FakeResult>((resolve) => {
            finish = resolve;
          })
        : { data: [], error: null };
    wrap(<ContentTypeEditor />);
    const name = screen.getByLabelText("Name");
    fireEvent.change(name, { target: { value: "My new format" } });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    await waitFor(() =>
      expect(h.state.ops.filter((op) => op.action === "insert")).toHaveLength(
        1,
      ),
    );
    expect(name.matches(":disabled")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    expect(h.state.ops.filter((op) => op.action === "insert")).toHaveLength(1);
    await act(async () => {
      finish({ data: [{ id: "new-format" }], error: null });
    });
    await waitFor(() =>
      expect(h.navigate).toHaveBeenCalledWith("/admin/content-types"),
    );
    expect(h.blocker.shouldBlockFn()).toBe(false);
  });
  it("keeps unsaved format text when navigation is cancelled", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    h.params = { id: "cs1" };
    h.state.respond = editorRespond({ existing: schema() });
    wrap(<ContentTypeEditor />);
    const name = await screen.findByDisplayValue("Tool Roundups");
    expect(h.blocker.shouldBlockFn()).toBe(false);
    fireEvent.change(name, { target: { value: "My unsaved format" } });
    expect(h.blocker.shouldBlockFn()).toBe(true);
    expect((name as HTMLInputElement).value).toBe("My unsaved format");
    expect(h.blocker.enableBeforeUnload).toBe(true);
    confirm.mockRestore();
  });
  it.each(["-2", "101"])(
    "rejects an unsafe generation size of %s before saving",
    async (value) => {
      h.params = { id: "cs1" };
      h.state.respond = editorRespond({ existing: schema() });
      wrap(<ContentTypeEditor />);
      fireEvent.change(await screen.findByRole("spinbutton"), {
        target: { value },
      });
      fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
      await waitFor(() =>
        expect(h.toast).toHaveBeenCalledWith(
          expect.objectContaining({
            variant: "destructive",
            description: expect.stringContaining("between 1 and 100"),
          }),
        ),
      );
      expect(h.state.ops.some((op) => op.action === "update")).toBe(false);
    },
  );

  const editorRespond =
    (opts: { existing: unknown; published?: number; updated?: unknown[] }) =>
    (op: FakeOp): FakeResult => {
      if (op.table === "content_schemas" && op.action === "select")
        return { data: opts.existing, error: null };
      if (op.table === "generated_pages" && op.head)
        return { count: opts.published ?? 0, error: null };
      if (op.action === "update")
        return { data: opts.updated ?? [{ id: "cs1" }], error: null };
      return { data: null, error: null };
    };

  it("keeps unsaved fields when the existing format refreshes in the background", async () => {
    h.params = { id: "cs1" };
    h.state.respond = editorRespond({ existing: schema() });
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    wrap(<ContentTypeEditor />, client);
    const name = await screen.findByDisplayValue("Tool Roundups");
    fireEvent.change(name, { target: { value: "My unsaved format" } });
    await act(async () => {
      client.setQueryData(
        ["admin-content-schema", "cs1"],
        schema({ name: "Remote format edit" }),
      );
    });
    expect((name as HTMLInputElement).value).toBe("My unsaved format");
  });

  it("shows a not-found state instead of an empty, saveable form", async () => {
    h.params = { id: "00000000-0000-0000-0000-000000000000" };
    h.state.respond = editorRespond({ existing: null });
    wrap(<ContentTypeEditor />);
    expect(
      await screen.findByText(
        "This content format no longer exists. It may have been deleted.",
      ),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Save Changes" })).toBeNull();
    expect(
      screen.getByRole("link", { name: "Back to content types" }),
    ).toBeTruthy();
  });

  it("reports an error when the update matched no rows", async () => {
    h.params = { id: "cs1" };
    h.state.respond = editorRespond({ existing: schema(), updated: [] });
    wrap(<ContentTypeEditor />);
    const save = await screen.findByRole("button", { name: "Save Changes" });
    fireEvent.click(save);
    await waitFor(() =>
      expect(h.toast).toHaveBeenCalledWith(
        expect.objectContaining({
          variant: "destructive",
          description: expect.stringContaining("was deleted"),
        }),
      ),
    );
    expect(h.navigate).not.toHaveBeenCalled();
    const update = lastOp(h.state, (o) => o.action === "update");
    expect(update?.filters).toContainEqual(["select", "id"]);
  });

  it("locks the slug when the format has published pages", async () => {
    h.params = { id: "cs1" };
    h.state.respond = editorRespond({ existing: schema(), published: 9 });
    wrap(<ContentTypeEditor />);
    const slug = (await screen.findByLabelText("Slug")) as HTMLInputElement;
    await screen.findByText(
      /9 published pages live at \/resources\/tool-roundups/,
    );
    expect(slug.readOnly).toBe(true);
    fireEvent.change(slug, { target: { value: "roundups" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
    await waitFor(() =>
      expect(h.toast).toHaveBeenCalledWith({ title: "Content type updated" }),
    );
    expect(
      lastOp(h.state, (o) => o.action === "update")?.payload,
    ).toMatchObject({ slug: "tool-roundups" });
    const countOp = lastOp(
      h.state,
      (o) => o.table === "generated_pages" && !!o.head,
    );
    expect(countOp?.filters).toContainEqual(["eq", "status", "published"]);
  });

  it("allows a slug change when no pages are published", async () => {
    h.params = { id: "cs1" };
    h.state.respond = editorRespond({ existing: schema(), published: 0 });
    wrap(<ContentTypeEditor />);
    const slug = (await screen.findByLabelText("Slug")) as HTMLInputElement;
    await waitFor(() => expect(slug.readOnly).toBe(false));
    fireEvent.change(slug, { target: { value: "roundups" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
    await waitFor(() =>
      expect(h.toast).toHaveBeenCalledWith({ title: "Content type updated" }),
    );
    expect(
      lastOp(h.state, (o) => o.action === "update")?.payload,
    ).toMatchObject({ slug: "roundups" });
  });

  it("rejects a malformed new slug", async () => {
    h.params = { id: "cs1" };
    h.state.respond = editorRespond({ existing: schema(), published: 0 });
    wrap(<ContentTypeEditor />);
    const slug = (await screen.findByLabelText("Slug")) as HTMLInputElement;
    await waitFor(() => expect(slug.readOnly).toBe(false));
    fireEvent.change(slug, { target: { value: "Tool Roundups!" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
    await waitFor(() =>
      expect(h.toast).toHaveBeenCalledWith(
        expect.objectContaining({
          description: expect.stringContaining("lowercase letters"),
        }),
      ),
    );
    expect(h.state.ops.some((o) => o.action === "update")).toBe(false);
  });
});
