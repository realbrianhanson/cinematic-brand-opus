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
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const h = vi.hoisted(() => ({
  loadAudience: vi.fn(),
  resendPendingConfirmations: vi.fn(),
}));
vi.mock("@/lib/newsletterAdmin", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/newsletterAdmin")>();
  return {
    ...actual,
    loadAudience: h.loadAudience,
    resendPendingConfirmations: h.resendPendingConfirmations,
  };
});
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import AudienceManager from "../AudienceManager";

const audience = {
  counts: {
    total: 6,
    confirmed: 1,
    pending: 5,
    unsubscribed: 0,
    bounced: 0,
    complained: 0,
    pending_not_emailed: 5,
  },
  matching: 2,
  rows: [
    {
      id: "a",
      email: "founder@example.com",
      status: "confirmed",
      source: "founder",
      created_at: "2026-07-20T00:00:00Z",
      confirmed_at: "2026-07-20T00:00:00Z",
      unsubscribed_at: null,
      last_confirmation_sent_at: null,
      confirmation_send_count: 0,
    },
    {
      id: "b",
      email: "reader@example.com",
      status: "pending",
      source: "final_cta",
      created_at: "2026-07-24T00:00:00Z",
      confirmed_at: null,
      unsubscribed_at: null,
      last_confirmation_sent_at: null,
      confirmation_send_count: 0,
    },
  ],
};

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <AudienceManager />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  h.loadAudience.mockReset().mockResolvedValue(audience);
  h.resendPendingConfirmations.mockReset();
});
afterEach(cleanup);

describe("AudienceManager", () => {
  it("shows status counts and the subscriber list", async () => {
    renderPage();
    expect(await screen.findByText("reader@example.com")).toBeInTheDocument();
    expect(
      screen.getByText("5 never got a confirmation email"),
    ).toBeInTheDocument();
    expect(screen.getByText("Never sent")).toBeInTheDocument();
    expect(screen.getByText("final_cta")).toBeInTheDocument();
    expect(h.loadAudience).toHaveBeenCalledWith({
      search: "",
      status: "all",
      page: 0,
    });
  });

  it("searches and filters through the admin RPC", async () => {
    renderPage();
    await screen.findByText("reader@example.com");
    fireEvent.change(screen.getByLabelText("Filter by status"), {
      target: { value: "pending" },
    });
    fireEvent.change(screen.getByLabelText("Search subscribers"), {
      target: { value: "reader" },
    });
    await waitFor(() =>
      expect(h.loadAudience).toHaveBeenLastCalledWith({
        search: "reader",
        status: "pending",
        page: 0,
      }),
    );
  });

  it("asks before resending and never sends on cancel", async () => {
    renderPage();
    fireEvent.click(
      await screen.findByRole("button", {
        name: /Resend confirmation to pending \(5\)/,
      }),
    );
    expect(
      await screen.findByText("Resend confirmation to 5 pending people?"),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(h.resendPendingConfirmations).not.toHaveBeenCalled();
  });

  it("shows the result of a successful resend", async () => {
    h.resendPendingConfirmations.mockResolvedValue({
      ok: true,
      pending: 5,
      sent: 5,
      failed: 0,
      skipped: 0,
      remaining: 0,
      error: null,
      providerStatus: null,
    });
    renderPage();
    fireEvent.click(
      await screen.findByRole("button", {
        name: /Resend confirmation to pending \(5\)/,
      }),
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Send confirmations" }),
    );
    expect(
      await screen.findByText("Sent 5 confirmation emails"),
    ).toBeInTheDocument();
  });

  it("explains a Resend domain rejection with what to do", async () => {
    h.resendPendingConfirmations.mockResolvedValue({
      ok: false,
      pending: 5,
      sent: 0,
      failed: 1,
      skipped: 0,
      remaining: 4,
      error:
        "Provider returned HTTP 403: The m.brianhanson.com domain is not verified.",
      providerStatus: 403,
    });
    renderPage();
    fireEvent.click(
      await screen.findByRole("button", {
        name: /Resend confirmation to pending \(5\)/,
      }),
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Send confirmations" }),
    );
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(
      "Resend rejected: domain not verified (403)",
    );
    expect(alert).toHaveTextContent("Verify m.brianhanson.com in Resend");
    expect(alert).toHaveTextContent("resend confirmations");
  });

  it("disables the resend action when nobody is pending", async () => {
    h.loadAudience.mockResolvedValue({
      ...audience,
      counts: { ...audience.counts, pending: 0, pending_not_emailed: 0 },
    });
    renderPage();
    const button = await screen.findByRole("button", {
      name: /Resend confirmation to pending \(0\)/,
    });
    expect(button).toBeDisabled();
  });
});
