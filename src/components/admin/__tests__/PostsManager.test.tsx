// @vitest-environment jsdom
import type React from "react";
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

type Call = { method: string; args: unknown[] };
type Operation = {
  table: string;
  kind: "select" | "update" | "delete";
  payload?: unknown;
  calls: Call[];
};
type Result = { data: unknown; error: unknown; count?: number | null };

const mock = vi.hoisted(() => ({
  operations: [] as Operation[],
  respond: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  params: new URLSearchParams(),
  setParams: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { success: mock.toastSuccess, error: mock.toastError },
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
  useSearchParams: () => [mock.params, mock.setParams],
}));
vi.mock("@/integrations/supabase/client", () => {
  const builder = (operation: Operation) => {
    const chain: Record<string, unknown> = {};
    for (const method of [
      "eq",
      "gte",
      "ilike",
      "order",
      "range",
      "select",
      "in",
      "gt",
      "is",
      "not",
    ]) {
      chain[method] = (...args: unknown[]) => {
        operation.calls.push({ method, args });
        return chain;
      };
    }
    chain.then = (
      resolve: (value: Result) => unknown,
      reject: (reason: unknown) => unknown,
    ) =>
      Promise.resolve(mock.respond(operation) as Result | Promise<Result>).then(
        resolve,
        reject,
      );
    return chain;
  };
  const start = (table: string, kind: Operation["kind"], payload?: unknown) => {
    const operation: Operation = { table, kind, payload, calls: [] };
    mock.operations.push(operation);
    return builder(operation);
  };
  return {
    supabase: {
      from: (table: string) => ({
        select: (...args: unknown[]) => {
          const chain = start(table, "select");
          mock.operations[mock.operations.length - 1].calls.push({
            method: "select",
            args,
          });
          return chain;
        },
        update: (payload: unknown) => start(table, "update", payload),
        delete: () => start(table, "delete"),
      }),
      functions: { invoke: vi.fn() },
    },
  };
});

import PostsManager from "../PostsManager";

const published = {
  id: "10000000-0000-4000-8000-000000000001",
  title: "How owners use AI",
  slug: "how-owners-use-ai",
  status: "published",
  created_at: "2026-09-01T00:00:00Z",
  updated_at: "2026-09-02T00:00:00Z",
  categories: { name: "AI" },
};
const draft = {
  id: "10000000-0000-4000-8000-000000000002",
  title: "Unfinished pricing notes",
  slug: "unfinished-pricing-notes",
  status: "draft",
  created_at: "2026-09-03T00:00:00Z",
  updated_at: "2026-09-04T00:00:00Z",
  categories: null,
};
const scheduled = {
  id: "10000000-0000-4000-8000-000000000003",
  title: "Next week's launch",
  slug: "next-weeks-launch",
  status: "scheduled",
  created_at: "2026-09-05T00:00:00Z",
  updated_at: "2026-09-06T00:00:00Z",
  categories: null,
};

const flagged = {
  id: "10000000-0000-4000-8000-000000000004",
  title: "Live article with wrong facts",
  slug: "live-article-with-wrong-facts",
  status: "published",
  created_at: "2026-09-01T00:00:00Z",
  updated_at: "2026-09-02T00:00:00Z",
  categories: null,
  contradicted_count: 2,
  held_reason: null,
  held_at: null,
};
const held = {
  id: "10000000-0000-4000-8000-000000000005",
  title: "Held pipeline draft",
  slug: "held-pipeline-draft",
  status: "draft",
  created_at: "2026-09-01T00:00:00Z",
  updated_at: "2026-09-02T00:00:00Z",
  categories: null,
  contradicted_count: 0,
  held_reason: "Quality score 62, needs 85; Not fact-checked yet",
  held_at: "2026-09-20T10:00:00Z",
};

