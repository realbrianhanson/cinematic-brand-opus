// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import OfferJourneyReadiness from "../offers/OfferJourneyReadiness";
import type { OfferHealth } from "@/lib/offers";

vi.mock("@/lib/router-compat", () => ({
  Link: ({ to, children }: { to: string; children: React.ReactNode }) => (
    <a href={to}>{children}</a>
  ),
}));
afterEach(cleanup);
const data: OfferHealth = {
  payments_ready: false,
  secret_configured: false,
  webhook_configured: false,
  mode: "unconfigured",
  webhook_url: "",
  delivery_ready: false,
};
const health = { isPending: false, isError: false, isFetching: false, data };

describe("customer journey readiness", () => {
  it("surfaces missing delivery for a free offer without implying payment is needed", () => {
    render(
      <OfferJourneyReadiness
        external={false}
        paid={false}
        health={health}
        onRetry={vi.fn()}
        hasFollowUp={false}
      />,
    );
    expect(screen.getByText(/Download email is not configured/)).toBeTruthy();
    expect(screen.queryByText(/Paid checkout is unavailable/)).toBeNull();
  });
  it("distinguishes unknown readiness from missing configuration and offers a read-only retry", () => {
    const retry = vi.fn();
    render(
      <OfferJourneyReadiness
        external={false}
        paid
        health={{ ...health, isError: true }}
        onRetry={retry}
        hasFollowUp={false}
      />,
    );
    expect(screen.getByText(/Readiness is unknown/)).toBeTruthy();
    expect(screen.queryByText(/Download email is not configured/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Check setup again" }));
    expect(retry).toHaveBeenCalledOnce();
  });
  it("does not expose irrelevant native setup warnings for an external listing", () => {
    render(
      <OfferJourneyReadiness
        external
        paid
        health={health}
        onRetry={vi.fn()}
        hasFollowUp
      />,
    );
    expect(
      screen.getByText(/local preview does not verify those steps/),
    ).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
    expect(
      screen.queryByText(
        /not configured|Paid checkout is unavailable|selected follow-up/,
      ),
    ).toBeNull();
  });
});
