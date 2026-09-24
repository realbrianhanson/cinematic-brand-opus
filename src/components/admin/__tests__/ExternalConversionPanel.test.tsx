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
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc } }));
import ExternalConversionPanel from "../ExternalConversionPanel";
import { externalConversionColumns } from "@/lib/externalConversions";
const emptyReport = {
  generated_at: "2026-01-02T12:00:00Z",
  range: {
    start: "2026-01-01T00:00:00Z",
    end: "2026-01-02T12:00:00Z",
    timezone: "UTC",
  },
  registrations: 0,
  purchases: 0,
  excluded_test_or_unknown: 0,
  cancelled_or_refunded: 0,
  without_campaign: 0,
  campaign_groups: 0,
  revenue_by_currency: [],
  campaigns: [],
  imports: [],
};
const csv =
  externalConversionColumns.join(",") +
  "\nprovider-export,reg-1,registration,summit,2026-01-01T10:00:00Z,2026-01-01T12:00:00Z,confirmed,live,,,email,newsletter,fall\n";
function show() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <ExternalConversionPanel days={30} />
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  rpc.mockReset();
  rpc.mockImplementation(async (name: string) => ({
    data:
      name === "admin_external_conversion_snapshot"
        ? emptyReport
        : {
            id: "10000000-0000-4000-8000-000000000001",
            inserted: 1,
            updated: 0,
            unchanged: 0,
            stale: 0,
          },
    error: null,
  }));
});
afterEach(cleanup);
describe("external reconciliation panel", () => {
  it("labels absent imports and provider coverage without inventing conversions", async () => {
    show();
    expect(
      await screen.findByText(/No provider export has been imported/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/No provider is connected automatically/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/No external session conversion rate is calculated/),
    ).toBeInTheDocument();
  });
  it("requires a reviewed CSV, a safe reference and explicit verification before import", async () => {
    show();
    const file = new File([csv], "provider.csv", { type: "text/csv" });
    Object.defineProperty(file, "text", { value: async () => csv });
    fireEvent.change(screen.getByLabelText("Provider CSV"), {
      target: { files: [file] },
    });
    const button = await screen.findByRole("button", {
      name: "Import 1 verified rows",
      hidden: true,
    });
    expect(button).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Export reference"), {
      target: { value: "fall-2026" },
    });
    expect(button).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { hidden: true }));
    expect(button).toBeEnabled();
    fireEvent.click(button);
    expect(
      await screen.findByText(/Import saved: 1 added/),
    ).toBeInTheDocument();
    expect(rpc).toHaveBeenCalledWith(
      "admin_import_external_conversions",
      expect.objectContaining({ _reference: "fall-2026" }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("button", {
          name: "Import 1 verified rows",
          hidden: true,
        }),
      ).not.toBeInTheDocument(),
    );
  });
  it("rejects contact columns before anything is submitted", async () => {
    show();
    const text = csv.replace("provider,record_id", "email,record_id");
    const file = new File([text], "contacts.csv", { type: "text/csv" });
    Object.defineProperty(file, "text", { value: async () => text });
    fireEvent.change(screen.getByLabelText("Provider CSV"), {
      target: { files: [file] },
    });
    expect(
      await screen.findByRole("alert", { hidden: true }),
    ).toHaveTextContent(/Remove contact details/);
    expect(
      rpc.mock.calls.some(
        ([name]) => name === "admin_import_external_conversions",
      ),
    ).toBe(false);
  });
  it("keeps the export available for an idempotent retry when the import fails", async () => {
    rpc.mockImplementation(async (name: string) => ({
      data: name === "admin_external_conversion_snapshot" ? emptyReport : null,
      error:
        name === "admin_external_conversion_snapshot"
          ? null
          : { message: "Import unavailable; retry safely." },
    }));
    show();
    const file = new File([csv], "provider.csv");
    Object.defineProperty(file, "text", { value: async () => csv });
    fireEvent.change(screen.getByLabelText("Provider CSV"), {
      target: { files: [file] },
    });
    const button = await screen.findByRole("button", {
      name: "Import 1 verified rows",
      hidden: true,
    });
    fireEvent.change(screen.getByLabelText("Export reference"), {
      target: { value: "fall-2026" },
    });
    fireEvent.click(screen.getByRole("checkbox", { hidden: true }));
    fireEvent.click(button);
    expect(
      await screen.findByRole("alert", { hidden: true }),
    ).toHaveTextContent(/retry safely/);
    expect(button).toBeEnabled();
  });
});
