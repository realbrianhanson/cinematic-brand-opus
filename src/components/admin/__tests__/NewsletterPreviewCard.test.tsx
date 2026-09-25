// @vitest-environment jsdom
import React from "react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { FakeOp, FakeResult } from "./fakeSupabaseQuery";

const h = vi.hoisted(() => ({
  toast: vi.fn(),
  invoke: vi.fn(),
  ops: [] as FakeOp[],
  current: null as Record<string, unknown> | null,
  history: [] as Record<string, unknown>[],
  counts: {} as Record<string, number>,
  rpcResult: { data: null, error: null } as FakeResult,
  rpcCalls: [] as string[],
  respond: (_op: FakeOp): FakeResult => ({ data: null, error: null }),
  rpc: (_name: string): FakeResult => ({ data: null, error: null }),
}));

vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: h.toast }) }));
vi.mock("@/lib/withTimeout", () => ({
  safeMutation: (run: () => unknown) => run(),
}));
vi.mock("@/integrations/supabase/client", async () => {
  const { createFakeSupabase } = await import("./fakeSupabaseQuery");
  return {
    supabase: { ...createFakeSupabase(h), functions: { invoke: h.invoke } },
  };
});

import NewsletterPreviewCard from "../NewsletterPreviewCard";

const failedW39 = {
  id: "11111111-1111-4111-8111-111111111111",
  week_key: "2026-W39",
  status: "needs_review",
  subject: "This week",
  intro: "Intro",
  post_blurbs: [],
  post_ids: [],
  sent_count: 0,
  recipient_count: 1,
  last_error: "Provider returned HTTP 403",
  last_error_status: 403,
  delivery_lease_until: null,
  from_address: "Brian Hanson <brian@m.brianhanson.com>",
};

