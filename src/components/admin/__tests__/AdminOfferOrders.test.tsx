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
import type { SupportOrder } from "@/lib/adminOfferOrders";

const { loadSupportOrders } = vi.hoisted(() => ({
  loadSupportOrders: vi.fn(),
}));
vi.mock("@/lib/adminOfferOrders", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/adminOfferOrders")>()),
  loadSupportOrders,
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/lib/router-compat", () => ({
  Link: ({
    to,
    children,
    ...props
  }: React.PropsWithChildren<{ to: string }>) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));
import AdminOfferOrders from "../AdminOfferOrders";

const baseOrder: SupportOrder = {
  id: "10000000-0000-4000-8000-000000000001",
  offer_id: "20000000-0000-4000-8000-000000000001",
  parent_order_id: null,
  title: "Starter workshop",
  name: "Sample Buyer",
  email: "buyer@example.test",
  status: "fulfilled",
  amount_minor: 3900,
  currency: "usd",
  created_at: "2026-09-27T12:00:00Z",
  fulfilled_at: "2026-09-27T12:01:00Z",
  payment_mode: "live",
  download_link_issued_at: null,
  items: [
    {
      offer_id: "20000000-0000-4000-8000-000000000001",
      title: "Starter workshop",
      role: "primary",
      amount_minor: 2900,
      currency: "usd",
      file_name: "workshop.pdf",
    },
    {
      offer_id: "20000000-0000-4000-8000-000000000002",
      title: "Practice templates",
      role: "bump",
      amount_minor: 1000,
      currency: "usd",
      file_name: "templates.zip",
    },
  ],
  delivery: {
    kind: "recovery",
    status: "failed",
    attempts: 3,
    created_at: "2026-09-27T12:02:00Z",
    accepted_at: null,
  },
};
const clients: QueryClient[] = [];
function mount() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  clients.push(client);
  return render(
    <QueryClientProvider client={client}>
      <AdminOfferOrders />
    </QueryClientProvider>,
  );
}
function articleFor(title: string) {
  return within(
    screen.getByRole("heading", { name: title }).closest("article")!,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  loadSupportOrders.mockResolvedValue({ total: 1, items: [baseOrder] });
});
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
});

