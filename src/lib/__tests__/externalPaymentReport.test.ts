import { describe, expect, it, vi } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
import {
  externalPaymentMoney,
  externalPaymentStatusSchema,
} from "../externalPayments";

describe("external payment reporting", () => {
  it("formats large totals without losing integer precision", () => {
    expect(externalPaymentMoney("90071992547409931", "USD")).toBe(
      "USD 900,719,925,474,099.31",
    );
  });
  it("uses Stripe charge units for zero/three-decimal and special currencies", () => {
    expect(externalPaymentMoney("997", "JPY")).toBe("JPY 997");
    expect(externalPaymentMoney("1234", "KWD")).toBe("KWD 1.234");
    expect(externalPaymentMoney("50000", "ISK")).toBe("ISK 500.00");
    expect(externalPaymentMoney("50000", "UGX")).toBe("UGX 500.00");
  });
  it("does not accept automatic claims of verified coverage", () => {
    const status = {
      configured: true,
      enabled: true,
      mode: "test",
      scope: "self",
      mapped_prices: 1,
      api_version: "2025-03-31.basil",
      destinations: ["pushten"],
      coverage_verified: false,
    };
    expect(externalPaymentStatusSchema.safeParse(status).success).toBe(true);
    expect(
      externalPaymentStatusSchema.safeParse({
        ...status,
        coverage_verified: true,
      }).success,
    ).toBe(false);
  });
});
