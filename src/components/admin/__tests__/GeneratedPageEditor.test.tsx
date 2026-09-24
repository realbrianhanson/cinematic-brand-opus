// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
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
}));

vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: h.toast }) }));
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
          if (op.table === "generated_pages" && op.action === "select")
            return { data: h.page, error: null };
          if (op.action === "update")
            return { data: null, error: h.updateError };
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
  return render(
    <QueryClientProvider client={qc}>
      <GeneratedPageEditor />
    </QueryClientProvider>,
  );
};

const updates = () =>
  h.state.ops
    .filter((op) => op.table === "generated_pages" && op.action === "update")
    .map((op) => op.payload as Record<string, unknown>);

const contentBox = () =>
  screen.getByLabelText("Content JSON") as HTMLTextAreaElement;

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  h.updateError = null;
});

describe("GeneratedPageEditor", () => {
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