function renderCard() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <NewsletterPreviewCard />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  h.ops = [];
  h.rpcCalls = [];
  h.counts = { failed: 1, uncertain: 0, attempting: 0, skipped: 0 };
  h.history = [
    {
      id: "w39",
      week_key: "2026-W39",
      status: "needs_review",
      sent_count: 0,
      recipient_count: 1,
      last_error: "Provider returned HTTP 403",
      last_error_status: 403,
    },
    {
      id: "w38",
      week_key: "2026-W38",
      status: "failed",
      sent_count: 0,
      recipient_count: 1,
      last_error:
        "Recorded as sent, but only 0 of 1 recipients were delivered.",
      last_error_status: null,
    },
    {
      id: "w33",
      week_key: "2026-W33",
      status: "sent",
      sent_count: 1,
      recipient_count: 1,
      last_error: null,
      last_error_status: null,
    },
  ];
  h.current = { ...failedW39 };
  h.respond = (op) => {
    if (op.table === "newsletter_deliveries") {
      const state = op.filters.find(
        (f) => f[0] === "eq" && f[1] === "status",
      )?.[2] as string;
      return { data: null, count: h.counts[state] ?? 0, error: null };
    }
    if (
      op.table === "newsletter_sends" &&
      op.filters.some((f) => f[0] === "maybeSingle")
    )
      return { data: h.current, error: null };
    if (op.table === "newsletter_sends")
      return { data: h.history, error: null };
    return { data: null, error: null };
  };
  h.rpc = (name) => {
    h.rpcCalls.push(name);
    return h.rpcResult;
  };
  vi.spyOn(window, "confirm").mockReturnValue(true);
  h.toast.mockReset();
  h.invoke.mockReset();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("NewsletterPreviewCard delivery truth", () => {
  it("explains missing newsletter columns without composing, sending, cancelling or falling back", async () => {
    h.respond = () => ({
      data: null,
      error: {
        code: "42703",
        message: "column newsletter_sends.last_error does not exist",
      },
    });
    renderCard();
    expect(
      (await screen.findAllByText("Backend update pending")).length,
    ).toBeGreaterThan(0);
    expect(
      screen.queryByRole("button", {
        name: /Compose preview|Regenerate|Retry failed|Resume delivery|Cancel this week's send/,
      }),
    ).not.toBeInTheDocument();
    expect(h.invoke).not.toHaveBeenCalled();
    expect(h.rpcCalls).toEqual([]);
    expect(
      h.ops.every(
        (op) =>
          op.action === "select" &&
          op.table === "newsletter_sends" &&
          op.columns?.includes("last_error"),
      ),
    ).toBe(true);
  });

  it("locks retry after discovering the missing retry function and never invokes email delivery", async () => {
    h.rpcResult = {
      data: null,
      error: {
        code: "PGRST202",
        message:
          "Could not find the function public.newsletter_retry_failed_delivery in the schema cache",
      },
    };
    renderCard();
    fireEvent.click(
      await screen.findByRole("button", { name: /Retry failed recipients/ }),
    );
    expect(
      await screen.findByText("Backend update pending"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Retry failed recipients/ }),
    ).toBeDisabled();
    expect(h.invoke).not.toHaveBeenCalled();
  });

  it("does not resume an expired send while delivery receipts are unavailable", async () => {
    h.current = {
      ...failedW39,
      status: "sending",
      last_error: null,
      last_error_status: null,
      delivery_lease_until: "2020-01-01T00:00:00Z",
    };
    const respond = h.respond;
    h.respond = (op) =>
      op.table === "newsletter_deliveries"
        ? { data: null, error: { message: "Receipt read failed" } }
        : respond(op);
    renderCard();
    expect(
      await screen.findByText(/Delivery receipts could not be loaded/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Resume delivery/ }),
    ).toBeDisabled();
    expect(h.invoke).not.toHaveBeenCalled();
  });
  it("shows counts, the provider error in plain English and what to do", async () => {
    renderCard();
    expect(
      await screen.findByText("Delivery stopped · 0 of 1 delivered"),
    ).toBeInTheDocument();
    const alert = await screen.findByRole("alert");
    expect(
      within(alert).getByText("Resend rejected the sender (403)"),
    ).toBeInTheDocument();
    expect(
      within(alert).getByText(/Verify m\.brianhanson\.com in Resend/),
    ).toBeInTheDocument();
    const select = h.ops.find(
      (op) =>
        op.table === "newsletter_sends" && op.columns?.includes("sent_count"),
    );
    expect(select?.columns).toContain("recipient_count");
  });

  it("lists recent weeks with honest labels", async () => {
    renderCard();
    expect(await screen.findByText("Last 3 weeks")).toBeInTheDocument();
    expect(screen.getByText("Not delivered · 0 of 1")).toBeInTheDocument();
    expect(screen.getByText("Sent · 1 of 1 delivered")).toBeInTheDocument();
    expect(
      screen.getByText("Recorded as sent, but not delivered"),
    ).toBeInTheDocument();
  });

  it("retries failed recipients after confirmation and reports the result", async () => {
    h.rpcResult = {
      data: { ok: true, state: "sending", reset: 1 },
      error: null,
    };
    h.invoke.mockResolvedValue({
      data: { ok: true, state: "sent", sent: 1, recipients: 1 },
      error: null,
    });
    renderCard();
    fireEvent.click(
      await screen.findByRole("button", { name: /Retry failed recipients/ }),
    );
    await waitFor(() =>
      expect(h.toast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Delivered",
          description: "Sent · 1 of 1 delivered.",
        }),
      ),
    );
    expect(window.confirm).toHaveBeenCalled();
    expect(h.rpcCalls).toContain("newsletter_retry_failed_delivery");
    expect(h.invoke).toHaveBeenCalledWith("send-weekly-newsletter", {
      body: { send_id: failedW39.id },
    });
  });

  it("hides retry while any recipient has an unknown outcome", async () => {
    h.counts = { failed: 1, uncertain: 1, attempting: 0, skipped: 0 };
    renderCard();
    await screen.findByText(
      "1 rejected · 1 unknown · 0 unsubscribed before delivery",
    );
    expect(
      screen.queryByRole("button", { name: /Retry failed recipients/ }),
    ).not.toBeInTheDocument();
  });

  it("never offers retry for a legacy send without receipts", async () => {
    h.current = {
      ...failedW39,
      status: "failed",
      from_address: null,
      last_error:
        "Recorded as sent, but only 0 of 1 recipients were delivered.",
      last_error_status: null,
    };
    renderCard();
    expect(
      (await screen.findAllByText("Not delivered · 0 of 1")).length,
    ).toBeGreaterThan(0);
    await waitFor(() =>
      expect(h.ops.some((op) => op.table === "newsletter_deliveries")).toBe(
        true,
      ),
    );
    expect(
      screen.queryByRole("button", { name: /Retry failed recipients/ }),
    ).not.toBeInTheDocument();
  });

  it("shows a fully delivered week as sent with counts", async () => {
    h.current = {
      ...failedW39,
      status: "sent",
      sent_count: 1,
      last_error: null,
      last_error_status: null,
    };
    renderCard();
    expect(
      (await screen.findAllByText("Sent · 1 of 1 delivered")).length,
    ).toBeGreaterThan(0);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