function isCountQuery(operation: Operation) {
  return operation.calls.some(
    (c) =>
      c.method === "select" &&
      (c.args[1] as { head?: boolean } | undefined)?.head === true,
  );
}
function has(operation: Operation, method: string, ...args: unknown[]) {
  return operation.calls.some(
    (c) =>
      c.method === method && JSON.stringify(c.args) === JSON.stringify(args),
  );
}
function countFor(operation: Operation): Result {
  if (has(operation, "gt", "contradicted_count", 0))
    return { data: null, error: null, count: 2 };
  if (has(operation, "not", "held_reason", "is", null))
    return { data: null, error: null, count: 1 };
  return { data: null, error: null, count: 3 };
}
function listQueries() {
  return mock.operations.filter(
    (o) => o.table === "posts" && o.kind === "select" && !isCountQuery(o),
  );
}

let mutationResult: (operation: Operation) => Result | Promise<Result>;

function listSelects() {
  return listQueries().length;
}

function mutations(kind: "update" | "delete") {
  return mock.operations.filter((o) => o.table === "posts" && o.kind === kind);
}

function renderManager() {
  return render(
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
      <PostsManager />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mock.params = new URLSearchParams();
  mock.setParams.mockReset();
  mock.operations.length = 0;
  mock.respond.mockReset();
  mock.toastSuccess.mockReset();
  mock.toastError.mockReset();
  mutationResult = () => ({ data: [{ id: "x" }], error: null });
  mock.respond.mockImplementation((operation: Operation) => {
    if (operation.table === "categories") return { data: [], error: null };
    if (isCountQuery(operation)) return countFor(operation);
    if (operation.kind === "select")
      return { data: [published, draft, scheduled], error: null, count: 3 };
    return mutationResult(operation);
  });
});
afterEach(cleanup);

