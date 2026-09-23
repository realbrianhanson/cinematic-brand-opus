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
  invoke: vi.fn(),
  rpc: vi.fn(),
  state: null as unknown as FakeState,
  jobs: [] as Record<string, unknown>[],
}));

vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: h.toast }) }));
vi.mock("@/integrations/supabase/client", () => {
  const channel = {
    on: () => channel,
    subscribe: () => channel,
  };
  return {
    supabase: {
      from: (table: string) =>
        createFakeSupabase({
          get ops() {
            return h.state.ops;
          },
          respond: (op: FakeOp): FakeResult => {
            if (op.table === "content_schemas")
              return {
                data: ["a", "b", "c", "d", "e", "f"].map((s) => ({
                  slug: `type-${s}`,
                  name: `Type ${s.toUpperCase()}`,
                  is_active: true,
                })),
                error: null,
              };
            if (op.table === "niches")
              return {
                data: [
                  {
                    id: "1",
                    slug: "roofers",
                    name: "Roofers",
                    is_active: true,
                  },
                  {
                    id: "2",
                    slug: "coaches",
                    name: "Coaches",
                    is_active: true,
                  },
                  {
                    id: "3",
                    slug: "dentists",
                    name: "Dentists",
                    is_active: true,
                  },
                ],
                error: null,
              };
            if (op.table === "generation_jobs" && op.action === "select")
              return { data: h.jobs, error: null };
            if (op.table === "generation_logs")
              return { data: [], error: null };
            return { data: [{ id: "x" }], error: null };
          },
        }).from(table),
      rpc: (...args: unknown[]) => h.rpc(...args),
      channel: () => channel,
      removeChannel: () => {},
      functions: { invoke: (...args: unknown[]) => h.invoke(...args) },
    },
  };
});

import GenerationControls from "../GenerationControls";

const renderControls = () => {
  h.state = { ops: [], respond: () => ({ data: null, error: null }) };
  h.rpc.mockResolvedValue({ data: 0, error: null });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <GenerationControls />
    </QueryClientProvider>,
  );
};

const generateButton = () =>
  screen.getByRole("button", { name: /Generate Content/ }) as HTMLButtonElement;

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  h.jobs = [];
});

describe("GenerationControls", () => {
  it("Select All only selects the niches the filter shows", async () => {
    renderControls();
    await screen.findByText("Roofers");
    fireEvent.change(screen.getByPlaceholderText("Filter niches..."), {
      target: { value: "roof" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Select 1 shown" }));
    expect(screen.getByText("1 of 3 selected")).toBeTruthy();
  });

  it("confirms page count and cost before starting, and sends the confirmed total", async () => {
    h.invoke.mockResolvedValue({
      data: { job_id: "j1", batch_id: "b1", total_combinations: 12 },
      error: null,
    });
    renderControls();
    await screen.findByText("Roofers");
    fireEvent.click(screen.getByLabelText("Roofers"));
    fireEvent.click(screen.getByLabelText("Coaches"));
    fireEvent.click(generateButton());
    expect(h.invoke).not.toHaveBeenCalled();
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("12 pages");
    expect(dialog).toHaveTextContent(/\$\d/);
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Generate 12 pages" }),
    );
    await waitFor(() =>
      expect(h.invoke).toHaveBeenCalledWith(
        "generate-content",
        expect.objectContaining({
          body: expect.objectContaining({
            confirmed_total: 12,
            count_per_combination: 1,
            dry_run: false,
          }),
        }),
      ),
    );
  });

  it("blocks jobs over the 50-page cap", async () => {
    renderControls();
    await screen.findByText("Roofers");
    fireEvent.click(screen.getByRole("button", { name: "Select All" }));
    fireEvent.change(screen.getByLabelText("Pages per industry"), {
      target: { value: "3" },
    });
    expect(screen.getByText(/limit is 50 pages per job/)).toBeTruthy();
    expect(generateButton()).toBeDisabled();
  });

  it("shows a stalled job with Cancel and Resume, and it does not block Generate", async () => {
    h.jobs = [
      {
        id: "job-1",
        batch_id: "batch-123456789",
        status: "running",
        total_combinations: 8,
        completed_count: 4,
        success_count: 4,
        failed_count: 0,
        skipped_count: 0,
        result_summary: null,
        error_message: null,
        work_queue: [{ angle: "a" }],
        created_at: new Date(Date.now() - 90 * 60_000).toISOString(),
        updated_at: new Date(Date.now() - 45 * 60_000).toISOString(),
      },
    ];
    h.invoke.mockResolvedValue({
      data: { job_id: "job-1", resumed_from: 4 },
      error: null,
    });
    renderControls();
    expect(await screen.findByText(/Stalled/)).toBeTruthy();
    expect(h.rpc).toHaveBeenCalledWith("mark_stalled_generation_jobs", {
      p_stall_minutes: 30,
    });
    fireEvent.click(screen.getByLabelText("Roofers"));
    expect(generateButton()).not.toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Resume" }));
    await waitFor(() =>
      expect(h.invoke).toHaveBeenCalledWith("generate-content", {
        body: { resume_job_id: "job-1" },
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Cancel job" }));
    await waitFor(() => {
      const cancel = h.state.ops.find(
        (op) => op.table === "generation_jobs" && op.action === "update",
      );
      expect(cancel?.payload).toMatchObject({ status: "cancelled" });
    });
  });
});
