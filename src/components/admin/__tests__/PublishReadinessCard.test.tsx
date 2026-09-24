// @vitest-environment jsdom
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

const mock = vi.hoisted(() => ({ invoke: vi.fn(), toast: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: mock.invoke } },
}));
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: mock.toast }),
}));

import PublishReadinessCard from "../PublishReadinessCard";

const POST = "10000000-0000-4000-8000-000000000001";
type Props = Parameters<typeof PublishReadinessCard>[0];
const onServerChange = vi.fn();
const onEditArticle = vi.fn();

function mount(overrides: Partial<Props> = {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <PublishReadinessCard
        postId={POST}
        status="draft"
        updatedAt="v1"
        heldReason={null}
        heldAt={null}
        contradictedCount={0}
        dirty={false}
        onServerChange={onServerChange}
        onEditArticle={onEditArticle}
        {...overrides}
      />
    </QueryClientProvider>,
  );
}

const blockedCheck = {
  data: {
    ok: true,
    decision: "blocked",
    failures: [
      "Quality score 62, needs 85",
      "2 claims the fact-checker marked as contradicted",
    ],
    reasons: [
      { code: "quality_low", message: "Quality score 62, needs 85" },
      {
        code: "contradicted_claims",
        message: "2 claims the fact-checker marked as contradicted",
      },
    ],
  },
  error: null,
};

beforeEach(() => {
  mock.invoke.mockReset();
  mock.toast.mockReset();
  onServerChange.mockReset();
  onEditArticle.mockReset();
});
afterEach(cleanup);

describe("publish readiness in the editor", () => {
  it("asks to save a brand-new article before checking", () => {
    mount({ postId: null });
    expect(screen.getByText(/save the article to check/i)).toBeInTheDocument();
    expect(mock.invoke).not.toHaveBeenCalled();
  });

  it("runs the check on open and shows Ready to publish", async () => {
    mock.invoke.mockResolvedValue({
      data: { ok: true, decision: "ready", failures: [], reasons: [] },
      error: null,
    });
    mount();
    expect(await screen.findByText("Ready to publish")).toBeInTheDocument();
    expect(mock.invoke).toHaveBeenCalledWith("manual-publish", {
      body: { post_id: POST, mode: "check" },
    });
  });

  it("explains in plain English why a draft isn't live and how to fix it", async () => {
    mock.invoke.mockResolvedValue(blockedCheck);
    const { container } = mount();
    expect(
      await screen.findByText("Why this isn't live yet"),
    ).toBeInTheDocument();
    expect(screen.getByText("Quality score 62, needs 85")).toBeInTheDocument();
    expect(
      screen.getByText("2 claims the fact-checker marked as contradicted"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Fix facts" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Improve quality" }));
    expect(onEditArticle).toHaveBeenCalled();
    expect(container.textContent).not.toMatch(
      /held_reason|contradicted_count|quality_score|fact_check|lint_flags/,
    );
  });

  it("shows why the pipeline held the article and when", async () => {
    mock.invoke.mockResolvedValue(blockedCheck);
    mount({
      heldReason: "Quality score 62, needs 85; Not fact-checked yet",
      heldAt: "2026-09-20T10:00:00Z",
    });
    expect(
      await screen.findByText(/held by the publishing pipeline/i),
    ).toBeInTheDocument();
    expect(screen.getByText("Not fact-checked yet")).toBeInTheDocument();
  });

  it("re-checks on demand", async () => {
    mock.invoke.mockResolvedValue(blockedCheck);
    mount();
    await screen.findByText("Why this isn't live yet");
    mock.invoke.mockResolvedValue({
      data: { ok: true, decision: "ready", failures: [], reasons: [] },
      error: null,
    });
    fireEvent.click(screen.getByRole("button", { name: "Re-check" }));
    expect(await screen.findByText("Ready to publish")).toBeInTheDocument();
    expect(mock.invoke).toHaveBeenCalledTimes(2);
  });

  it("fixes facts for this one article, then reloads it", async () => {
    mock.invoke.mockImplementation(async (name: string) =>
      name === "manual-publish"
        ? blockedCheck
        : { data: { ok: true, changed: true }, error: null },
    );
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Fix facts" }));
    await waitFor(() => expect(onServerChange).toHaveBeenCalled());
    expect(mock.invoke).toHaveBeenCalledWith("remediate-post-facts", {
      body: { post_id: POST },
    });
  });

  it("keeps fix actions off until unsaved changes are saved", async () => {
    mock.invoke.mockResolvedValue(blockedCheck);
    mount({ dirty: true });
    expect(await screen.findByText(/save first/i)).toBeInTheDocument();
    expect(
      await screen.findByRole("button", { name: "Fix facts" }),
    ).toBeDisabled();
  });

  it("flags a live article with contradicted claims without re-running the gate", () => {
    mount({ status: "published", contradictedCount: 2 });
    expect(screen.getByText("Needs fact review")).toBeInTheDocument();
    expect(screen.getByText(/2 claims/)).toBeInTheDocument();
    expect(mock.invoke).not.toHaveBeenCalled();
  });

  it("reports a failed check instead of claiming the article is ready", async () => {
    mock.invoke.mockResolvedValue({
      data: null,
      error: new Error("boom"),
    });
    mount();
    expect(
      await screen.findByText(/couldn't run the publishing check/i),
    ).toBeInTheDocument();
    expect(screen.queryByText("Ready to publish")).toBeNull();
  });
});
