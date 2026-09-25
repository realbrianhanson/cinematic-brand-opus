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
  updatedRows: [{ id: "pillar-1" }] as { id: string }[],
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
  seo_meta: {
    meta_title: "Stored meta title",
    meta_description: "Stored meta description for search results",
    faqs: [{ q: "Keep me", a: "Unknown keys survive" }],
  },
});

vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: h.toast }) }));
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
          return {
            eq: () => ({
              select: async () => {
                await h.writeWait;
                return { data: h.updatedRows, error: null };
              },
            }),
          };
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
  return render(
    <QueryClientProvider client={qc}>
      <PillarPageEditor />
    </QueryClientProvider>,
  );
};

const editorFrom = (container: HTMLElement) =>
  (container.querySelector(".ProseMirror") as unknown as { editor?: Editor })
    ?.editor ?? null;

const saveButton = () =>
  screen.getByRole("button", { name: "Save" }) as HTMLButtonElement;

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
  vi.restoreAllMocks();
  h.params = { id: "pillar-1" };
  h.pillar = basePillar();
  h.updatedRows = [{ id: "pillar-1" }];
  h.writeWait = undefined;
  h.upload.mockReset();
});
h.pillar = basePillar();

describe("topic guide editor", () => {
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
  });
});
