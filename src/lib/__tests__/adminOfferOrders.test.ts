import { beforeEach, describe, expect, it, vi } from "vitest";

const { rpc, abortSignal } = vi.hoisted(() => ({
  rpc: vi.fn(),
  abortSignal: vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc } }));
import {
  loadSupportOrders,
  orderAccessLabel,
  orderPaymentLabel,
  supportOrdersSchema,
  type SupportOrder,
} from "../adminOfferOrders";

const order: SupportOrder = {
  id: "10000000-0000-4000-8000-000000000001",
  offer_id: "20000000-0000-4000-8000-000000000001",
  parent_order_id: null,
  title: "Starter workshop",
  name: null,
  email: "buyer@example.test",
  status: "fulfilled",
  amount_minor: 2900,
  currency: "usd",
  created_at: "2026-09-27T12:00:00Z",
  fulfilled_at: "2026-09-27T12:01:00Z",
  payment_mode: "unknown",
  download_link_issued_at: null,
  items: [],
  delivery: {
    kind: "recovery",
    status: "failed",
    attempts: 3,
    created_at: "2026-09-27T12:02:00Z",
    accepted_at: null,
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  rpc.mockReturnValue({ abortSignal });
  abortSignal.mockResolvedValue({
    data: { total: 1, items: [order] },
    error: null,
  });
});

describe("order support contracts", () => {
  it("accepts failed access delivery independently of fulfilled order access", () => {
    const result = supportOrdersSchema.parse({ total: 1, items: [order] });
    expect(result.items[0].delivery?.status).toBe("failed");
    expect(orderAccessLabel(result.items[0].status)).toBe(
      "Download access available",
    );
  });

  it.each(["pending", "sending", "sent", "needs_review", "failed"])(
    "accepts the backend delivery state %s",
    (status) => {
      expect(
        supportOrdersSchema.safeParse({
          total: 1,
          items: [{ ...order, delivery: { ...order.delivery, status } }],
        }).success,
      ).toBe(true);
    },
  );

  it("rejects unknown payment proof, negative totals and oversized pages", () => {
    expect(
      supportOrdersSchema.safeParse({
        total: 1,
        items: [{ ...order, payment_mode: "paid" }],
      }).success,
    ).toBe(false);
    expect(
      supportOrdersSchema.safeParse({ total: -1, items: [] }).success,
    ).toBe(false);
    expect(
      supportOrdersSchema.safeParse({
        total: 26,
        items: Array.from({ length: 26 }, () => order),
      }).success,
    ).toBe(false);
  });

  it.each([
    [0, "unknown", "fulfilled", "Free resource"],
    [2900, "test", "fulfilled", "Test payment · no live revenue"],
    [2900, "live", "fulfilled", "Verified live payment"],
    [2900, "unknown", "pending", "Payment not confirmed"],
    [2900, "unknown", "fulfilled", "Payment mode unverified"],
  ] as const)(
    "distinguishes payment evidence for %s / %s / %s",
    (amount_minor, payment_mode, status, label) => {
      expect(orderPaymentLabel({ amount_minor, payment_mode, status })).toBe(
        label,
      );
    },
  );

  it.each([
    ["fulfilled", "Download access available"],
    ["refunded", "Download access revoked"],
    ["pending", "No download access"],
    ["failed", "No download access"],
    ["expired", "No download access"],
  ] as const)("does not infer completed downloads from %s", (status, label) => {
    expect(orderAccessLabel(status)).toBe(label);
  });

  it("forwards filters and page to the restricted RPC and links cancellation", async () => {
    const controller = new AbortController();
    await expect(
      loadSupportOrders("workshop", "fulfilled", "paid", 2, controller.signal),
    ).resolves.toEqual({ total: 1, items: [order] });
    expect(rpc).toHaveBeenCalledWith("admin_offer_order_support", {
      _query: "workshop",
      _status: "fulfilled",
      _kind: "paid",
      _page: 2,
    });
    const signal = abortSignal.mock.calls[0][0] as AbortSignal;
    expect(signal.aborted).toBe(false);
    controller.abort();
    expect(signal.aborted).toBe(true);
  });

  it("surfaces backend and response-validation failures instead of an empty report", async () => {
    const error = { code: "42501", message: "Admin access required" };
    abortSignal.mockResolvedValueOnce({ data: null, error });
    await expect(
      loadSupportOrders("", "all", "all", 0, new AbortController().signal),
    ).rejects.toBe(error);
    abortSignal.mockResolvedValueOnce({
      data: {
        total: 1,
        items: [
          { ...order, delivery: { ...order.delivery, status: "delivered" } },
        ],
      },
      error: null,
    });
    await expect(
      loadSupportOrders("", "all", "all", 0, new AbortController().signal),
    ).rejects.toThrow();
  });
});
