// @vitest-environment jsdom
import type React from "react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { FunctionsHttpError } from "@supabase/supabase-js";
const mock = vi.hoisted(() => ({
  load: vi.fn(),
  invoke: vi.fn(),
  update: vi.fn(),
  toast: vi.fn(),
}));
vi.mock("../contentQueueData", () => ({ loadContentQueue: mock.load }));
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: mock.toast }),
}));
vi.mock("@/lib/router-compat", () => ({
  Link: ({
    to,
    children,
    ...props
  }: {
    to: string;
    children: React.ReactNode;
  }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));
vi.mock("../NewsItemEditor", () => ({ default: () => null }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: { invoke: mock.invoke },
    channel: () => {
      const channel = { on: () => channel, subscribe: () => channel };
      return channel;
    },
    removeChannel: vi.fn(),
    from: () => {
      const mutation = {
        eq: () => mutation,
        select: () => mutation,
        maybeSingle: () => mock.update(),
      };
      return { update: () => mutation };
    },
  },
}));
import ContentQueue from "../ContentQueue";
const snapshot = {
  checkedAt: "2026-09-19T00:00:00Z",
  settings: {
    auto_publish_enabled: true,
    auto_publish_daily_cap: 2,
    auto_publish_min_quality: 87,
  },
  opps: [
    {
      id: "opp",
      status: "rejected",
      angle: "Useful topic",
      topic_lane: "ai_tools",
      opportunity_score: 90,
      target_keyword: "AI tools",
      rationale: "Relevant",
      last_error: "Sources too old",
      reject_reason: null,
      created_at: "2026-09-19T00:00:00Z",
      brief: { sources: [] },
    },
  ],
  posts: [
    {
      id: "post",
      title: "A draft to verify",
      quality_score: 92,
      originality_score: 90,
      fact_check: {},
      source_citations: [],
      created_at: "2026-09-19T00:00:00Z",
    },
  ],
  items: [],
};
const clients: QueryClient[] = [];
function mount() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  clients.push(client);
  return render(
    <QueryClientProvider client={client}>
      <ContentQueue />
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  mock.load.mockResolvedValue(snapshot);
  mock.update.mockResolvedValue({
    data: null,
    error: new Error("Update unavailable"),
  });
});
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
});
describe("queue controls and truthful state", () => {
  it("shows paused automation and saved settings without claiming drafts are ready", async () => {
    mock.load.mockResolvedValue({
      ...snapshot,
      settings: { ...snapshot.settings, auto_publish_enabled: false },
    });
    mount();
    await screen.findByText("Automation is paused");
    expect(
      (screen.getByRole("button", { name: "Run now" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(screen.getByText(/Daily cap: 2 · Minimum quality: 87/)).toBeTruthy();
    expect(
      screen.getByText("Fact check pending — review the evidence."),
    ).toBeTruthy();
    expect(screen.queryByText(/Ready to publish/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Clear all" })).toBeNull();
  });
  it("keeps the last snapshot visible and disables mutations when refresh fails", async () => {
    mount();
    await screen.findByText("A draft to verify");
    mock.load.mockRejectedValue(new Error("Offline"));
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await screen.findByRole("alert");
    expect(screen.getByText("A draft to verify")).toBeTruthy();
    expect(
      screen.getByText(/Showing the last successful snapshot/),
    ).toBeTruthy();
    expect(
      (
        screen.getByRole("button", {
          name: "Check & publish",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });
  it("reports mutation failure instead of implying a rejected opportunity was retried", async () => {
    mount();
    fireEvent.click(
      await screen.findByRole("button", { name: "Return to queue" }),
    );
    await waitFor(() =>
      expect(mock.toast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Action needs attention",
          description: "Update unavailable",
          variant: "destructive",
        }),
      ),
    );
    expect(mock.toast).not.toHaveBeenCalledWith(
      expect.objectContaining({ title: "Opportunity returned to queue" }),
    );
  });
  it("requires explicit publish success even when the request returns without an HTTP error", async () => {
    mock.invoke.mockResolvedValue({ data: null, error: null });
    mount();
    fireEvent.click(
      await screen.findByRole("button", { name: "Check & publish" }),
    );
    await waitFor(() =>
      expect(mock.toast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Action needs attention",
          description: expect.stringContaining("not confirmed"),
        }),
      ),
    );
    expect(mock.toast).not.toHaveBeenCalledWith(
      expect.objectContaining({ title: "Published" }),
    );
  });
  it("reports partial run failures instead of a success-only toast", async () => {
    mock.invoke.mockResolvedValue({
      data: {
        ok: true,
        drafted: 0,
        log: { steps: { poll: { status: 500 }, drafts: [] } },
      },
      error: null,
    });
    mount();
    await screen.findByText("Automation enabled");
    fireEvent.click(screen.getByRole("button", { name: "Run now" }));
    await waitFor(() =>
      expect(mock.toast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Run finished with issues",
          variant: "destructive",
        }),
      ),
    );
  });
});

const blockedResponse = (extra: Record<string, unknown> = {}) => ({
  data: null,
  error: new FunctionsHttpError(
    new Response(
      JSON.stringify({
        ok: false,
        decision: "blocked",
        failures: ["Not fact-checked yet"],
        reasons: [
          { code: "fact_check_missing", message: "Not fact-checked yet" },
        ],
        ...extra,
      }),
      { status: 422 },
    ),
  ),
});

describe("holds, credit stops and one-article overrides", () => {
  it("shows why a held draft isn't live", async () => {
    mock.load.mockResolvedValue({
      ...snapshot,
      posts: [
        {
          ...snapshot.posts[0],
          held_reason: "Quality score 62, needs 85; Not fact-checked yet",
          held_at: "2026-09-20T10:00:00Z",
        },
      ],
    });
    mount();
    expect(await screen.findByText(/^Held on /)).toBeTruthy();
    expect(screen.getByText("Quality score 62, needs 85")).toBeTruthy();
    expect(screen.getByText("Not fact-checked yet")).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/held_reason/);
  });

  it("says clearly when the run stopped because AI credits ran out", async () => {
    mock.invoke.mockResolvedValue({
      data: {
        ok: false,
        stopped_reason: "ai_credits_exhausted",
        stopped_stage: "fact-check",
        message: "AI credits ran out. Add credits in Lovable, then run again",
        drafted: 1,
      },
      error: null,
    });
    mount();
    await screen.findByText("Automation enabled");
    fireEvent.click(screen.getByRole("button", { name: "Run now" }));
    const alert = await screen.findByText(
      "AI credits ran out — top up in Lovable; nothing was lost",
    );
    expect(alert.closest("[role='alert']")).toBeTruthy();
    expect(screen.getByText(/stopped at the fact-check step/i)).toBeTruthy();
  });

  it("overrides one article at a time with a typed reason", async () => {
    mock.invoke
      .mockResolvedValueOnce(blockedResponse())
      .mockResolvedValueOnce(
        blockedResponse({
          reason_error: "Override reason must be at least 10 characters",
        }),
      )
      .mockResolvedValueOnce({
        data: { ok: true, decision: "published_with_override" },
        error: null,
      });
    mount();
    fireEvent.click(
      await screen.findByRole("button", { name: "Check & publish" }),
    );
    const reason = await screen.findByLabelText("Reason for overriding");
    expect(
      screen.getByRole("button", { name: "Publish anyway" }),
    ).toBeDisabled();
    fireEvent.change(reason, {
      target: { value: "Verified the two claims myself" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Publish anyway" }));
    expect(
      await screen.findByText("Override reason must be at least 10 characters"),
    ).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Reason for overriding"), {
      target: { value: "Verified the two claims myself" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Publish anyway" }));
    await waitFor(() =>
      expect(mock.toast).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Published with override" }),
      ),
    );
    expect(mock.invoke).toHaveBeenLastCalledWith("manual-publish", {
      body: {
        post_id: "post",
        mode: "publish",
        override_reason: "Verified the two claims myself",
      },
    });
  });
});
