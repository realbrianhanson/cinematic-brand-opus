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
vi.mock("@/lib/withTimeout", () => ({
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
              select: async () => ({ data: h.updatedRows, error: null }),
            }),
          };
        },
        insert: async (payload: unknown) => {
          h.insert(payload);
          return { error: null };
        },
      }),
      storage: { from: () => ({}) },
    },
  };
});

import PillarPageEditor from "../PillarPageEditor";

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
  vi.clearAllMocks();
  vi.restoreAllMocks();
  h.params = { id: "pillar-1" };
  h.pillar = basePillar();
  h.updatedRows = [{ id: "pillar-1" }];
});
h.pillar = basePillar();

describe("topic guide editor", () => {
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
