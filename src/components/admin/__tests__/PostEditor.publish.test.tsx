// @vitest-environment jsdom
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
import { FunctionsFetchError, FunctionsHttpError } from "@supabase/supabase-js";

type Update = { payload: Record<string, unknown>; filters: unknown[][] };
const h = vi.hoisted(() => ({
  toast: vi.fn(),
  navigate: vi.fn(),
  invoke: vi.fn(),
  clear: vi.fn(),
  markSaved: vi.fn(),
  updates: [] as Update[],
  post: null as Record<string, unknown> | null,
  version: 1,
}));

vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: h.toast }) }));
vi.mock("@/lib/withTimeout", () => ({
  safeMutation: (run: () => unknown) => run(),
}));
vi.mock("@/lib/router-compat", () => ({
  useParams: () => ({ id: "post-1" }),
  useNavigate: () => h.navigate,
}));
vi.mock("@/hooks/useAdminPreferences", () => ({
  useAdminPreferences: () => ({
    prefs: { timezone: "UTC" },
    updatePref: vi.fn(),
  }),
}));
vi.mock("@/hooks/useEditorRecovery", () => ({
  useEditorRecovery: () => ({
    message: "Draft protection ready",
    recovery: null,
    dirty: false,
    resolveRecovery: vi.fn(),
    discardRecovery: vi.fn(),
    clear: h.clear,
    markSaved: h.markSaved,
  }),
}));
vi.mock("../EditorialBrief", () => ({ default: () => null }));
vi.mock("../EditorialChecklist", () => ({ default: () => null }));
vi.mock("../EditorPreview", () => ({ default: () => null }));
vi.mock("../PublishReadinessCard", () => ({ default: () => null }));
vi.mock("../PostEditorAiHelper", () => ({ default: () => null }));
vi.mock("../PostEditorAeoPanel", () => ({ default: () => null }));
vi.mock("../PostEditorSeoPanel", () => ({ default: () => null }));
vi.mock("../ImagePickerModal", () => ({ default: () => null }));
vi.mock("../VideoPickerModal", () => ({ default: () => null }));

function chain(table: string) {
  let update: Update | null = null;
  const result = () => {
    if (update)
      return {
        data: { id: "post-1", updated_at: `v${++h.version}` },
        error: null,
      };
    if (table === "posts") return { data: h.post, error: null };
    if (table === "categories" || table === "post_revisions")
      return { data: [], error: null };
    return { data: { id: "seo" }, error: null };
  };
  const c: Record<string, unknown> = {};
  for (const m of ["select", "order", "limit", "abortSignal", "upsert"])
    c[m] = () => c;
  c.eq = (...args: unknown[]) => {
    update?.filters.push(["eq", ...args]);
    return c;
  };
  c.update = (payload: Record<string, unknown>) => {
    update = { payload, filters: [] };
    h.updates.push(update);
    return c;
  };
  c.maybeSingle = async () => result();
  c.single = async () => result();
  c.then = (res: (v: unknown) => unknown) =>
    Promise.resolve(result()).then(res);
  return c;
}
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => chain(table),
    functions: { invoke: h.invoke },
    storage: { from: () => ({}) },
  },
}));

import PostEditor from "../PostEditor";

const FUTURE = "2099-01-01T09:00:00.000Z";
function post(overrides: Record<string, unknown> = {}) {
  return {
    id: "post-1",
    title: "How owners use AI",
    slug: "how-owners-use-ai",
    content: "<p>Body</p>",
    excerpt: "",
    category_id: null,
    status: "draft",
    scheduled_at: null,
    featured_image: null,
    featured_image_alt: null,
    editorial_metadata: {},
    source_citations: [],
    lint_flags: [],
    tldr: null,
    key_takeaways: [],
    faq_items: [],
    held_reason: null,
    held_at: null,
    contradicted_count: 0,
    updated_at: "v1",
    ...overrides,
  };
}
const blocked = {
  data: null,
  error: new FunctionsHttpError(
    new Response(
      JSON.stringify({
        ok: false,
        decision: "blocked",
        failures: ["Not fact-checked yet"],
        reasons: [
          { code: "fact_check_missing", message: "Not fact-checked yet" },
        ],
      }),
      { status: 422 },
    ),
  ),
};
const network = {
  data: null,
  error: new FunctionsFetchError(new TypeError("Failed to fetch")),
};

function renderEditor() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <PostEditor />
    </QueryClientProvider>,
  );
}

async function chooseStatus(value: string) {
  fireEvent.change(await screen.findByLabelText("Status"), {
    target: { value },
  });
}

