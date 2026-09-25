// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Editor } from "@tiptap/react";

const storedBody =
  "<h2>Why this guide matters</h2><p>" +
  "Stored guide body with practical steps for owners. ".repeat(6) +
  "</p>";

const h = vi.hoisted(() => ({
  toast: vi.fn(),
  navigate: vi.fn(),
  update: vi.fn(),
  insert: vi.fn(),
  params: { id: "pillar-1" } as { id?: string },
  pillar: null as Record<string, unknown> | null,
  updatedRows: [{ id: "pillar-1", updated_at: "2026-09-25T10:00:01Z" }] as {
    id: string;
    updated_at: string;
  }[],
  filters: [] as unknown[][],
  blocker: { shouldBlockFn: () => false, enableBeforeUnload: false },
  writeWait: undefined as Promise<void> | undefined,
  upload: vi.fn(),
  publicUrl: vi.fn((path: string) => ({
    data: { publicUrl: `https://images.example/${path}` },
  })),
}));
vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useBlocker: (options: typeof h.blocker) => {
    h.blocker = options;
  },
}));

const basePillar = () => ({
  id: "pillar-1",
  title: "AI for Small Business",
  slug: "ai-for-small-business",
  status: "published",
  niche_id: null,
  content: storedBody,
  published_at: "2026-09-01T00:00:00.000Z",
  updated_at: "2026-09-25T10:00:00Z",
  seo_meta: {
    meta_title: "Stored meta title",
    meta_description: "Stored meta description for search results",
    faqs: [{ q: "Keep me", a: "Unknown keys survive" }],
  },
});

vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: h.toast }) }));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "guide-admin" } }),
}));
vi.mock("@/lib/withTimeout", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  safeMutation: (run: () => unknown) => run(),
}));
vi.mock("@/lib/router-compat", () => ({
  useParams: () => h.params,
  useNavigate: () => h.navigate,
}));
vi.mock("../ImagePickerModal", () => ({ default: () => null }));
vi.mock("../VideoPickerModal", () => ({ default: () => null }));
vi.mock("@/integrations/supabase/client", () => {
  const list = async () => ({ data: [], error: null });
  return {
    supabase: {
      from: (table: string) => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: table === "pillar_pages" ? h.pillar : null,
              error: null,
            }),
            order: list,
          }),
          order: list,
        }),
        update: (payload: unknown) => {
          h.update(payload);
          const chain = {
            eq: (...filter: unknown[]) => {
              h.filters.push(filter);
              return chain;
            },
            select: () => ({
              maybeSingle: async () => {
                await h.writeWait;
                return { data: h.updatedRows[0] ?? null, error: null };
              },
            }),
          };
          return chain;
        },
        insert: async (payload: unknown) => {
          h.insert(payload);
          await h.writeWait;
          return { error: null };
        },
      }),
      storage: {
        from: () => ({ upload: h.upload, getPublicUrl: h.publicUrl }),
      },
    },
  };
});

import PillarPageEditor, {
  GUIDE_IMAGE_UPLOAD_TIMEOUT_MS,
} from "../PillarPageEditor";

const renderEditor = () => {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return {
    ...render(
      <QueryClientProvider client={qc}>
        <PillarPageEditor />
      </QueryClientProvider>,
    ),
    qc,
  };
};

const editorFrom = (container: HTMLElement) =>
  (container.querySelector(".ProseMirror") as unknown as { editor?: Editor })
    ?.editor ?? null;

const saveButton = () =>
  screen.getByRole("button", { name: "Save" }) as HTMLButtonElement;

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.useRealTimers();
  vi.clearAllMocks();
  vi.restoreAllMocks();
  h.params = { id: "pillar-1" };
  h.pillar = basePillar();
  h.updatedRows = [{ id: "pillar-1", updated_at: "2026-09-25T10:00:01Z" }];
  h.filters = [];
  h.writeWait = undefined;
  h.upload.mockReset();
});
h.pillar = basePillar();

