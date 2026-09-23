// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const h = vi.hoisted(() => ({
  toast: vi.fn(),
  navigate: vi.fn(),
  updates: [] as Record<string, unknown>[],
  post: null as Record<string, unknown> | null,
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
    clear: async () => true,
  }),
}));
vi.mock("../EditorialBrief", () => ({ default: () => null }));
vi.mock("../EditorialChecklist", () => ({ default: () => null }));
vi.mock("../EditorPreview", () => ({ default: () => null }));
vi.mock("../PostEditorSidebar", () => ({ default: () => null }));
vi.mock("../PostEditorAiHelper", () => ({ default: () => null }));
vi.mock("../PostEditorAeoPanel", () => ({ default: () => null }));
vi.mock("../PostEditorSeoPanel", () => ({ default: () => null }));
vi.mock("../ImagePickerModal", () => ({ default: () => null }));
vi.mock("../VideoPickerModal", () => ({ default: () => null }));

/** Chainable PostgREST stand-in: every builder method returns the chain. */
function chain(table: string) {
  let payload: Record<string, unknown> | null = null;
  const result = () => {
    if (payload)
      return { data: { id: "post-1", updated_at: "v2" }, error: null };
    if (table === "posts") return { data: h.post, error: null };
    if (table === "categories" || table === "post_revisions")
      return { data: [], error: null };
    return { data: null, error: null };
  };
  const c: Record<string, unknown> = {};
  for (const m of ["select", "eq", "order", "limit", "abortSignal", "upsert"])
    c[m] = () => c;
  c.update = (p: Record<string, unknown>) => {
    payload = p;
    h.updates.push(p);
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
    functions: { invoke: vi.fn() },
  },
}));

import PostEditor from "../PostEditor";

function basePost(content: string) {
  return {
    id: "post-1",
    title: "Build your next business tool",
    slug: "build-your-next-business-tool",
    content,
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
    updated_at: "v1",
  };
}

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

async function editorElement() {
  await waitFor(() =>
    expect(document.querySelector(".ProseMirror")).toBeTruthy(),
  );
  return document.querySelector(".ProseMirror") as HTMLElement;
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  h.updates = [];
  h.post = null;
});

const TABLE_ARTICLE =
  "<p>Compare the options.</p><table><thead><tr><th>Tool</th><th>Price</th></tr></thead><tbody><tr><td>Alpha</td><td>$10</td></tr></tbody></table><h4>Fine print</h4>";

describe("post editor body protection", () => {
  it("does not rewrite the stored body when only the title is changed", async () => {
    h.post = basePost(TABLE_ARTICLE);
    renderEditor();
    const pm = await editorElement();
    await waitFor(() => expect(pm.querySelector("table")).toBeTruthy());
    expect(screen.queryByText(/formatting the editor can't keep/i)).toBeNull();
    fireEvent.change(screen.getByLabelText("Post title"), {
      target: { value: "Build your next business tool, fixed" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(h.updates.length).toBe(1));
    expect(h.updates[0].title).toBe("Build your next business tool, fixed");
    expect(h.updates[0].content).toBe(TABLE_ARTICLE);
  });

  it("locks the body and leaves it out of the save when loading would lose markup", async () => {
    h.post = basePost(
      "<p>Intro</p><details><summary>More detail</summary><p>Hidden body</p></details>",
    );
    renderEditor();
    const pm = await editorElement();
    const alert = await screen.findByText(/formatting the editor can't keep/i);
    expect(alert.textContent).toContain("<details>");
    await waitFor(() =>
      expect(pm.getAttribute("contenteditable")).toBe("false"),
    );
    expect(screen.queryByTitle("Bold")).toBeNull();
    fireEvent.change(screen.getByLabelText("Post title"), {
      target: { value: "New title" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(h.updates.length).toBe(1));
    expect(h.updates[0].title).toBe("New title");
    expect(h.updates[0]).not.toHaveProperty("content");
    expect(h.updates[0]).not.toHaveProperty("reading_time");
  });
});
