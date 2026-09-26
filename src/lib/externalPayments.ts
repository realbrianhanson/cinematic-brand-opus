import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import type { ConversionDays } from "@/lib/conversions";

const count = z.number().int().nonnegative();
const time = z.string().datetime({ offset: true });
const money = z.string().regex(/^\d+$/);
const amounts = z.object({
  currency: z.string().regex(/^[A-Z]{3}$/),
  gross_minor: money,
  refunded_minor: money,
  net_minor: money,
});
const totals = z.object({
  payments: count,
  unrefunded_payments: count,
  partial_refund_payments: count,
  full_refund_payments: count,
  revenue_by_currency: z.array(amounts),
});
export const externalPaymentReportSchema = z.object({
  generated_at: time,
  range: z.object({ start: time, end: time, timezone: z.literal("UTC") }),
  coverage: z.object({
    scope: z.literal("verified_callbacks_only"),
    complete: z.literal(false),
    historical_backfill: z.literal(false),
    browser_attribution: z.literal(false),
  }),
  live: totals,
  test: totals,
  destinations: z.array(
    amounts.extend({
      provider: z.string(),
      account_id: z.string(),
      mode: z.enum(["test", "live"]),
      destination: z.string(),
      payments: count,
    }),
  ),
  accepted_event_count: count,
  accepted_event_count_in_range: count,
  last_received_at: time.nullable(),
  last_processed_at: time.nullable(),
  latest_events: z.array(
    z.object({
      provider: z.string(),
      account_id: z.string(),
      mode: z.enum(["test", "live"]),
      event_type: z.string(),
      resolution: z.enum(["applied", "unmapped", "unsupported", "not_paid"]),
      provider_created_at: time,
      observed_at: time,
      received_at: time,
      processed_at: time,
      payment_count: count,
      inserted: count,
      updated: count,
      unchanged: count,
      refund_decreases: count,
    }),
  ),
});
export const externalPaymentStatusSchema = z.object({
  configured: z.boolean(),
  enabled: z.boolean(),
  mode: z.enum(["live", "test"]).nullable(),
  scope: z.enum(["self", "connected"]).nullable(),
  mapped_prices: count,
  api_version: z.string(),
  destinations: z.array(z.string()),
  coverage_verified: z.literal(false),
});
export function externalPaymentQueryOptions(days: ConversionDays) {
  return queryOptions({
    queryKey: ["admin-external-payments", days],
    queryFn: async () => {
      const { data, error } = await supabase.rpc(
        "admin_external_payment_snapshot",
        {
          _days: days,
        },
      );
      if (error) throw new Error("External payment report is unavailable.");
      return externalPaymentReportSchema.parse(data);
    },
    staleTime: 60000,
  });
}
export function externalPaymentStatusQueryOptions() {
  return queryOptions({
    queryKey: ["admin-external-payment-status"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke(
        "external-stripe-webhook?action=status",
        { body: {} },
      );
      if (error)
        throw new Error("External payment setup status is unavailable.");
      return externalPaymentStatusSchema.parse(data);
    },
    staleTime: 60000,
    retry: false,
  });
}
/** Stripe charges use two-decimal representations for ISK/UGX, unlike ISO display defaults. */
export function externalPaymentMoney(value: string, currency: string): string {
  if (!/^\d+$/.test(value) || !/^[A-Z]{3}$/.test(currency))
    return "Unavailable";
  const digits =
    currency === "ISK" || currency === "UGX"
      ? 2
      : (new Intl.NumberFormat("en", {
          style: "currency",
          currency,
        }).resolvedOptions().maximumFractionDigits ?? 2);
  const amount = BigInt(value),
    scale = 10n ** BigInt(digits),
    whole = (amount / scale).toLocaleString("en-US");
  return `${currency} ${whole}${digits ? "." + String(amount % scale).padStart(digits, "0") : ""}`;
}
