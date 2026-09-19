// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import NewsItemEditor from "../NewsItemEditor";

const h = vi.hoisted(() => ({
  toast: vi.fn(),
  update: vi.fn(),
  saved: { id: "news-1" } as { id: string } | null,
}));
const item = {
  id: "news-1",
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
vi.mock("@/lib/withTimeout", () => ({
  safeMutation: (run: () => unknown) => run(),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: item, error: null }) }),
      }),
      update: (payload: unknown) => {
        h.update(payload);
        return {
          eq: () => ({
            select: () => ({
              maybeSingle: async () => ({ data: h.saved, error: null }),
            }),
          }),
        };
      },
    }),
  },
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  h.saved = { id: "news-1" };
});

describe("news editorial review", () => {
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
