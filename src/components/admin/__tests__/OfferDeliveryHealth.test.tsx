// @vitest-environment jsdom
import React from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
  invoke: vi.fn(),
  toast: vi.fn(),
}));
vi.mock("@/lib/offers", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/offers")>()),
  invokeOfferApi: mock.invoke,
}));
vi.mock("@/hooks/use-toast", () => ({ toast: mock.toast }));
import OfferDeliveryHealth, {
  type OfferDeliveryHealthData,
} from "../OfferDeliveryHealth";

const ISSUE_ID = "7d0f5c1e-2b3a-4c5d-8e9f-0a1b2c3d4e5f";
const base: OfferDeliveryHealthData = {
  secret_configured: false,
  webhook_configured: false,
  payments_ready: false,
  mode: "unconfigured",
  webhook_url: "https://backend.example.com/webhook",
  delivery_ready: true,
  delivery_missing: [],
  delivery_pending: 0,
  delivery_needs_review: 0,
  delivery_failed: 0,
  delivery_next_retry_at: null,
  delivery_last_issue: null,
};
const issue = (
  status: "pending" | "sending" | "failed" | "needs_review",
  extra: Record<string, unknown> = {},
) => ({
  id: ISSUE_ID,
  status,
  attempts: 3,
  provider_status: 422,
  detail: "Resend rejected the sender domain as unverified.",
  at: "2026-09-23T10:00:00.000Z",
  next_attempt_at: status === "pending" ? "2026-09-23T10:20:00.000Z" : null,
  ...extra,
});
const refresh = vi.fn();
function mount(health: OfferDeliveryHealthData | undefined) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <OfferDeliveryHealth health={health} refresh={refresh} />
    </QueryClientProvider>,
  );
}
const text = () => document.body.textContent ?? "";
const when = (value: string) =>
  new Date(value).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(cleanup);

describe("download email delivery health", () => {
  it("shows failed alongside pending and needs-review counts", () => {
    mount({
      ...base,
      delivery_pending: 2,
      delivery_needs_review: 1,
      delivery_failed: 3,
    });
    expect(text()).toContain("2 pending · 1 need review · 3 failed");
  });

  it("explains a pending problem in plain English with both times", () => {
    const pending = issue("pending");
    mount({
      ...base,
      delivery_pending: 1,
      delivery_next_retry_at: pending.next_attempt_at,
      delivery_last_issue: pending,
    });
    const banner = screen.getByText(/aren't going out yet/);
    expect(banner.textContent).toBe(
      `Download emails aren't going out yet. Last try ${when(pending.at)}: Resend rejected the sender domain as unverified. Retry eligible after ${when(pending.next_attempt_at!)}. Use Retry due emails now to process eligible messages. Automatic retries require a configured schedule. Customers can still use their private link`,
    );
    expect(screen.queryByRole("button", { name: "Requeue" })).toBeNull();
  });

  it("names the stop after 10 tries and offers Requeue for a failed email", () => {
    mount({
      ...base,
      delivery_failed: 2,
      delivery_last_issue: issue("failed", { attempts: 10 }),
    });
    expect(text()).toContain(
      "2 download emails stopped after 10 tries. Resend never accepted them, so fix the cause above and hit Requeue",
    );
    expect(text()).toContain("Resend rejected the sender domain as unverified");
    expect(screen.getByRole("button", { name: "Requeue" })).toBeTruthy();
  });

  it("uses singular copy for one failed email", () => {
    mount({
      ...base,
      delivery_failed: 1,
      delivery_last_issue: issue("failed"),
    });
    expect(text()).toContain(
      "1 download email stopped after 10 tries. Resend never accepted it, so fix the cause above and hit Requeue",
    );
  });

  it("tells the admin to check the Resend log before requeueing a needs-review email", () => {
    mount({
      ...base,
      delivery_needs_review: 1,
      delivery_last_issue: issue("needs_review", { provider_status: null }),
    });
    expect(text()).toContain(
      "An email may have reached Resend before we lost track of it. Check the Resend log first. If it shows no send, hit Requeue",
    );
  });

  it("never ends banner copy with a period", () => {
    mount({
      ...base,
      delivery_pending: 1,
      delivery_failed: 1,
      delivery_needs_review: 1,
      delivery_last_issue: issue("pending", {
        detail: "Resend timed out...",
      }),
    });
    for (const node of screen.getAllByRole("status"))
      expect(node.textContent?.trim().endsWith(".")).toBe(false);
    expect(text()).toContain("Last try");
    expect(text()).not.toContain("..");
  });

  it("requeues only after confirmation, then refreshes health", async () => {
    mock.invoke.mockResolvedValue({
      sent: 1,
      remaining: 0,
      stopped: 0,
      errors: 0,
      requeued: true,
    });
    mount({
      ...base,
      delivery_failed: 1,
      delivery_last_issue: issue("failed"),
    });
    fireEvent.click(screen.getByRole("button", { name: "Requeue" }));
    const dialog = screen.getByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(mock.invoke).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Requeue" }));
    fireEvent.click(
      within(screen.getByRole("alertdialog")).getByRole("button", {
        name: "Requeue email",
      }),
    );
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(mock.invoke).toHaveBeenCalledWith({
      action: "retry_deliveries",
      requeue_id: ISSUE_ID,
    });
    expect(mock.toast).not.toHaveBeenCalledWith(
      expect.objectContaining({ variant: "destructive" }),
    );
  });

  it("shows a pending state while the requeue runs", async () => {
    let finish: (value: unknown) => void = () => {};
    mock.invoke.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    mount({
      ...base,
      delivery_failed: 1,
      delivery_last_issue: issue("failed"),
    });
    fireEvent.click(screen.getByRole("button", { name: "Requeue" }));
    fireEvent.click(screen.getByRole("button", { name: "Requeue email" }));
    await waitFor(() =>
      expect(
        (
          screen.getByRole("button", {
            name: "Requeuing…",
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(true),
    );
    finish({ sent: 0, remaining: 1, stopped: 0, errors: 0, requeued: true });
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("reports a refused requeue in a toast and does not refresh", async () => {
    mock.invoke.mockRejectedValue(
      new Error("This email cannot be requeued. It was already accepted."),
    );
    mount({
      ...base,
      delivery_needs_review: 1,
      delivery_last_issue: issue("needs_review"),
    });
    fireEvent.click(screen.getByRole("button", { name: "Requeue" }));
    fireEvent.click(screen.getByRole("button", { name: "Requeue email" }));
    await waitFor(() =>
      expect(mock.toast).toHaveBeenCalledWith(
        expect.objectContaining({
          variant: "destructive",
          description: "This email cannot be requeued. It was already accepted",
        }),
      ),
    );
    expect(refresh).not.toHaveBeenCalled();
  });

  it("keeps Requeue off until the sender is configured", () => {
    mount({
      ...base,
      delivery_ready: false,
      delivery_missing: ["RESEND_API_KEY"],
      delivery_failed: 1,
      delivery_last_issue: issue("failed"),
    });
    expect(
      (screen.getByRole("button", { name: "Requeue" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });
});
