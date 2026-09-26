import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";

const itemSchema = z.object({
  offer_id: z.string().uuid(),
  role: z.enum(["primary", "bump"]),
  title: z.string(),
  amount_minor: z.number().int().nonnegative(),
  currency: z.string(),
  file_name: z.string().nullable(),
});
export const supportOrdersSchema = z.object({
  total: z.number().int().nonnegative(),
  items: z
    .array(
      z.object({
        id: z.string().uuid(),
        offer_id: z.string().uuid(),
        parent_order_id: z.string().uuid().nullable(),
        title: z.string(),
        name: z.string().nullable(),
        email: z.string(),
        status: z.enum([
          "pending",
          "fulfilled",
          "failed",
          "expired",
          "refunded",
        ]),
        amount_minor: z.number().int().nonnegative(),
        currency: z.string(),
        created_at: z.string(),
        fulfilled_at: z.string().nullable(),
        payment_mode: z.enum(["live", "test", "unknown"]),
        download_link_issued_at: z.string().nullable(),
        items: z.array(itemSchema).max(2),
        delivery: z
          .object({
            kind: z.enum(["initial", "recovery"]),
            status: z.enum([
              "pending",
              "sending",
              "sent",
              "needs_review",
              "failed",
            ]),
            attempts: z.number(),
            created_at: z.string(),
            accepted_at: z.string().nullable(),
          })
          .nullable(),
      }),
    )
    .max(25),
});
export type SupportOrder = z.infer<typeof supportOrdersSchema>["items"][number];

export async function loadSupportOrders(
  query: string,
  status: string,
  kind: string,
  page: number,
  signal: AbortSignal,
) {
  const { data, error } = await supabase
    .rpc("admin_offer_order_support", {
      _query: query,
      _status: status,
      _kind: kind,
      _page: page,
    })
    .abortSignal(AbortSignal.any([signal, AbortSignal.timeout(20000)]));
  if (error) throw error;
  return supportOrdersSchema.parse(data);
}
export function orderPaymentLabel(
  order: Pick<SupportOrder, "amount_minor" | "payment_mode" | "status">,
) {
  if (order.amount_minor === 0) return "Free resource";
  if (order.payment_mode === "test") return "Test payment · no live revenue";
  if (order.payment_mode === "live") return "Verified live payment";
  return order.status === "pending"
    ? "Payment not confirmed"
    : "Payment mode unverified";
}
export function orderAccessLabel(status: SupportOrder["status"]) {
  return status === "fulfilled"
    ? "Download access available"
    : status === "refunded"
      ? "Download access revoked"
      : "No download access";
}