describe("order and access support", () => {
  it("separates live, test, unverified, pending and free records", async () => {
    const records: SupportOrder[] = [
      baseOrder,
      {
        ...baseOrder,
        id: "10000000-0000-4000-8000-000000000002",
        title: "Test checkout",
        payment_mode: "test",
      },
      {
        ...baseOrder,
        id: "10000000-0000-4000-8000-000000000003",
        title: "Historical payment",
        payment_mode: "unknown",
      },
      {
        ...baseOrder,
        id: "10000000-0000-4000-8000-000000000004",
        title: "Unpaid checkout",
        payment_mode: "unknown",
        status: "pending",
        fulfilled_at: null,
      },
      {
        ...baseOrder,
        id: "10000000-0000-4000-8000-000000000005",
        title: "Free checklist",
        amount_minor: 0,
        payment_mode: "unknown",
      },
    ];
    loadSupportOrders.mockResolvedValue({ total: 5, items: records });
    mount();
    await screen.findByText("5 matching records");
    expect(
      articleFor("Starter workshop").getByText("Verified live payment"),
    ).toBeInTheDocument();
    expect(
      articleFor("Test checkout").getByText("Test payment · no live revenue"),
    ).toBeInTheDocument();
    expect(
      articleFor("Historical payment").getByText("Payment mode unverified"),
    ).toBeInTheDocument();
    expect(
      articleFor("Unpaid checkout").getByText("Payment not confirmed"),
    ).toBeInTheDocument();
    expect(
      articleFor("Unpaid checkout").getByText("No download access"),
    ).toBeInTheDocument();
    expect(
      articleFor("Free checklist").getByText("Free resource"),
    ).toBeInTheDocument();
  });

  it("shows the purchased extra and failed delivery without removing valid access", async () => {
    mount();
    await screen.findByRole("heading", { name: "Starter workshop" });
    fireEvent.click(screen.getByText("View order details"));
    const table = screen.getByRole("table", { name: "Purchased items" });
    const rows = within(table).getAllByRole("row");
    expect(rows).toHaveLength(3);
    expect(within(rows[1]).getByText("Primary offer")).toBeInTheDocument();
    expect(within(rows[1]).getByText("$29.00")).toBeInTheDocument();
    expect(within(rows[2]).getByText("Optional extra")).toBeInTheDocument();
    expect(within(rows[2]).getByText("$10.00")).toBeInTheDocument();
    expect(
      within(rows[2]).getByRole("link", { name: "Practice templates" }),
    ).toHaveAttribute(
      "href",
      "/admin/offers/20000000-0000-4000-8000-000000000002/edit",
    );
    expect(screen.getByText("templates.zip")).toBeInTheDocument();
    expect(screen.getByText("$39.00 total")).toBeInTheDocument();
    expect(
      screen.getByText("Delivery failed · recovery · 3 attempts"),
    ).toBeInTheDocument();
    expect(screen.getByText("Download access available")).toBeInTheDocument();
    expect(screen.getByText("Not recorded")).toBeInTheDocument();
    expect(
      screen.getByText(/not proof of a completed download/),
    ).toBeInTheDocument();
  });

  it("keeps historical snapshots visible and labels refunded access as revoked", async () => {
    loadSupportOrders.mockResolvedValue({
      total: 1,
      items: [{ ...baseOrder, status: "refunded", items: [], delivery: null }],
    });
    mount();
    await screen.findByRole("heading", { name: "Starter workshop" });
    fireEvent.click(screen.getByText("View order details"));
    expect(screen.getByText("Download access revoked")).toBeInTheDocument();
    expect(
      screen.getByText(/Historical single-item order/),
    ).toBeInTheDocument();
    expect(screen.getByText("No delivery record")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Starter workshop" }),
    ).toHaveAttribute(
      "href",
      "/admin/offers/20000000-0000-4000-8000-000000000001/edit",
    );
  });

  it("queries each page and resets pagination when search or filters change", async () => {
    loadSupportOrders.mockResolvedValue({ total: 51, items: [baseOrder] });
    mount();
    await screen.findByText("Page 1 of 3");
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() =>
      expect(loadSupportOrders).toHaveBeenLastCalledWith(
        "",
        "all",
        "all",
        1,
        expect.any(AbortSignal),
      ),
    );
    fireEvent.change(screen.getByRole("textbox", { name: "Search orders" }), {
      target: { value: "  buyer@example.test  " },
    });
    await waitFor(() =>
      expect(loadSupportOrders).toHaveBeenLastCalledWith(
        "buyer@example.test",
        "all",
        "all",
        0,
        expect.any(AbortSignal),
      ),
    );
    fireEvent.change(screen.getByRole("combobox", { name: "Order status" }), {
      target: { value: "failed" },
    });
    await waitFor(() =>
      expect(loadSupportOrders).toHaveBeenLastCalledWith(
        "buyer@example.test",
        "failed",
        "all",
        0,
        expect.any(AbortSignal),
      ),
    );
    await screen.findByText("Page 1 of 3");
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await screen.findByText("Page 2 of 3");
    fireEvent.change(screen.getByRole("combobox", { name: "Order type" }), {
      target: { value: "paid" },
    });
    await waitFor(() =>
      expect(loadSupportOrders).toHaveBeenLastCalledWith(
        "buyer@example.test",
        "failed",
        "paid",
        0,
        expect.any(AbortSignal),
      ),
    );
    await screen.findByText("Page 1 of 3");
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await screen.findByText("Page 2 of 3");
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Next" })).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await screen.findByText("Page 3 of 3");
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  });

  it("offers a retry after failure instead of implying an empty order history", async () => {
    loadSupportOrders.mockRejectedValueOnce(
      new Error("private backend detail"),
    );
    mount();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This information could not be loaded.",
    );
    expect(screen.queryByText(/No orders or leads/)).not.toBeInTheDocument();
    expect(
      screen.queryByText(/private backend detail/),
    ).not.toBeInTheDocument();
    expect(loadSupportOrders).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await screen.findByRole("heading", { name: "Starter workshop" });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(loadSupportOrders).toHaveBeenCalledTimes(2);
  });

  it("refreshes the current query and shows a truthful empty state", async () => {
    mount();
    await screen.findByText("1 matching record");
    loadSupportOrders.mockResolvedValueOnce({ total: 0, items: [] });
    fireEvent.click(screen.getByRole("button", { name: "Refresh orders" }));
    await screen.findByText("No orders or leads in this view");
    expect(
      screen.queryByRole("heading", { name: "Starter workshop" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(/does not create sample orders/),
    ).toBeInTheDocument();
    expect(loadSupportOrders).toHaveBeenCalledTimes(2);
  });
});
