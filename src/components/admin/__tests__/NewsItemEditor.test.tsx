// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import NewsItemEditor, {
  NEWS_IMAGE_UPLOAD_TIMEOUT_MS,
} from "../NewsItemEditor";

const h = vi.hoisted(() => ({
  toast: vi.fn(),
  update: vi.fn(),
  filters: vi.fn(),
  saved: { id: "news-1" } as { id: string } | null,
  load: vi.fn(),
  upload: vi.fn(),
  publicUrl: vi.fn((path: string) => ({
    data: { publicUrl: `https://images.example/${path}` },
  })),
}));
const item = {
  id: "news-1",
  edit_version: "00000000-0000-4000-8000-000000000001",
  title: "A new scheduling tool for business owners",
  ai_title: null,
  ai_summary: "A useful scheduling feature.",
  raw_excerpt: null,
  full_content: "## What changed\n\nA factual report with **emphasis**.",
  image_url: null,
  author: null,
  url: "https://example.com/report",
  topic_lane: "ai_tools",
  published_at: null,
  status: "pending",
  source_id: "feed-1",
  source_name: "Perplexity Daily",
  content_sources: { name: "Perplexity Daily" },
};
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: h.toast }) }));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "news-admin" } }),
}));
vi.mock("@/lib/withTimeout", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  safeMutation: (run: () => unknown) => run(),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    storage: { from: () => ({ upload: h.upload, getPublicUrl: h.publicUrl }) },
    from: () => ({
      select: () => ({
        eq: (_column: string, id: string) => ({
          maybeSingle: () =>
            h.load.getMockImplementation()
              ? h.load(id)
              : Promise.resolve({ data: item, error: null }),
        }),
      }),
      update: (payload: unknown) => {
        h.update(payload);
        const chain = {
          eq: (column: string, value: unknown) => {
            h.filters(column, value);
            return chain;
          },
          select: () => ({
            maybeSingle: async () => ({ data: h.saved, error: null }),
          }),
        };
        return chain;
      },
    }),
  },
}));
afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.useRealTimers();
  vi.clearAllMocks();
  h.load.mockReset();
  h.upload.mockReset();
  vi.restoreAllMocks();
  h.saved = { id: "news-1" };
});

