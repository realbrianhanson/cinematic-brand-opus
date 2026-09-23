import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";

// Not yet in the generated types; regenerate types.ts after the migration.
const untyped = supabase as unknown as {
  rpc: (
    fn: "admin_overview_snapshot",
  ) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
};
const count = z.number().int().nonnegative();
const attentionItem = z.object({
  key: z.string().min(1),
  severity: z.enum(["high", "medium", "low"]),
  count,
  message: z.string().min(1),
  detail: z.string().nullable(),
  // Internal admin routes only; never an arbitrary URL from the database.
  link: z.string().regex(/^\/admin(?:[/?#]|$)/),
});
const snapshotSchema = z.object({
  generated_at: z.string(),
  counts: z.object({
    inquiries: count,
    published: count,
    drafts: count,
    scheduled: count,
    overdue: count,
    subscribers: count,
    pending_subscribers: count,
    shop: count,
    paid_orders: count,
    test_paid_orders: count,
    unknown_paid_orders: count,
    free_claims: count,
    native_paid_offers: count,
    queue_errors: count,
    stale_pages: count,
    // null until migration 20260923130000 adds the hold columns.
    held_posts: count.nullable(),
    contradicted_live_posts: count.nullable(),
  }),
  recent_posts: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      status: z.string(),
      updated_at: z.string(),
    }),
  ),
  attention: z.array(attentionItem),
});

export type AttentionItem = z.infer<typeof attentionItem>;
export type DashboardOverview = ReturnType<typeof toOverview>;

function toOverview(snapshot: z.infer<typeof snapshotSchema>) {
  const c = snapshot.counts;
  return {
    generatedAt: snapshot.generated_at,
    inquiries: c.inquiries,
    published: c.published,
    drafts: c.drafts,
    scheduled: c.scheduled,
    overdue: c.overdue,
    subscribers: c.subscribers,
    pendingSubscribers: c.pending_subscribers,
    shop: c.shop,
    /** Fulfilled live-mode payments only. */
    paidOrders: c.paid_orders,
    testPaidOrders: c.test_paid_orders,
    unknownPaidOrders: c.unknown_paid_orders,
    freeClaims: c.free_claims,
    nativePaidOffers: c.native_paid_offers,
    queueErrors: c.queue_errors,
    stalePages: c.stale_pages,
    heldPosts: c.held_posts,
    contradictedLivePosts: c.contradicted_live_posts,
    recentPosts: snapshot.recent_posts,
    attention: snapshot.attention,
  };
}

/**
 * One admin-only round trip (admin_overview_snapshot, migration
 * 20260923150000) replaces the 11 count requests, the stale-pages count and
 * the recent-posts request the Overview used to fire on every load.
 */
export async function loadDashboardOverview() {
  const { data, error } = await untyped.rpc("admin_overview_snapshot");
  if (error) throw new Error(error.message);
  const parsed = snapshotSchema.safeParse(data);
  // Never manufacture zeroes from a partial or unexpected response.
  if (!parsed.success)
    throw new Error("A dashboard count could not be verified.");
  return toOverview(parsed.data);
}