describe("articles list row actions", () => {
  it("never offers Delete on published or scheduled articles", async () => {
    renderManager();
    await screen.findByText(published.title);
    expect(
      screen.queryByRole("button", { name: `Delete ${published.title}` }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: `Delete ${scheduled.title}` }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: `Unpublish ${published.title}` }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: `Unschedule ${scheduled.title}` }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: `Delete ${draft.title}` }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: `Unpublish ${draft.title}` }),
    ).not.toBeInTheDocument();
  });

  it("unpublishes a live article back to draft after a clear warning", async () => {
    renderManager();
    fireEvent.click(
      await screen.findByRole("button", {
        name: `Unpublish ${published.title}`,
      }),
    );
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent("Unpublish this article?");
    expect(dialog).toHaveTextContent(published.title);
    expect(dialog).toHaveTextContent(`/blog/${published.slug}`);
    expect(dialog).toHaveTextContent(
      /stop working until you publish it again/i,
    );
    expect(dialog).toHaveTextContent(/nothing is deleted/i);
    const before = listSelects();
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Move back to draft" }),
    );
    await waitFor(() =>
      expect(mock.toastSuccess).toHaveBeenCalledWith(
        `"${published.title}" is now a draft. Its page is offline until you publish it again.`,
      ),
    );
    const [update] = mutations("update");
    expect(update.payload).toEqual({ status: "draft" });
    expect(update.calls).toEqual(
      expect.arrayContaining([
        { method: "eq", args: ["id", published.id] },
        { method: "eq", args: ["status", "published"] },
      ]),
    );
    expect(mutations("delete")).toHaveLength(0);
    await waitFor(() => expect(listSelects()).toBeGreaterThan(before));
    await waitFor(() =>
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument(),
    );
  });

  it("explains a failed unpublish in plain English and keeps the dialog open", async () => {
    mutationResult = () => ({
      data: null,
      error: { message: "new row violates row-level security policy" },
    });
    renderManager();
    fireEvent.click(
      await screen.findByRole("button", {
        name: `Unpublish ${published.title}`,
      }),
    );
    const dialog = await screen.findByRole("alertdialog");
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Move back to draft" }),
    );
    await waitFor(() => expect(mock.toastError).toHaveBeenCalledTimes(1));
    const message = mock.toastError.mock.calls[0][0] as string;
    expect(message).toMatch(/couldn't unpublish/i);
    expect(message).toMatch(/still live/i);
    expect(message).not.toMatch(/row-level security/);
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
  });

  it("reports when an article was already changed elsewhere instead of claiming success", async () => {
    mutationResult = () => ({ data: [], error: null });
    renderManager();
    fireEvent.click(
      await screen.findByRole("button", {
        name: `Unpublish ${published.title}`,
      }),
    );
    fireEvent.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", {
        name: "Move back to draft",
      }),
    );
    await waitFor(() =>
      expect(mock.toastError).toHaveBeenCalledWith(
        expect.stringMatching(/no longer published/i),
      ),
    );
    expect(mock.toastSuccess).not.toHaveBeenCalled();
  });

  it("moves a scheduled article back to draft so it will not go live", async () => {
    renderManager();
    fireEvent.click(
      await screen.findByRole("button", {
        name: `Unschedule ${scheduled.title}`,
      }),
    );
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent(/will not go live/i);
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Move back to draft" }),
    );
    await waitFor(() => expect(mock.toastSuccess).toHaveBeenCalled());
    const [update] = mutations("update");
    expect(update.payload).toEqual({ status: "draft" });
    expect(update.calls).toEqual(
      expect.arrayContaining([
        { method: "eq", args: ["id", scheduled.id] },
        { method: "eq", args: ["status", "scheduled"] },
      ]),
    );
  });

  it("requires typing DELETE before permanently deleting a draft and its history", async () => {
    renderManager();
    fireEvent.click(
      await screen.findByRole("button", { name: `Delete ${draft.title}` }),
    );
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent("Permanently delete this draft?");
    expect(dialog).toHaveTextContent(draft.title);
    expect(dialog).toHaveTextContent(/revision history/i);
    expect(dialog).toHaveTextContent(/cannot be undone/i);
    const confirm = within(dialog).getByRole("button", {
      name: "Delete forever",
    });
    expect(confirm).toBeDisabled();
    const input = within(dialog).getByLabelText(/type delete to confirm/i);
    fireEvent.change(input, { target: { value: "delet" } });
    expect(confirm).toBeDisabled();
    fireEvent.click(confirm);
    expect(mutations("delete")).toHaveLength(0);
    fireEvent.change(input, { target: { value: "DELETE" } });
    expect(confirm).toBeEnabled();
    fireEvent.click(confirm);
    await waitFor(() =>
      expect(mock.toastSuccess).toHaveBeenCalledWith(
        `"${draft.title}" and its revision history were permanently deleted.`,
      ),
    );
    const [removal] = mutations("delete");
    expect(removal.calls).toEqual(
      expect.arrayContaining([
        { method: "eq", args: ["id", draft.id] },
        { method: "eq", args: ["status", "draft"] },
      ]),
    );
  });

  it("clears the typed confirmation when a different draft is opened", async () => {
    renderManager();
    fireEvent.click(
      await screen.findByRole("button", { name: `Delete ${draft.title}` }),
    );
    let dialog = await screen.findByRole("alertdialog");
    fireEvent.change(within(dialog).getByLabelText(/type delete to confirm/i), {
      target: { value: "DELETE" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() =>
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument(),
    );
    fireEvent.click(
      screen.getByRole("button", { name: `Delete ${draft.title}` }),
    );
    dialog = await screen.findByRole("alertdialog");
    expect(
      within(dialog).getByRole("button", { name: "Delete forever" }),
    ).toBeDisabled();
  });

  it("refuses to delete an article that is no longer a draft", async () => {
    mutationResult = () => ({ data: [], error: null });
    renderManager();
    fireEvent.click(
      await screen.findByRole("button", { name: `Delete ${draft.title}` }),
    );
    const dialog = await screen.findByRole("alertdialog");
    fireEvent.change(within(dialog).getByLabelText(/type delete to confirm/i), {
      target: { value: "delete" },
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Delete forever" }),
    );
    await waitFor(() =>
      expect(mock.toastError).toHaveBeenCalledWith(
        expect.stringMatching(/no longer a draft/i),
      ),
    );
    expect(mock.toastSuccess).not.toHaveBeenCalled();
  });

  it("disables the dialog and row actions while a change is saving", async () => {
    let finish: (value: Result) => void = () => {};
    mutationResult = () =>
      new Promise<Result>((resolve) => {
        finish = resolve;
      });
    renderManager();
    fireEvent.click(
      await screen.findByRole("button", {
        name: `Unpublish ${published.title}`,
      }),
    );
    const dialog = await screen.findByRole("alertdialog");
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Move back to draft" }),
    );
    expect(
      await within(dialog).findByRole("button", { name: "Working…" }),
    ).toBeDisabled();
    expect(
      within(dialog).getByRole("button", { name: "Cancel" }),
    ).toBeDisabled();
    expect(mutations("update")).toHaveLength(1);
    finish({ data: [{ id: published.id }], error: null });
    await waitFor(() => expect(mock.toastSuccess).toHaveBeenCalled());
  });
});

