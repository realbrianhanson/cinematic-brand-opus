// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase, type FakeState } from "./fakeSupabaseQuery";
const h = vi.hoisted(() => ({
  state: null as unknown as FakeState,
  error: null as unknown,
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => createFakeSupabase(h.state).from(table),
  },
}));
import SavedVersionHistory from "../SavedVersionHistory";
const snapshot = {
  id: "page-one",
  title: "Previous title",
  status: "published",
  slug: "old-url",
  content_json: { intro: "Historical <script>alert(1)</script> text" },
  seo_meta: {
    title: "Old SEO",
    sources: ["https://example.com/research", "javascript:alert(1)"],
    custom: { preserve: true },
  },
  quality_score: 99,
  publish_override: true,
  updated_at: "2026-01-01T00:00:00Z",
};
const row = {
  id: "revision-one",
  page_id: "page-one",
  snapshot,
  actor_id: null,
  change_source: "system",
  created_at: "2026-09-25T00:00:00Z",
};
const renderHistory = (extra = {}) => {
  const onLoad = vi.fn();
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <QueryClientProvider client={qc}>
      <SavedVersionHistory
        kind="resource"
        documentId="page-one"
        current={{
          title: "Current title",
          content_json: { intro: "Current body" },
          seo_meta: {},
        }}
        onLoad={onLoad}
        {...extra}
      />
    </QueryClientProvider>,
  );
  return { ...view, onLoad };
};
beforeEach(() => {
  h.error = null;
  h.state = {
    ops: [],
    respond: () => ({ data: h.error ? null : [row], error: h.error }),
  };
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function chooseVersion() {
  fireEvent.click(screen.getByRole("button", { name: "Saved versions" }));
  fireEvent.change(
    await screen.findByRole("combobox", { name: "Choose a saved version" }),
    { target: { value: row.id } },
  );
}
describe("private saved version history", () => {
  it("loads history only on request and scopes the bounded ordered query to this document", async () => {
    const view = renderHistory();
    expect(h.state.ops).toHaveLength(0);
    await chooseVersion();
    expect(h.state.ops[0]).toMatchObject({
      table: "generated_page_revisions",
      action: "select",
    });
    expect(h.state.ops[0].filters).toContainEqual([
      "eq",
      "page_id",
      "page-one",
    ]);
    expect(h.state.ops[0].filters).toContainEqual(["limit", 20]);
    expect(view.onLoad).not.toHaveBeenCalled();
    expect(
      screen.getByText(/not fact-checks or review approvals/),
    ).toBeTruthy();
  });
  it("compares escaped text and exposes only safe source links", async () => {
    const view = renderHistory();
    await chooseVersion();
    expect(view.container.querySelector("script")).toBeNull();
    expect(screen.getByText(/Historical <script>/)).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: "https://example.com/research" })
        .getAttribute("rel"),
    ).toBe("noopener noreferrer");
    expect(screen.queryByRole("link", { name: /javascript/ })).toBeNull();
  });
  it("requires confirmation and loads only editable title/content/full SEO without save or authority fields", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const view = renderHistory();
    await chooseVersion();
    fireEvent.click(
      screen.getByRole("button", { name: "Load version into editor" }),
    );
    expect(view.onLoad).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    fireEvent.click(
      screen.getByRole("button", { name: "Load version into editor" }),
    );
    expect(view.onLoad).toHaveBeenCalledExactlyOnceWith({
      title: snapshot.title,
      content: snapshot.content_json,
      seoMeta: snapshot.seo_meta,
    });
    expect(h.state.ops.every((op) => op.action === "select")).toBe(true);
    expect(
      screen.getByText(/Version loaded into the working draft/),
    ).toBeTruthy();
  });
  it("refuses a mismatched document snapshot and permits retrying a history read failure", async () => {
    h.error = new Error("Unavailable");
    renderHistory();
    fireEvent.click(screen.getByRole("button", { name: "Saved versions" }));
    await screen.findByRole("alert");
    h.error = null;
    h.state.respond = () => ({
      data: [{ ...row, snapshot: { ...snapshot, id: "other-document" } }],
      error: null,
    });
    fireEvent.click(screen.getByRole("button", { name: "Retry history" }));
    fireEvent.change(await screen.findByRole("combobox"), {
      target: { value: row.id },
    });
    expect(
      (
        screen.getByRole("button", {
          name: "Load version into editor",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });
  it("downloads the selected snapshot only when explicitly requested", async () => {
    const create = vi.fn(() => "blob:history");
    vi.stubGlobal(
      "URL",
      Object.assign(class extends URL {}, {
        createObjectURL: create,
        revokeObjectURL: vi.fn(),
      }),
    );
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});
    renderHistory();
    await chooseVersion();
    expect(create).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("button", { name: "Download version JSON" }),
    );
    await waitFor(() => expect(click).toHaveBeenCalledOnce());
    expect(create).toHaveBeenCalledWith(expect.any(Blob));
  });
});
