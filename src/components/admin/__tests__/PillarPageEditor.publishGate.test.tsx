// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const section = (n: number) =>
  `<h2>Section ${n}</h2><p>${"Practical, specific steps owners can take this week. ".repeat(8)}</p>`;
const FULL_BODY = [1, 2, 3, 4, 5].map(section).join("");
const THIN_BODY = "<h2>Draft</h2><p>Only a short stub so far.</p>";

const h = vi.hoisted(() => ({
  toast: vi.fn(),
  navigate: vi.fn(),
  update: vi.fn(),
  rpc: vi.fn(),
  pillar: null as Record<string, unknown> | null,
}));

vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: h.toast }) }));
vi.mock("@/lib/withTimeout", () => ({
  safeMutation: (run: () => unknown) => run(),
}));
vi.mock("@/lib/router-compat", () => ({
  useParams: () => ({ id: "pillar-1" }),
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
              select: async () => ({
                data: [{ id: "pillar-1" }],
                error: null,
              }),
            }),
          };
        },
      }),
      rpc: async (...args: unknown[]) => {
        h.rpc(...args);
        return { data: [], error: null };
      },
      storage: { from: () => ({}) },
    },
  };
});

import PillarPageEditor from "../PillarPageEditor";

const renderEditor = (content: string) => {
  h.pillar = {
    id: "pillar-1",
    title: "AI for Roofers",
    slug: "ai-for-roofers",
    status: "draft",
    niche_id: null,
    content,
    published_at: null,
    seo_meta: {},
  };
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <PillarPageEditor />
    </QueryClientProvider>,
  );
};

const publishButton = () =>
  screen.getByRole("button", { name: "Publish" }) as HTMLButtonElement;

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("topic guide publish gate", () => {
  it("publishes a guide that passes the length and structure rule", async () => {
    renderEditor(FULL_BODY);
    await waitFor(() => expect(publishButton().disabled).toBe(false));
    fireEvent.click(publishButton());
    await waitFor(() => expect(h.update).toHaveBeenCalledTimes(1));
    expect(h.update.mock.calls[0][0]).toMatchObject({ status: "published" });
    expect(h.update.mock.calls[0][0].published_at).toBeTruthy();
    expect(h.rpc).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("stops a thin guide and publishes only with a logged reason", async () => {
    renderEditor(THIN_BODY);
    await waitFor(() => expect(publishButton().disabled).toBe(false));
    fireEvent.click(publishButton());
    const dialog = await screen.findByRole("dialog");
    expect(dialog.textContent).toMatch(/1500/);
    expect(h.update).not.toHaveBeenCalled();

    const publishAnyway = within(dialog).getByRole("button", {
      name: "Publish anyway",
    }) as HTMLButtonElement;
    expect(publishAnyway.disabled).toBe(true);
    fireEvent.change(within(dialog).getByLabelText(/Reason/), {
      target: { value: "Launch promo, full guide lands next week" },
    });
    fireEvent.click(publishAnyway);

    await waitFor(() => expect(h.rpc).toHaveBeenCalledTimes(1));
    // Edits are saved unpublished first, then the audited RPC publishes.
    expect(h.update.mock.calls[0][0]).toMatchObject({ status: "draft" });
    expect(h.rpc).toHaveBeenCalledWith(
      "publish_pillar_page_with_override",
      expect.objectContaining({
        p_pillar_id: "pillar-1",
        p_reason: "Launch promo, full guide lands next week",
      }),
    );
  });

  it("can save a thin guide without publishing it", async () => {
    renderEditor(THIN_BODY);
    await waitFor(() => expect(publishButton().disabled).toBe(false));
    fireEvent.click(publishButton());
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Save without publishing" }),
    );
    await waitFor(() => expect(h.update).toHaveBeenCalledTimes(1));
    expect(h.update.mock.calls[0][0]).toMatchObject({ status: "draft" });
    expect(h.rpc).not.toHaveBeenCalled();
  });
});