describe("fact review, holds and one-at-a-time publishing", () => {
  beforeEach(() => {
    mock.respond.mockImplementation((operation: Operation) => {
      if (operation.table === "categories") return { data: [], error: null };
      if (isCountQuery(operation)) return countFor(operation);
      if (operation.kind === "select")
        return { data: [flagged, held, published], error: null, count: 3 };
      return mutationResult(operation);
    });
  });

  it("flags live articles with contradicted claims in red, with the count", async () => {
    renderManager();
    await screen.findByText(flagged.title);
    const badge = screen.getByText("Needs fact review", {
      selector: "[data-flag='fact-review']",
    });
    expect(badge).toHaveAttribute(
      "title",
      "2 claims the fact-checker marked as contradicted",
    );
    expect(
      screen.queryAllByText("Needs fact review", {
        selector: "[data-flag='fact-review']",
      }),
    ).toHaveLength(1);
  });

  it("shows why a held article isn't live, in plain English", async () => {
    renderManager();
    await screen.findByText(held.title);
    expect(
      screen.getByText(/Held: Quality score 62, needs 85/),
    ).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(
      /held_reason|contradicted_count/,
    );
  });

  it("moves a flagged live article back to draft through the unpublish flow", async () => {
    renderManager();
    fireEvent.click(
      await screen.findByRole("button", {
        name: `Move ${flagged.title} back to draft`,
      }),
    );
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent(/2 claims/);
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Move back to draft" }),
    );
    await waitFor(() => expect(mock.toastSuccess).toHaveBeenCalled());
    const [update] = mutations("update");
    expect(update.payload).toEqual({ status: "draft" });
    expect(update.calls).toEqual(
      expect.arrayContaining([
        { method: "eq", args: ["id", flagged.id] },
        { method: "eq", args: ["status", "published"] },
      ]),
    );
  });

  it("shows review filter chips with counts", async () => {
    renderManager();
    expect(
      await screen.findByRole("button", { name: /Needs fact review\s*2/ }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("button", { name: /Held\s*1/ }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("button", { name: /Ready to publish\s*3/ }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Needs fact review/ }));
    expect(mock.setParams).toHaveBeenCalledWith({ view: "facts" });
  });

  it("filters the list to live articles with contradicted claims", async () => {
    mock.params = new URLSearchParams("view=facts");
    renderManager();
    await screen.findByText(flagged.title);
    const query = listQueries().at(-1)!;
    expect(query.calls).toEqual(
      expect.arrayContaining([
        { method: "eq", args: ["status", "published"] },
        { method: "gt", args: ["contradicted_count", 0] },
      ]),
    );
  });

  it("filters Held and Ready to publish without a server-side gate check", async () => {
    mock.params = new URLSearchParams("view=held");
    renderManager();
    await screen.findByText(held.title);
    expect(listQueries().at(-1)!.calls).toContainEqual({
      method: "not",
      args: ["held_reason", "is", null],
    });
    cleanup();
    mock.params = new URLSearchParams("view=ready");
    renderManager();
    await screen.findByText(held.title);
    expect(listQueries().at(-1)!.calls).toEqual(
      expect.arrayContaining([
        { method: "eq", args: ["status", "draft"] },
        { method: "is", args: ["held_reason", null] },
      ]),
    );
  });

  it("offers no bulk publish or bulk override", async () => {
    renderManager();
    await screen.findByText(held.title);
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.queryByText(/review publishing/i)).toBeNull();
    expect(screen.queryByText(/publish selected/i)).toBeNull();
  });
});