beforeEach(() => {
  h.version = 1;
  h.updates = [];
  h.clear.mockResolvedValue(true);
  h.markSaved.mockResolvedValue(true);
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("publishing from the editor", () => {
  it("keeps an existing schedule when publishing now fails", async () => {
    h.post = post({ status: "scheduled", scheduled_at: FUTURE });
    h.invoke.mockResolvedValue(network);
    renderEditor();
    await chooseStatus("published");
    fireEvent.click(screen.getByRole("button", { name: "Save & publish" }));
    await waitFor(() =>
      expect(h.toast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Changes saved, but publishing failed",
          variant: "destructive",
        }),
      ),
    );
    const call = h.toast.mock.calls.find(
      ([t]) => t.title === "Changes saved, but publishing failed",
    )!;
    expect(call[0].description).toMatch(/still scheduled/i);
    expect(h.updates).toHaveLength(1);
    expect(h.updates[0].payload).not.toHaveProperty("status");
    expect(h.updates[0].payload).not.toHaveProperty("scheduled_at");
    expect(h.navigate).not.toHaveBeenCalled();
    expect(h.markSaved).toHaveBeenCalled();
  });

  it("opens a one-article override with a typed reason when the gate blocks", async () => {
    h.post = post();
    h.invoke.mockResolvedValueOnce(blocked).mockResolvedValueOnce({
      data: { ok: true, decision: "published_with_override", updated_at: "v9" },
      error: null,
    });
    renderEditor();
    await chooseStatus("published");
    fireEvent.click(screen.getByRole("button", { name: "Save & publish" }));
    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByText("Not fact-checked yet"),
    ).toBeInTheDocument();
    expect(h.updates[0].payload).not.toHaveProperty("status");
    const confirm = within(dialog).getByRole("button", {
      name: "Publish anyway",
    });
    expect(confirm).toBeDisabled();
    const reason = within(dialog).getByLabelText("Reason for overriding");
    fireEvent.change(reason, { target: { value: "too short" } });
    expect(confirm).toBeDisabled();
    fireEvent.change(reason, {
      target: { value: "Checked both sources by hand" },
    });
    expect(confirm).toBeEnabled();
    fireEvent.click(confirm);
    await waitFor(() =>
      expect(h.navigate).toHaveBeenCalledWith("/admin/posts"),
    );
    expect(h.invoke).toHaveBeenLastCalledWith("manual-publish-v2", {
      body: {
        post_id: "post-1",
        mode: "publish",
        override_reason: "Checked both sources by hand",
      },
    });
    expect(h.toast).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Published with override" }),
    );
    expect(h.clear).toHaveBeenCalled();
  });

  it("reports a failed override and keeps the dialog open", async () => {
    h.post = post();
    h.invoke.mockResolvedValueOnce(blocked).mockResolvedValueOnce(network);
    renderEditor();
    await chooseStatus("published");
    fireEvent.click(screen.getByRole("button", { name: "Save & publish" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Reason for overriding"), {
      target: { value: "Checked both sources by hand" },
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Publish anyway" }),
    );
    await waitFor(() =>
      expect(h.toast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Publish failed",
          variant: "destructive",
        }),
      ),
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Publish anyway",
      }),
    ).toBeEnabled();
    expect(h.navigate).not.toHaveBeenCalled();
  });

  it("shows the server's reason error inside the override dialog", async () => {
    h.post = post();
    h.invoke.mockResolvedValueOnce(blocked).mockResolvedValueOnce({
      data: null,
      error: new FunctionsHttpError(
        new Response(
          JSON.stringify({
            ok: false,
            decision: "blocked",
            failures: ["Not fact-checked yet"],
            reason_error: "Override reason must be at least 10 characters",
          }),
          { status: 422 },
        ),
      ),
    });
    renderEditor();
    await chooseStatus("published");
    fireEvent.click(screen.getByRole("button", { name: "Save & publish" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Reason for overriding"), {
      target: { value: "Checked both sources by hand" },
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Publish anyway" }),
    );
    expect(
      await within(dialog).findByText(
        "Override reason must be at least 10 characters",
      ),
    ).toBeInTheDocument();
  });

  it("schedules through the publish gate instead of writing the status directly", async () => {
    h.post = post();
    h.invoke.mockResolvedValue({
      data: {
        ok: true,
        decision: "scheduled",
        updated_at: "v9",
        scheduled_at: FUTURE,
      },
      error: null,
    });
    renderEditor();
    await chooseStatus("scheduled");
    fireEvent.change(await screen.findByLabelText("Publish date and time"), {
      target: { value: "2099-01-01T09:00" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save & schedule" }));
    await waitFor(() =>
      expect(h.invoke).toHaveBeenCalledWith("manual-publish-v2", {
        body: { post_id: "post-1", mode: "schedule", scheduled_at: FUTURE },
      }),
    );
    expect(h.updates[0].payload).not.toHaveProperty("status");
    expect(h.updates[0].payload).not.toHaveProperty("scheduled_at");
    await waitFor(() =>
      expect(h.navigate).toHaveBeenCalledWith("/admin/posts"),
    );
  });

  it("uses the version returned by publish for the next save (no false conflict)", async () => {
    h.post = post();
    h.clear.mockResolvedValue(false);
    h.invoke.mockResolvedValue({
      data: { ok: true, decision: "published", updated_at: "v-published" },
      error: null,
    });
    renderEditor();
    await chooseStatus("published");
    fireEvent.click(screen.getByRole("button", { name: "Save & publish" }));
    await waitFor(() =>
      expect(h.toast).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Published" }),
      ),
    );
    expect(h.navigate).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole("button", { name: "Save" }));
    await waitFor(() => expect(h.updates).toHaveLength(2));
    expect(h.updates[1].filters).toContainEqual([
      "eq",
      "updated_at",
      "v-published",
    ]);
    expect(h.updates[1].payload.status).toBe("published");
    expect(h.invoke).toHaveBeenCalledTimes(1);
  });
});
