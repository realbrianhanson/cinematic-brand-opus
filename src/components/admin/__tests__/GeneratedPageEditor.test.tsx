// @vitest-environment jsdom
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
  navigate: vi.fn(),
  invoke: vi.fn(),
  state: null as unknown as FakeState,
  page: null as Record<string, unknown> | null,
  updateError: null as unknown,
  updateMissing: false,
  writeSequence: 0,
  history: [] as Record<string, unknown>[],
  blocker: { shouldBlockFn: () => false, enableBeforeUnload: false },
}));
vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useBlocker: (options: typeof h.blocker) => {
    h.blocker = options;
  },
}));

vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: h.toast }) }));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "resource-admin" } }),
}));
vi.mock("@/lib/withTimeout", () => ({
  safeMutation: (run: () => unknown) => run(),
}));
vi.mock("@/lib/router-compat", () => ({
  useParams: () => ({ id: "p1" }),
  useNavigate: () => h.navigate,
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) =>
      createFakeSupabase({
        get ops() {
          return h.state.ops;
        },
        respond: (op: FakeOp): FakeResult => {
          if (op.table === "generated_page_revisions")
            return { data: h.history, error: null };
          if (op.table === "generated_pages" && op.action === "select")
            return { data: h.page, error: null };
          if (op.action === "update") {
            const expected = op.filters.find(
              ([method, column]) => method === "eq" && column === "updated_at",
            )?.[2];
            if (
              h.updateMissing ||
              h.updateError ||
              expected !== h.page?.updated_at
            )
              return { data: null, error: h.updateError };
            h.writeSequence += 1;
            h.page = {
              ...h.page,
              ...(op.payload as Record<string, unknown>),
              updated_at: `2026-09-25T00:00:${String(h.writeSequence).padStart(2, "0")}Z`,
            };
            return { data: h.page, error: null };
          }
          return { data: null, error: null };
        },
      }).from(table),
    functions: { invoke: (...args: unknown[]) => h.invoke(...args) },
    auth: {
      getUser: async () => ({ data: { user: { id: "admin-1" } } }),
      getSession: async () => ({ data: { session: null }, error: null }),
    },
  },
}));

import GeneratedPageEditor from "../GeneratedPageEditor";

const content = {
  title: "12 Best AI Tools in 2026",
  intro: "These tools save time. Most take a day to set up.",
  sections: [
    {
      section_title: "Booking",
      items: [{ name: "Calendly", description: "Links" }],
    },
  ],
  frequently_asked_questions: [{ question: "Cost?", answer: "Free tier." }],
};

const basePage = (extra: Record<string, unknown> = {}) => ({
  id: "p1",
  title: "12 Best AI Tools in 2026",
  slug: "12-best-ai-tools-in-2026",
  status: "draft",
  content_json: content,
  seo_meta: { title: "Meta", description: "Desc", keywords: ["a", "b", "c"] },
  quality_score: 82,
  generation_model: "m",
  generation_cost: 0.07,
  created_at: "2026-09-01T00:00:00Z",
  updated_at: "2026-09-01T00:00:00Z",
  last_refreshed: null,
  refresh_count: 0,
  niches: { name: "Coaches", slug: "coaches" },
  content_schemas: { name: "Tool Roundups", slug: "tool-roundups" },
  ...extra,
});

const renderEditor = () => {
  h.state = { ops: [], respond: () => ({ data: null, error: null }) };
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <QueryClientProvider client={qc}>
      <GeneratedPageEditor />
    </QueryClientProvider>,
  );
  return { ...view, qc };
};

const updates = () =>
  h.state.ops
    .filter((op) => op.table === "generated_pages" && op.action === "update")
    .map((op) => op.payload as Record<string, unknown>);

const contentBox = () =>
  screen.getByLabelText("Content JSON") as HTMLTextAreaElement;

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.clearAllMocks();
  h.updateError = null;
  h.updateMissing = false;
  h.writeSequence = 0;
  h.history = [];
});