describe("news editorial review", () => {
  it("uses the loaded version and preserves edits when another writer wins", async () => {
    h.saved = null;
    const onSaved = vi.fn();
    render(
      <NewsItemEditor itemId="news-1" onClose={vi.fn()} onSaved={onSaved} />,
    );
    const editor = await screen.findByRole("textbox", {
      name: "Full article content",
    });
    fireEvent.change(editor, { target: { value: "My important review" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByText(/changed since you opened it/)).toBeTruthy();
    expect(h.filters).toHaveBeenCalledWith("edit_version", item.edit_version);
    expect((editor as HTMLTextAreaElement).value).toBe("My important review");
    expect(onSaved).not.toHaveBeenCalled();
    h.load.mockResolvedValue({
      data: {
        ...item,
        edit_version: "00000000-0000-4000-8000-000000000002",
        full_content: "Newer saved report",
      },
      error: null,
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Compare latest saved version" }),
    );
    expect(
      await screen.findByText(/"full_content": "Newer saved report"/),
    ).toBeTruthy();
    expect((editor as HTMLTextAreaElement).value).toBe("My important review");
    fireEvent.click(
      screen.getByRole("button", { name: "Load latest saved version" }),
    );
    expect(await screen.findByDisplayValue("Newer saved report")).toBeTruthy();
    expect(await screen.findByText(/direct restore is blocked/)).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Restore working copy" }),
    ).toBeNull();
    h.saved = { id: item.id };
    fireEvent.change(
      screen.getByRole("textbox", { name: "Full article content" }),
      { target: { value: "Merged review" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
    expect(h.filters).toHaveBeenCalledWith(
      "edit_version",
      "00000000-0000-4000-8000-000000000002",
    );
  });
  it("fails closed if the deployment has no concurrency token", async () => {
    h.load.mockResolvedValue({
      data: { ...item, edit_version: undefined },
      error: null,
    });
    render(
      <NewsItemEditor itemId="news-1" onClose={vi.fn()} onSaved={vi.fn()} />,
    );
    expect((await screen.findByRole("alert")).textContent).toMatch(
      /version protection/,
    );
    expect(screen.queryByRole("button", { name: "Save changes" })).toBeNull();
  });
  it("offers the article's local draft after reopening without saving or publishing on restore", async () => {
    const props = { itemId: "news-1", onClose: vi.fn(), onSaved: vi.fn() };
    const first = render(<NewsItemEditor {...props} />);
    const editor = await screen.findByRole("textbox", {
      name: "Full article content",
    });
    fireEvent.change(editor, {
      target: { value: "Unfinished factual review" },
    });
    await waitFor(() => expect(localStorage.length).toBe(1));
    first.unmount();
    render(<NewsItemEditor {...props} />);
    const restore = await screen.findByRole("button", {
      name: "Restore working copy",
    });
    expect(
      (
        screen.getByRole("textbox", {
          name: "Full article content",
        }) as HTMLTextAreaElement
      ).value,
    ).toBe(item.full_content);
    fireEvent.click(restore);
    expect(
      (
        screen.getByRole("textbox", {
          name: "Full article content",
        }) as HTMLTextAreaElement
      ).value,
    ).toBe("Unfinished factual review");
    expect(h.update).not.toHaveBeenCalled();
    expect(props.onSaved).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(props.onSaved).toHaveBeenCalledOnce());
    // Saving clears only the current instance, not the crashed source instance.
    expect(localStorage.length).toBe(1);
  });
  it("unlocks after a stalled upload and ignores its late completion after a retry", async () => {
    let finishOld!: (value: unknown) => void;
    h.upload.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishOld = resolve;
        }),
    );
    const onClose = vi.fn();
    render(
      <NewsItemEditor itemId="news-1" onClose={onClose} onSaved={vi.fn()} />,
    );
    const editor = await screen.findByRole("textbox", {
      name: "Full article content",
    });
    fireEvent.change(editor, { target: { value: "Keep my unsaved article" } });
    vi.useFakeTimers();
    const upload = screen.getByLabelText("Upload new image");
    const file = new File(["image"], "preview.png", { type: "image/png" });
    fireEvent.change(upload, { target: { files: [file] } });
    expect(
      (
        screen.getByRole("button", {
          name: "Close article editor",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    await act(async () =>
      vi.advanceTimersByTimeAsync(NEWS_IMAGE_UPLOAD_TIMEOUT_MS + 1),
    );
    expect(
      (
        screen.getByRole("button", {
          name: "Close article editor",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false);
    expect(editor.matches(":disabled")).toBe(false);
    expect((editor as HTMLTextAreaElement).value).toBe(
      "Keep my unsaved article",
    );
    expect(h.toast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Upload failed",
        description: expect.stringContaining("timed out"),
      }),
    );
    h.upload.mockResolvedValueOnce({ error: null });
    fireEvent.change(upload, { target: { files: [file] } });
    await act(async () => vi.advanceTimersByTimeAsync(1));
    const newPath = h.upload.mock.calls[1][0] as string;
    expect(
      screen.getByDisplayValue(`https://images.example/${newPath}`),
    ).toBeTruthy();
    await act(async () => finishOld({ error: null }));
    expect(
      screen.getByDisplayValue(`https://images.example/${newPath}`),
    ).toBeTruthy();
    expect(h.publicUrl).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });
  it("shows and saves the publication time in the editor's local timezone", async () => {
    const options = new Intl.DateTimeFormat().resolvedOptions();
    vi.spyOn(Intl.DateTimeFormat.prototype, "resolvedOptions").mockReturnValue({
      ...options,
      timeZone: "America/New_York",
    });
    h.load.mockResolvedValue({
      data: { ...item, published_at: "2026-09-25T14:00:00.000Z" },
      error: null,
    });
    render(
      <NewsItemEditor itemId="news-1" onClose={vi.fn()} onSaved={vi.fn()} />,
    );
    const date = await screen.findByLabelText("Publication date");
    expect((date as HTMLInputElement).value).toBe("2026-09-25T10:00");
    fireEvent.change(date, { target: { value: "2026-09-25T11:00" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() =>
      expect(h.update).toHaveBeenCalledWith(
        expect.objectContaining({ published_at: "2026-09-25T15:00:00.000Z" }),
      ),
    );
  });
  it("ignores a late response for a previously selected article", async () => {
    let resolveOld!: (value: unknown) => void;
    h.load.mockImplementation((id: string) =>
      id === "old"
        ? new Promise((resolve) => {
            resolveOld = resolve;
          })
        : Promise.resolve({
            data: { ...item, id: "new", full_content: "New article" },
            error: null,
          }),
    );
    const onClose = vi.fn();
    const onSaved = vi.fn();
    const view = render(
      <NewsItemEditor itemId="old" onClose={onClose} onSaved={onSaved} />,
    );
    view.rerender(
      <NewsItemEditor itemId="new" onClose={onClose} onSaved={onSaved} />,
    );
    expect(await screen.findByDisplayValue("New article")).toBeTruthy();
    await act(async () =>
      resolveOld({
        data: { ...item, full_content: "Wrong old article" },
        error: null,
      }),
    );
    expect(screen.getByDisplayValue("New article")).toBeTruthy();
    expect(screen.queryByDisplayValue("Wrong old article")).toBeNull();
  });

  it("offers a retry after a thrown load error", async () => {
    h.load.mockRejectedValueOnce(new Error("Network unavailable"));
    const onClose = vi.fn();
    render(
      <NewsItemEditor itemId="news-1" onClose={onClose} onSaved={vi.fn()} />,
    );
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
    h.load.mockResolvedValue({ data: item, error: null });
    fireEvent.click(
      screen.getByRole("button", { name: "Retry loading article" }),
    );
    expect(
      await screen.findByRole("textbox", { name: "Full article content" }),
    ).toBeTruthy();
  });

  it("asks before discarding changed article text", async () => {
    const onClose = vi.fn();
    render(
      <NewsItemEditor itemId="news-1" onClose={onClose} onSaved={vi.fn()} />,
    );
    const editor = await screen.findByRole("textbox", {
      name: "Full article content",
    });
    fireEvent.change(editor, { target: { value: "My unsaved article" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).not.toHaveBeenCalled();
    expect(await screen.findByRole("alertdialog")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));
    expect((editor as HTMLTextAreaElement).value).toBe("My unsaved article");
    fireEvent.click(
      screen.getByRole("button", { name: "Close article editor" }),
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Discard changes" }),
    );
    expect(onClose).toHaveBeenCalledTimes(1);
  });
  it("edits and saves the actual Markdown format without converting it into escaped HTML", async () => {
    const onSaved = vi.fn();
    render(
      <NewsItemEditor itemId="news-1" onClose={vi.fn()} onSaved={onSaved} />,
    );
    const editor = await screen.findByRole("textbox", {
      name: "Full article content",
    });
    expect((editor as HTMLTextAreaElement).value).toBe(item.full_content);
    expect(screen.getByText("Editorial review")).toBeTruthy();
    const markdown = "## The practical change\n\nSource-supported details.";
    fireEvent.change(editor, { target: { value: markdown } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(h.update).toHaveBeenCalledWith(
      expect.objectContaining({ full_content: markdown }),
    );
  });
  it("does not report a no-row save as success", async () => {
    h.saved = null;
    const onSaved = vi.fn();
    render(
      <NewsItemEditor itemId="news-1" onClose={vi.fn()} onSaved={onSaved} />,
    );
    await screen.findByRole("textbox", { name: "Full article content" });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() =>
      expect(h.toast).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Save failed" }),
      ),
    );
    expect(onSaved).not.toHaveBeenCalled();
  });
  it("rejects unsafe report destinations before saving", async () => {
    render(
      <NewsItemEditor itemId="news-1" onClose={vi.fn()} onSaved={vi.fn()} />,
    );
    const input = await screen.findByDisplayValue(item.url);
    fireEvent.change(input, { target: { value: "javascript:alert(1)" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(h.update).not.toHaveBeenCalled();
    expect(h.toast).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Use a valid report URL" }),
    );
  });
});
