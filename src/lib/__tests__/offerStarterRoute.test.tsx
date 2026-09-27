// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ search: {} as Record<string, unknown> }));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute:
    () =>
    (options: {
      validateSearch: (search: Record<string, unknown>) => unknown;
    }) => ({
      options,
      useSearch: () => options.validateSearch(state.search),
    }),
}));
vi.mock("@/components/admin/OfferEditor", () => ({
  default: ({ starter }: { starter: string }) => <p>Editor: {starter}</p>,
}));
vi.mock("@/pages/AdminFunnelBuilder", () => ({
  default: () => <h1>Choose your funnel</h1>,
}));
import { Route } from "@/routes/admin.offers.new";

const NewOffer = Route.options.component as React.ComponentType;
afterEach(cleanup);

describe("new offer route", () => {
  it.each([undefined, "not-a-starter", ["sales"]])(
    "opens the common chooser for missing or invalid starter %s",
    (starter) => {
      state.search = { starter };
      render(<NewOffer />);
      expect(
        screen.getByRole("heading", { name: "Choose your funnel" }),
      ).toBeTruthy();
      expect(screen.queryByText(/Editor:/)).toBeNull();
    },
  );
  it.each(["lead-magnet", "sales", "external", "upsell"])(
    "passes a valid %s choice to the editor",
    (starter) => {
      state.search = { starter };
      render(<NewOffer />);
      expect(screen.getByText(`Editor: ${starter}`)).toBeTruthy();
    },
  );
});