describe("GeneratedPageEditor", () => {
  it("loads historical content and complete source metadata into an unsaved draft without restoring authority fields", async () => {
    h.page = basePage();
    h.history = [
      {
        id: "old-version",
        page_id: "p1",
        created_at: "2026-09-24T00:00:00Z",
        change_source: "system",
        actor_id: null,
        snapshot: {
          ...basePage(),
          title: "Earlier useful resource",
          slug: "old-slug",
          status: "published",
          quality_score: 99,
          publish_override: true,
          content_json: { ...content, intro: "The earlier version's content" },
          seo_meta: {
            title: "Old SEO",
            description: "Old description",
            sources: ["https://example.com/original"],
            custom_source_note: "Preserve this context",
          },
        },
      },
    ];
    h.invoke.mockResolvedValue({
      data: { score: 82, issues: [] },
      error: null,
    });
    vi.spyOn(window, "confirm").mockReturnValue(true);
    renderEditor();
    await screen.findByDisplayValue("12 Best AI Tools in 2026");
    fireEvent.click(screen.getByRole("button", { name: "Saved versions" }));
    fireEvent.change(
      await screen.findByRole("combobox", { name: "Choose a saved version" }),
      { target: { value: "old-version" } },
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Load version into editor" }),
    );
    expect(screen.getByLabelText("Title")).toHaveValue(
      "Earlier useful resource",
    );
    expect(screen.getByLabelText("Status")).toHaveValue("draft");
    expect(screen.getByLabelText("URL slug")).toHaveValue(
      "12-best-ai-tools-in-2026",
    );
    expect(updates()).toHaveLength(0);
    expect(h.blocker.enableBeforeUnload).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
    await waitFor(() => expect(updates().length).toBeGreaterThan(0));
    expect(updates()[0].seo_meta).toMatchObject({
      sources: ["https://example.com/original"],
      custom_source_note: "Preserve this context",
    });
    expect(updates()[0]).not.toHaveProperty("quality_score");
    expect(updates()[0]).not.toHaveProperty("publish_override");
    expect(updates()[0]).not.toHaveProperty("id");
  });
  it("preserves source references and unknown SEO keys on an ordinary save", async () => {
    h.page = basePage({
      seo_meta: {
        title: "Meta",
        description: "Desc",
        sources: [{ url: "https://example.com/source" }],
        custom_provenance: { captured: "2026-09-01" },
      },
    });
    h.invoke.mockResolvedValue({
      data: { score: 82, issues: [] },
      error: null,
    });
    renderEditor();
    await screen.findByDisplayValue("12 Best AI Tools in 2026");
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
    await waitFor(() => expect(updates().length).toBeGreaterThan(0));
    expect(updates()[0].seo_meta).toMatchObject({
      sources: [{ url: "https://example.com/source" }],
      custom_provenance: { captured: "2026-09-01" },
    });
  });
  it("restores an unsaved resource only on request and keeps the saved-version guard", async () => {
    h.page = basePage();
    const first = renderEditor();
    await screen.findByDisplayValue("12 Best AI Tools in 2026");
    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "A recovered resource title" },
    });
    await waitFor(() => expect(localStorage.length).toBe(1));
    first.unmount();
    renderEditor();
    const restore = await screen.findByRole("button", {
      name: "Restore working copy",
    });
    expect(screen.getByLabelText("Title")).toHaveValue(
      "12 Best AI Tools in 2026",
    );
    fireEvent.click(restore);
    expect(screen.getByLabelText("Title")).toHaveValue(
      "A recovered resource title",
    );
    expect(h.blocker.enableBeforeUnload).toBe(true);
    expect(updates()).toHaveLength(0);
    expect(h.invoke).not.toHaveBeenCalled();
  });
  it("offers comparison instead of restoring an old backup over a newer saved resource", async () => {
    h.page = basePage();
    const first = renderEditor();
    await screen.findByDisplayValue("12 Best AI Tools in 2026");
    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "Old draft title" },
    });
    await waitFor(() => expect(localStorage.length).toBe(1));
    first.unmount();
    h.page = basePage({
      title: "Newer saved resource",
      updated_at: "2026-09-25T15:00:00Z",
    });
    renderEditor();
    await screen.findByRole("button", { name: "Download working copy" });
    expect(
      screen.queryByRole("button", { name: "Restore working copy" }),
    ).toBeNull();
    expect(screen.getByLabelText("Title")).toHaveValue("Newer saved resource");
    expect(updates()).toHaveLength(0);
  });
  it("keeps changed resource content when navigation is cancelled", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    h.page = basePage();
    renderEditor();
    await screen.findByDisplayValue("12 Best AI Tools in 2026");
    expect(h.blocker.shouldBlockFn()).toBe(false);
    const unfinished = JSON.stringify({
      ...content,
      intro: "Unsaved resource edit",
    });
    fireEvent.change(contentBox(), { target: { value: unfinished } });
    expect(h.blocker.shouldBlockFn()).toBe(true);
    expect(contentBox()).toHaveValue(unfinished);
    expect(h.blocker.enableBeforeUnload).toBe(true);
    confirm.mockRestore();
  });
  it("refuses a stale draft save after another editor publishes and the query refetches", async () => {
    h.page = basePage();
    const { qc } = renderEditor();
    await screen.findByDisplayValue("12 Best AI Tools in 2026");
    const unsaved = JSON.stringify({
      ...content,
      intro: "My unfinished draft",
    });
    fireEvent.change(contentBox(), { target: { value: unsaved } });
    h.page = basePage({
      status: "published",
      updated_at: "2026-09-25T02:00:00Z",
      content_json: { ...content, intro: "Approved live copy" },
    });
    await act(async () => {
      await qc.invalidateQueries({ queryKey: ["admin-generated-page", "p1"] });
    });
    expect(contentBox()).toHaveValue(unsaved);
    expect(screen.getByLabelText("Status")).toHaveValue("draft");
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
    await waitFor(() =>
      expect(h.toast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Save failed",
          description: expect.stringMatching(/saved version changed/),
        }),
      ),
    );
    expect(updates()).toHaveLength(0);
    expect(h.page.status).toBe("published");
    expect(h.page.content_json).toEqual({
      ...content,
      intro: "Approved live copy",
    });
    expect(h.invoke).not.toHaveBeenCalled();
  });

  it("uses an atomic version predicate even when the other editor's change has not refetched", async () => {
    h.page = basePage();
    renderEditor();
    await screen.findByDisplayValue("12 Best AI Tools in 2026");
    h.page = basePage({
      status: "published",
      updated_at: "2026-09-25T02:00:00Z",
    });
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
    await waitFor(() =>
      expect(h.toast).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Save failed" }),
      ),
    );
    const attempted = h.state.ops.find((op) => op.action === "update");
    expect(attempted?.filters).toContainEqual([
      "eq",
      "updated_at",
      "2026-09-01T00:00:00Z",
    ]);
    expect(h.page.status).toBe("published");
    expect(h.page.updated_at).toBe("2026-09-25T02:00:00Z");
    expect(h.invoke).not.toHaveBeenCalled();
  });

  it("advances its baseline after saving and server scoring before publishing", async () => {
    h.page = basePage();
    h.invoke.mockImplementation(async (name: string) => {
      if (name === "score-content-quality")
        h.page = {
          ...h.page,
          quality_score: 91,
          updated_at: "2026-09-25T00:00:30Z",
        };
      return { data: { score: 91, issues: [] }, error: null };
    });
    renderEditor();
    await screen.findByDisplayValue("12 Best AI Tools in 2026");
    fireEvent.change(screen.getByLabelText("Status"), {
      target: { value: "published" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
    await waitFor(() =>
      expect(h.navigate).toHaveBeenCalledWith("/admin/pages"),
    );
    const writes = h.state.ops.filter((op) => op.action === "update");
    expect(writes).toHaveLength(2);
    expect(writes[0].filters).toContainEqual([
      "eq",
      "updated_at",
      "2026-09-01T00:00:00Z",
    ]);
    expect(writes[1].filters).toContainEqual([
      "eq",
      "updated_at",
      "2026-09-25T00:00:30Z",
    ]);
    expect(h.page.status).toBe("published");
  });

  it("does not adopt another editor's content change as its post-score baseline", async () => {
    h.page = basePage();
    h.invoke.mockImplementation(async () => {
      h.page = {
        ...h.page,
        title: "A different editor's headline",
        updated_at: "2026-09-25T02:00:00Z",
      };
      return { data: { score: 91, issues: [] }, error: null };
    });
    renderEditor();
    await screen.findByDisplayValue("12 Best AI Tools in 2026");
    fireEvent.change(screen.getByLabelText("Status"), {
      target: { value: "published" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
    await waitFor(() =>
      expect(h.toast).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Save failed" }),
      ),
    );
    expect(updates()).toHaveLength(1);
    expect(h.page.title).toBe("A different editor's headline");
    expect(h.page.status).toBe("draft");
    expect(h.navigate).not.toHaveBeenCalled();
  });

  it("refuses an override when the saved draft changes while the review dialog is open", async () => {
    h.page = basePage();
    h.invoke.mockResolvedValue({
      data: { score: 60, issues: ["Review needed"] },
      error: null,
    });
    const { qc } = renderEditor();
    await screen.findByDisplayValue("12 Best AI Tools in 2026");
    fireEvent.change(screen.getByLabelText("Status"), {
      target: { value: "published" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
    const dialog = await screen.findByRole("dialog");
    h.page = {
      ...h.page,
      status: "archived",
      updated_at: "2026-09-25T02:00:00Z",
    };
    await act(async () => {
      await qc.invalidateQueries({ queryKey: ["admin-generated-page", "p1"] });
    });
    fireEvent.change(within(dialog).getByLabelText(/Reason/), {
      target: { value: "Manually checked this complete resource" },
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Publish anyway" }),
    );
    await waitFor(() =>
      expect(h.toast).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Save failed" }),
      ),
    );
    expect(updates()).toHaveLength(1);
    expect(h.page.status).toBe("archived");
  });

  it("loads a new baseline only after the editor explicitly discards local edits", async () => {
    h.page = basePage();
    const { qc } = renderEditor();
    await screen.findByDisplayValue("12 Best AI Tools in 2026");
    h.page = basePage({
      status: "published",
      updated_at: "2026-09-25T02:00:00Z",
      title: "New saved headline",
    });
    await act(async () => {
      await qc.invalidateQueries({ queryKey: ["admin-generated-page", "p1"] });
    });
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    fireEvent.click(
      await screen.findByRole("button", { name: "Load latest saved version" }),
    );
    expect(
      await screen.findByDisplayValue("New saved headline"),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Status")).toHaveValue("published");
    expect(
      screen.queryByText(/This resource changed in another window/),
    ).not.toBeInTheDocument();
    confirm.mockRestore();
  });

  it("preserves unsaved content when a newer stored version arrives in the background", async () => {
    h.page = basePage();
    const { qc } = renderEditor();
    await screen.findByDisplayValue("12 Best AI Tools in 2026");
    const draft = JSON.stringify(
      { ...content, intro: "My unsaved research" },
      null,
      2,
    );
    fireEvent.change(contentBox(), { target: { value: draft } });
    act(() =>
      qc.setQueryData(
        ["admin-generated-page", "p1"],
        basePage({
          updated_at: "2026-09-25T00:00:00Z",
          content_json: { ...content, intro: "Another editor's change" },
        }),
      ),
    );
    expect(contentBox()).toHaveValue(draft);
  });

  it("does not report success when a resource disappears before saving", async () => {
    h.page = basePage();
    h.updateMissing = true;
    renderEditor();
    await screen.findByDisplayValue("12 Best AI Tools in 2026");
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
    await waitFor(() =>
      expect(h.toast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Save failed",
          description: expect.stringMatching(/not saved/),
        }),
      ),
    );
    expect(h.navigate).not.toHaveBeenCalled();
    expect(h.invoke).not.toHaveBeenCalled();
  });
  it("shows the quality score read-only", async () => {
    h.page = basePage();
    renderEditor();
    await screen.findByDisplayValue("12 Best AI Tools in 2026");
    expect(screen.queryByRole("spinbutton")).toBeNull();
    expect(screen.getByTestId("quality-score")).toHaveTextContent("82");
  });

  it("counts frequently_asked_questions for the FAQ checklist item", async () => {
    h.page = basePage();
    renderEditor();
    const item = await screen.findByText("Content has FAQ items");
    expect(item.closest("[data-done]")?.getAttribute("data-done")).toBe("true");
  });

  it("refuses to save content with the wrong shape", async () => {
    h.page = basePage();
    renderEditor();
    await screen.findByDisplayValue("12 Best AI Tools in 2026");
    fireEvent.change(contentBox(), {
      target: {
        value: JSON.stringify({ ...content, sections: { booking: [] } }),
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/sections/);
    expect(updates()).toHaveLength(0);
  });

  it("saves an edited title and slug on a draft and re-scores it", async () => {
    h.page = basePage();
    h.invoke.mockResolvedValue({
      data: { score: 88, issues: [] },
      error: null,
    });
    renderEditor();
    const title = await screen.findByDisplayValue("12 Best AI Tools in 2026");
    fireEvent.change(title, {
      target: { value: "AI Booking Tools for Coaches" },
    });
    fireEvent.change(screen.getByLabelText("URL slug"), {
      target: { value: "ai-booking-tools-for-coaches" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
    await waitFor(() => expect(updates()).toHaveLength(1));
    const payload = updates()[0];
    expect(payload).toMatchObject({
      title: "AI Booking Tools for Coaches",
      slug: "ai-booking-tools-for-coaches",
      status: "draft",
    });
    expect(payload).not.toHaveProperty("quality_score");
    expect((payload.content_json as { title: string }).title).toBe(
      "AI Booking Tools for Coaches",
    );
    await waitFor(() =>
      expect(h.invoke).toHaveBeenCalledWith("score-content-quality", {
        body: { page_id: "p1" },
      }),
    );
    await waitFor(() =>
      expect(h.navigate).toHaveBeenCalledWith("/admin/pages"),
    );
  });

  it("locks the slug once a page is published", async () => {
    h.page = basePage({ status: "published" });
    renderEditor();
    await screen.findByDisplayValue("12 Best AI Tools in 2026");
    expect(screen.getByLabelText("URL slug")).toHaveAttribute("readonly");
  });

  it("publishes only after the server score passes", async () => {
    h.page = basePage();
    h.invoke.mockResolvedValue({
      data: { score: 91, issues: [] },
      error: null,
    });
    renderEditor();
    await screen.findByDisplayValue("12 Best AI Tools in 2026");
    fireEvent.change(screen.getByLabelText("Status"), {
      target: { value: "published" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
    await waitFor(() => expect(updates()).toHaveLength(2));
    expect(updates()[0]).not.toHaveProperty("status");
    expect(updates()[1]).toMatchObject({ status: "published" });
  });

  it("saves as draft and asks for an override reason below 75", async () => {
    h.page = basePage();
    h.invoke.mockResolvedValue({
      data: { score: 60, issues: ["Fewer than 3 FAQ items"] },
      error: null,
    });
    renderEditor();
    await screen.findByDisplayValue("12 Best AI Tools in 2026");
    fireEvent.change(screen.getByLabelText("Status"), {
      target: { value: "published" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
    const dialog = await screen.findByRole("dialog");
    expect(updates()).toHaveLength(1);
    expect(updates()[0]).not.toHaveProperty("status");
    const publish = within(dialog).getByRole("button", {
      name: "Publish anyway",
    });
    expect(publish).toBeDisabled();
    fireEvent.change(within(dialog).getByLabelText(/Reason/), {
      target: { value: "Reviewed by hand, FAQ lives on the pillar" },
    });
    fireEvent.click(publish);
    await waitFor(() => expect(updates()).toHaveLength(2));
    expect(updates()[1]).toMatchObject({
      status: "published",
      publish_override: true,
      publish_override_reason: "Reviewed by hand, FAQ lives on the pillar",
      publish_override_by: "admin-1",
    });
  });

  it("asks before Regenerate and uses the per-page refresh", async () => {
    h.page = basePage();
    h.invoke.mockResolvedValue({ data: { refreshed: 1 }, error: null });
    renderEditor();
    await screen.findByDisplayValue("12 Best AI Tools in 2026");
    fireEvent.click(screen.getByRole("button", { name: "Regenerate Content" }));
    expect(h.invoke).not.toHaveBeenCalled();
    const dialog = screen.getByRole("dialog");
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Rewrite content" }),
    );
    await waitFor(() =>
      expect(h.invoke).toHaveBeenCalledWith("refresh-stale-content", {
        body: { page_id: "p1" },
      }),
    );
    await waitFor(() =>
      expect(h.toast).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Content refreshed" }),
      ),
    );
  });
});
