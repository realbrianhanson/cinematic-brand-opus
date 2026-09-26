// @vitest-environment jsdom
import React from "react";
import "@testing-library/jest-dom/vitest";
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
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc } }));
import OfferJourneyMetrics from "../OfferJourneyMetrics";
import { type OfferJourneyReport } from "@/lib/conversions";
const identity = {
  parent_offer_id: "11111111-1111-4111-8111-111111111111",
  parent_title: "Starter guide",
  offer_id: "22222222-2222-4222-8222-222222222222",
  title: "Build workshop",
};
const data = (): OfferJourneyReport => ({
  generated_at: new Date().toISOString(),
  measurement_started_at: "2026-09-25T00:00:00Z",
  range: { start: "2026-09-01", end: "2026-09-25", timezone: "UTC" },
  steps: [
    {
      ...identity,
      view_sessions: 10,
      continue_sessions: 4,
      decline_sessions: 2,
      free_claim_sessions: 0,
      paid_order_sessions: 1,
    },
  ],
  native_steps: [
    {
      ...identity,
      free_claims: 0,
      paid_orders: 7,
      test_paid_orders: 1,
      unknown_mode_paid_orders: 2,
      refunded_orders: 1,
      revenue_by_currency: [
        { currency: "usd", amount_minor: 12000 },
        { currency: "eur", amount_minor: 8000 },
      ],
    },
  ],
});
function mount() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <OfferJourneyMetrics days={30} />
    </QueryClientProvider>,
  );
}
beforeEach(() => rpc.mockReset());
afterEach(cleanup);
describe("follow-up performance report", () => {
  it("keeps clicked intent, measured purchases and operational order value distinct", async () => {
    rpc.mockResolvedValue({ data: data(), error: null });
    mount();
    const measured = await screen.findByRole("region", {
      name: "Measured follow-up offer performance",
    });
    expect(within(measured).getByText("40%")).toBeVisible();
    expect(within(measured).getByText("10%")).toBeVisible();
    expect(within(measured).queryByText("70%")).not.toBeInTheDocument();
    const native = screen.getByRole("region", {
      name: "Operational follow-up orders",
    });
    expect(within(native).getByText("7")).toBeVisible();
    expect(within(native).getByText(/USD.*120.00/)).toBeVisible();
    expect(within(native).getByText(/EUR.*80.00/)).toBeVisible();
    expect(screen.getByText(/not a purchase/)).toBeVisible();
    expect(
      screen.getByText(/Earlier views are not reconstructed/),
    ).toBeVisible();
    expect(rpc).toHaveBeenCalledWith("admin_offer_journey_snapshot", {
      _days: 30,
    });
  });
  it("exposes retry after backend failure without inventing zero activity", async () => {
    rpc
      .mockResolvedValueOnce({
        data: null,
        error: { message: "Missing function" },
      })
      .mockResolvedValue({
        data: { ...data(), steps: [], native_steps: [] },
        error: null,
      });
    mount();
    await screen.findByRole("alert");
    expect(
      screen.queryByText(/No measured follow-up views/),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await screen.findByText(/No measured follow-up views/);
  });
  it("keeps the last successful report visible when refresh fails", async () => {
    rpc
      .mockResolvedValueOnce({ data: data(), error: null })
      .mockResolvedValue({ data: null, error: { message: "Offline" } });
    mount();
    await screen.findByRole("region", {
      name: "Measured follow-up offer performance",
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Refresh follow-up report" }),
    );
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "last successful follow-up report",
      ),
    );
    expect(
      screen.getByRole("region", {
        name: "Measured follow-up offer performance",
      }),
    ).toBeVisible();
  });
});
