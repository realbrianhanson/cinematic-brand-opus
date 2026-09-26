import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";

export type ConversionDays = 7 | 30 | 90;
export function conversionSearch(raw: Record<string, unknown>): {
  days: ConversionDays;
} {
  return {
    days:
      raw.days === 7 || raw.days === "7"
        ? 7
        : raw.days === 90 || raw.days === "90"
          ? 90
          : 30,
  };
}

const count = z.number().int().nonnegative();
const outcomes = {
  outbound_sessions: count,
  free_claim_sessions: count,
  paid_order_sessions: count,
};
export const conversionReportSchema = z.object({
  generated_at: z.string().datetime({ offset: true }),
  measurement_started_at: z.string().datetime({ offset: true }),
  range: z.object({
    start: z.string(),
    end: z.string(),
    timezone: z.literal("UTC"),
  }),
  summary: z.object({
    measured_sessions: count,
    page_views: count,
    shop_sessions: count,
    offer_sessions: count,
    outbound_sessions: count,
    attributed_free_claim_sessions: count,
    attributed_paid_order_sessions: count,
  }),
  first_ai_build: z
    .object({
      visit_sessions: count,
      plan_sessions: count,
      copy_sessions: count,
      download_sessions: count,
      training_sessions: count,
    })
    .optional(),
  native_totals: z.object({
    free_claims: count,
    paid_orders: count,
    test_paid_orders: count,
    unknown_mode_paid_orders: count,
    refunded_orders: count,
    download_links_issued: count,
    revenue_by_currency: z.array(
      z.object({
        currency: z.string().regex(/^[a-zA-Z]{3}$/),
        amount_minor: count,
      }),
    ),
  }),
  coverage: z.object({
    session_retention_days: count,
    unattributed_free_claims: count,
    unattributed_paid_orders: count,
  }),
  daily: z.array(z.object({ date: z.string(), sessions: count, ...outcomes })),
  sources: z.array(
    z.object({
      source: z.string(),
      medium: z.string(),
      campaign: z.string().nullable(),
      sessions: count,
      shop_sessions: count,
      offer_sessions: count,
      ...outcomes,
      free_claims: count,
      paid_orders: count,
    }),
  ),
  offers: z.array(
    z.object({
      offer_id: z.string().uuid(),
      title: z.string(),
      slug: z.string(),
      checkout_mode: z.enum(["native", "external"]),
      view_sessions: count,
      ...outcomes,
      free_claims: count,
      paid_orders: count,
    }),
  ),
  placements: z.array(
    z.object({
      placement: z.string(),
      destination: z.string(),
      clicks: count,
      sessions: count,
    }),
  ),
});
export type ConversionReport = z.infer<typeof conversionReportSchema>;

export async function loadConversionReport(
  days: ConversionDays,
): Promise<ConversionReport> {
  const { data, error } = await supabase.rpc("admin_conversion_snapshot", {
    _days: days,
  });
  if (error) throw new Error(error.message);
  return conversionReportSchema.parse(data);
}
export function conversionQueryOptions(days: ConversionDays) {
  return queryOptions({
    queryKey: ["admin-conversions", days],
    queryFn: () => loadConversionReport(days),
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });
}

export function conversionRate(outcomes: number, sessions: number): string {
  if (
    !Number.isFinite(outcomes) ||
    !Number.isFinite(sessions) ||
    sessions <= 0 ||
    outcomes < 0 ||
    outcomes > sessions
  )
    return "—";
  return new Intl.NumberFormat("en-US", {
    style: "percent",
    maximumFractionDigits: 1,
  }).format(outcomes / sessions);
}
export function conversionMoney(amountMinor: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
    currencyDisplay: "code",
  }).format(amountMinor / 100);
}
export function conversionDate(date: string, withTime = false): string {
  const parsed = new Date(date);
  if (!Number.isFinite(parsed.getTime())) return "Unavailable";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    year: "numeric",
    ...(withTime ? ({ hour: "numeric", minute: "2-digit" } as const) : {}),
  }).format(parsed);
}
export function conversionLabel(value: string): string {
  return value
    .replace(/[_-]/g, " ")
    .replace(/^./, (letter) => letter.toUpperCase());
}
/** conversion_record_events stores "none" when a visit carried no utm_campaign. */
export function campaignLabel(value: string | null): string {
  return !value || value === "none" ? "(no campaign)" : value;
}

const journeyIdentity = {
  parent_offer_id: z.string().uuid(),
  parent_title: z.string(),
  offer_id: z.string().uuid(),
  title: z.string(),
};
export const offerJourneyReportSchema = z.object({
  generated_at: z.string().datetime({ offset: true }),
  measurement_started_at: z.string().datetime({ offset: true }),
  range: z.object({
    start: z.string(),
    end: z.string(),
    timezone: z.literal("UTC"),
  }),
  steps: z.array(
    z.object({
      ...journeyIdentity,
      view_sessions: count,
      continue_sessions: count,
      decline_sessions: count,
      free_claim_sessions: count,
      paid_order_sessions: count,
    }),
  ),
  native_steps: z.array(
    z.object({
      ...journeyIdentity,
      free_claims: count,
      paid_orders: count,
      test_paid_orders: count,
      unknown_mode_paid_orders: count,
      refunded_orders: count,
      revenue_by_currency: z.array(
        z.object({
          currency: z.string().regex(/^[a-zA-Z]{3}$/),
          amount_minor: count,
        }),
      ),
    }),
  ),
});
export type OfferJourneyReport = z.infer<typeof offerJourneyReportSchema>;
export function offerJourneyQueryOptions(days: ConversionDays) {
  return queryOptions({
    queryKey: ["admin-offer-journey", days],
    queryFn: async (): Promise<OfferJourneyReport> => {
      const { data, error } = await supabase.rpc(
        "admin_offer_journey_snapshot",
        { _days: days },
      );
      if (error) throw new Error(error.message);
      return offerJourneyReportSchema.parse(data);
    },
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });
}
