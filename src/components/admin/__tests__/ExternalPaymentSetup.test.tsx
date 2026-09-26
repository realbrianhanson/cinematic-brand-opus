// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
const api = vi.hoisted(() => ({ rpc: vi.fn(), invoke: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: api.rpc, functions: { invoke: api.invoke } },
}));
import ExternalPaymentSetup from "../ExternalPaymentSetup";
const count = {
  payments: 0,
  unrefunded_payments: 0,
  partial_refund_payments: 0,
  full_refund_payments: 0,
  revenue_by_currency: [],
};
const report = {
  generated_at: "2026-09-26T12:00:00Z",
  range: {
    start: "2026-09-01T00:00:00Z",
    end: "2026-09-26T12:00:00Z",
    timezone: "UTC",
  },
  coverage: {
    scope: "verified_callbacks_only",
    complete: false,
    historical_backfill: false,
    browser_attribution: false,
  },
  live: count,
  test: count,
  destinations: [],
  accepted_event_count: 0,
  accepted_event_count_in_range: 0,
  last_received_at: null,
  last_processed_at: null,
  latest_events: [],
};
const status = {
  configured: false,
  enabled: false,
  mode: null,
  scope: null,
  mapped_prices: 0,
  api_version: "2025-03-31.basil",
  destinations: [],
  coverage_verified: false,
};
function show() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <ExternalPaymentSetup days={30} />
    </QueryClientProvider>,
  );
}
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
describe("external payment setup and reporting", () => {
  it("shows unconfigured intake honestly without activating it", async () => {
    api.rpc.mockResolvedValue({ data: report, error: null });
    api.invoke.mockResolvedValue({ data: status, error: null });
    show();
    expect(await screen.findByText("Account setup required")).toBeVisible();
    expect(
      screen.getByText(/No accepted live external payments/),
    ).toBeVisible();
    expect(
      screen.getByText(/do not establish complete provider coverage/),
    ).toBeVisible();
    expect(api.invoke).toHaveBeenCalledWith(
      "external-stripe-webhook?action=status",
      { body: {} },
    );
    expect(api.rpc).toHaveBeenCalledWith("admin_external_payment_snapshot", {
      _days: 30,
    });
  });
  it("shows confirmed gross, refunds and net separately from test payments", async () => {
    api.invoke.mockResolvedValue({
      data: {
        ...status,
        configured: true,
        enabled: true,
        mode: "live",
        scope: "self",
        mapped_prices: 1,
      },
      error: null,
    });
    api.rpc.mockResolvedValue({
      data: {
        ...report,
        live: {
          ...count,
          payments: 2,
          partial_refund_payments: 1,
          revenue_by_currency: [
            {
              currency: "USD",
              gross_minor: "2000",
              refunded_minor: "500",
              net_minor: "1500",
            },
          ],
        },
        test: { ...count, payments: 7 },
      },
      error: null,
    });
    show();
    expect(await screen.findByText("Live intake enabled")).toBeVisible();
    expect(screen.getByText("USD 20.00")).toBeVisible();
    expect(screen.getByText("USD 5.00")).toBeVisible();
    expect(screen.getByText("USD 15.00")).toBeVisible();
    expect(screen.getByText("7")).toBeVisible();
    expect(screen.getByText(/Test payments, excluded/)).toBeVisible();
  });
  it("preserves an unavailable report as an error and supports retry", async () => {
    api.invoke.mockResolvedValue({ data: status, error: null });
    api.rpc
      .mockResolvedValueOnce({ data: null, error: { message: "offline" } })
      .mockResolvedValue({ data: report, error: null });
    show();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "could not be loaded",
    );
    expect(screen.queryByText(/No accepted live external payments/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(
      await screen.findByText(/No accepted live external payments/),
    ).toBeVisible();
  });
});