describe("topic guide editor", () => {
  it("clears the old editor body when the latest saved guide is empty, then saves the empty body", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const { container, qc } = renderEditor();
    await waitFor(() => expect(saveButton().disabled).toBe(false));
    expect(editorFrom(container)?.getText()).toContain("Stored guide body");
    h.pillar = {
      ...basePillar(),
      content: "",
      updated_at: "2026-09-25T10:00:02Z",
    };
    act(() => qc.setQueryData(["admin-pillar", "pillar-1"], h.pillar));
    fireEvent.click(
      await screen.findByRole("button", { name: "Load latest saved guide" }),
    );
    await waitFor(() => expect(editorFrom(container)?.getText()).toBe(""));
    fireEvent.click(saveButton());
    await waitFor(() => expect(h.update).toHaveBeenCalledTimes(1));
    expect(h.update.mock.calls[0][0]).toMatchObject({ content: "<p></p>" });
    expect(h.filters).toContainEqual(["updated_at", "2026-09-25T10:00:02Z"]);
  });

  it("rebases crash recovery after explicitly loading the latest saved guide", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const first = renderEditor();
    await waitFor(() => expect(saveButton().disabled).toBe(false));
    fireEvent.change(screen.getByDisplayValue("AI for Small Business"), {
      target: { value: "Unsaved copy before loading latest" },
    });
    await waitFor(() => expect(localStorage.length).toBe(1));
    const oldBackupKey = localStorage.key(0)!;
    const oldBackup = localStorage.getItem(oldBackupKey);
    h.pillar = {
      ...basePillar(),
      title: "Newly saved guide title",
      content: "<p>Newly saved body.</p>",
      updated_at: "2026-09-25T10:00:02Z",
    };
    act(() => first.qc.setQueryData(["admin-pillar", "pillar-1"], h.pillar));
    fireEvent.click(
      await screen.findByRole("button", { name: "Load latest saved guide" }),
    );
    const title = await screen.findByDisplayValue("Newly saved guide title");
    await waitFor(() => expect(h.blocker.enableBeforeUnload).toBe(false));
    expect(localStorage.getItem(oldBackupKey)).toBe(oldBackup);
    fireEvent.change(title, {
      target: { value: "Edits after loading latest" },
    });
    act(() => {
      editorFrom(first.container)!.commands.setContent(
        "<p>Unsaved body after loading latest.</p>",
      );
    });
    await waitFor(() => expect(localStorage.length).toBe(2));
    const newBackupKey = [localStorage.key(0)!, localStorage.key(1)!].find(
      (key) => key !== oldBackupKey,
    )!;
    const backup = JSON.parse(localStorage.getItem(newBackupKey)!);
    expect(backup.baseVersion).toBe("2026-09-25T10:00:02Z");
    expect(JSON.parse(backup.baseline)).toMatchObject({
      title: "Newly saved guide title",
      editorContent: "<p>Newly saved body.</p>",
    });
    first.unmount();
    const second = renderEditor();
    fireEvent.click(
      await screen.findByRole("button", { name: "Restore working copy" }),
    );
    expect(screen.getByDisplayValue("Edits after loading latest")).toBeTruthy();
    expect(editorFrom(second.container)?.getText()).toBe(
      "Unsaved body after loading latest.",
    );
    expect(h.update).not.toHaveBeenCalled();
    expect(h.blocker.enableBeforeUnload).toBe(true);
    expect(localStorage.getItem(oldBackupKey)).toBe(oldBackup);
  });

  it("recovers a crashed guide draft only after explicit restore and clears it on save", async () => {
    const first = renderEditor();
    await waitFor(() => expect(saveButton().disabled).toBe(false));
    fireEvent.change(screen.getByDisplayValue("AI for Small Business"), {
      target: { value: "Recovered guide title" },
    });
    await waitFor(() => expect(localStorage.length).toBe(1));
    first.unmount();
    renderEditor();
    const restore = await screen.findByRole("button", {
      name: "Restore working copy",
    });
    expect(screen.getByDisplayValue("AI for Small Business")).toBeTruthy();
    expect(h.update).not.toHaveBeenCalled();
    fireEvent.click(restore);
    expect(screen.getByDisplayValue("Recovered guide title")).toBeTruthy();
    expect(h.blocker.enableBeforeUnload).toBe(true);
    fireEvent.click(saveButton());
    await waitFor(() =>
      expect(h.navigate).toHaveBeenCalledWith("/admin/pillars"),
    );
    // The crashed instance's source remains; this saved instance's slot is cleared.
    expect(localStorage.length).toBe(1);
  });
  it("restores Save after a rejected sharing-image upload", async () => {
    h.upload.mockRejectedValueOnce(new Error("Network unavailable"));
    renderEditor();
    await waitFor(() => expect(saveButton().disabled).toBe(false));
    fireEvent.click(screen.getByRole("button", { name: /SEO Settings/ }));
    fireEvent.change(screen.getByLabelText("Upload guide sharing image"), {
      target: {
        files: [new File(["image"], "preview.png", { type: "image/png" })],
      },
    });
    await waitFor(() =>
      expect(h.toast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Upload failed",
          description: "Network unavailable",
        }),
      ),
    );
    expect(saveButton().disabled).toBe(false);
    expect(
      (screen.getByLabelText("Upload guide sharing image") as HTMLInputElement)
        .disabled,
    ).toBe(false);
  });

  it("restores Save after a stalled upload and ignores its late completion after retry", async () => {
    let finishOld!: (value: unknown) => void;
    h.upload.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishOld = resolve;
        }),
    );
    const { container } = renderEditor();
    await waitFor(() => expect(saveButton().disabled).toBe(false));
    fireEvent.click(screen.getByRole("button", { name: /SEO Settings/ }));
    vi.useFakeTimers();
    const input = screen.getByLabelText("Upload guide sharing image");
    const file = new File(["image"], "preview.png", { type: "image/png" });
    fireEvent.change(input, { target: { files: [file] } });
    expect(saveButton().disabled).toBe(true);
    await act(async () =>
      vi.advanceTimersByTimeAsync(GUIDE_IMAGE_UPLOAD_TIMEOUT_MS + 1),
    );
    expect(saveButton().disabled).toBe(false);
    expect(h.toast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Upload failed",
        description: expect.stringContaining("timed out"),
      }),
    );
    h.upload.mockResolvedValueOnce({ error: null });
    fireEvent.change(input, { target: { files: [file] } });
    await act(async () => vi.advanceTimersByTimeAsync(1));
    const newestPath = h.upload.mock.calls[1][0] as string;
    expect(
      container.querySelector(
        `img[src="https://images.example/${newestPath}"]`,
      ),
    ).toBeTruthy();
    await act(async () => finishOld({ error: null }));
    expect(
      container.querySelector(
        `img[src="https://images.example/${newestPath}"]`,
      ),
    ).toBeTruthy();
    expect(h.publicUrl).toHaveBeenCalledTimes(1);
    expect(saveButton().disabled).toBe(false);
  });
  it("freezes body and fields until publishing completes, then leaves without an unsaved-draft prompt", async () => {
    let finish!: () => void;
    h.writeWait = new Promise((resolve) => {
      finish = resolve;
    });
    h.pillar = {
      ...basePillar(),
      status: "draft",
      content: [1, 2, 3, 4, 5]
        .map(
          (n) =>
            `<h2>Section ${n}</h2><p>${"Practical specific guidance for business owners. ".repeat(12)}</p>`,
        )
        .join(""),
    };
    const { container } = renderEditor();
    const title = await screen.findByDisplayValue("AI for Small Business");
    await waitFor(() => expect(saveButton().disabled).toBe(false));
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    await waitFor(() => expect(h.update).toHaveBeenCalledTimes(1));
    expect(title.matches(":disabled")).toBe(true);
    expect(editorFrom(container)?.isEditable).toBe(false);
    await act(async () => {
      finish();
    });
    await waitFor(() =>
      expect(h.navigate).toHaveBeenCalledWith("/admin/pillars"),
    );
    expect(h.blocker.shouldBlockFn()).toBe(false);
    expect(h.update.mock.calls[0][0]).toMatchObject({ status: "published" });
  });

  it("freezes a new guide during its insert so success cannot leave a newer unsaved draft on the create route", async () => {
    let finish!: () => void;
    h.params = {};
    h.pillar = null;
    h.writeWait = new Promise((resolve) => {
      finish = resolve;
    });
    const { container } = renderEditor();
    const title = await screen.findByPlaceholderText("Pillar page title");
    fireEvent.change(title, { target: { value: "New draft guide" } });
    await waitFor(() => expect(saveButton().disabled).toBe(false));
    fireEvent.click(saveButton());
    await waitFor(() => expect(h.insert).toHaveBeenCalledTimes(1));
    expect(title.matches(":disabled")).toBe(true);
    expect(editorFrom(container)?.isEditable).toBe(false);
    fireEvent.click(saveButton());
    expect(h.insert).toHaveBeenCalledTimes(1);
    await act(async () => {
      finish();
    });
    await waitFor(() =>
      expect(h.navigate).toHaveBeenCalledWith("/admin/pillars"),
    );
    expect(h.blocker.shouldBlockFn()).toBe(false);
  });
  it("protects changed guide text when navigation is cancelled", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    renderEditor();
    const title = await screen.findByDisplayValue("AI for Small Business");
    expect(h.blocker.shouldBlockFn()).toBe(false);
    fireEvent.change(title, { target: { value: "Unsaved guide headline" } });
    expect(h.blocker.shouldBlockFn()).toBe(true);
    expect((title as HTMLInputElement).value).toBe("Unsaved guide headline");
    expect(h.blocker.enableBeforeUnload).toBe(true);
    confirm.mockRestore();
  });
  it("loads the stored body into the editor and saves it back unchanged", async () => {
    const { container } = renderEditor();
    await waitFor(() =>
      expect(container.querySelector(".ProseMirror")?.textContent).toContain(
        "Stored guide body with practical steps",
      ),
    );
    await waitFor(() => expect(saveButton().disabled).toBe(false));
    fireEvent.click(saveButton());
    await waitFor(() => expect(h.update).toHaveBeenCalledTimes(1));
    const payload = h.update.mock.calls[0][0] as { content: string };
    expect(payload.content).toContain("Stored guide body with practical steps");
    expect(payload.content).not.toBe("<p></p>");
    await waitFor(() =>
      expect(h.navigate).toHaveBeenCalledWith("/admin/pillars"),
    );
    expect(h.blocker.shouldBlockFn()).toBe(false);
  });

  it("reads legacy meta_* SEO keys and merges both key sets on save", async () => {
    const { container } = renderEditor();
    await waitFor(() => expect(saveButton().disabled).toBe(false));
    expect(editorFrom(container)).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /SEO Settings/ }));
    expect(screen.getByDisplayValue("Stored meta title")).toBeTruthy();
    expect(
      screen.getByDisplayValue("Stored meta description for search results"),
    ).toBeTruthy();
    fireEvent.click(saveButton());
    await waitFor(() => expect(h.update).toHaveBeenCalledTimes(1));
    const { seo_meta } = h.update.mock.calls[0][0] as {
      seo_meta: Record<string, unknown>;
    };
    expect(seo_meta).toMatchObject({
      title: "Stored meta title",
      meta_title: "Stored meta title",
      description: "Stored meta description for search results",
      meta_description: "Stored meta description for search results",
      faqs: [{ q: "Keep me", a: "Unknown keys survive" }],
    });
  });

  it("refuses to wipe a published guide's body unless the user confirms", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const { container } = renderEditor();
    await waitFor(() => expect(saveButton().disabled).toBe(false));
    const editor = editorFrom(container)!;
    act(() => {
      editor.commands.clearContent(true);
    });
    fireEvent.click(saveButton());
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(h.update).not.toHaveBeenCalled();

    confirm.mockReturnValue(true);
    fireEvent.click(saveButton());
    await waitFor(() => expect(h.update).toHaveBeenCalledTimes(1));
  });

  it("asks before saving a body that shrinks by more than half", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const { container } = renderEditor();
    await waitFor(() => expect(saveButton().disabled).toBe(false));
    act(() => {
      editorFrom(container)!.commands.setContent("<p>Short stub only.</p>");
    });
    fireEvent.click(saveButton());
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(h.update).not.toHaveBeenCalled();
  });

  it("shows a not-found state instead of an empty saveable form", async () => {
    h.pillar = null;
    renderEditor();
    expect(
      await screen.findByText(/This topic guide no longer exists/),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
  });

  it("reports an error when the update matched no rows", async () => {
    h.updatedRows = [];
    renderEditor();
    await waitFor(() => expect(saveButton().disabled).toBe(false));
    fireEvent.click(saveButton());
    await waitFor(() =>
      expect(h.toast).toHaveBeenCalledWith(
        expect.objectContaining({ variant: "destructive" }),
      ),
    );
    expect(h.navigate).not.toHaveBeenCalled();
    expect(h.filters).toContainEqual(["updated_at", "2026-09-25T10:00:00Z"]);
  });
});
