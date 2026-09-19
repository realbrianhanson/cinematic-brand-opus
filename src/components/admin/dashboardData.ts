import { supabase } from "@/integrations/supabase/client";
export async function loadDashboardOverview() {
  const requests = {
    inquiries: supabase
      .from("speaking_inquiries")
      .select("id", { count: "exact", head: true })
      .eq("status", "new"),
    published: supabase
      .from("posts")
      .select("id", { count: "exact", head: true })
      .eq("status", "published"),
    drafts: supabase
      .from("posts")
      .select("id", { count: "exact", head: true })
      .eq("status", "draft"),
    scheduled: supabase
      .from("posts")
      .select("id", { count: "exact", head: true })
      .eq("status", "scheduled"),
    overdue: supabase
      .from("posts")
      .select("id", { count: "exact", head: true })
      .eq("status", "scheduled")
      .lt("scheduled_at", new Date().toISOString()),
    subscribers: supabase
      .from("newsletter_subscribers")
      .select("id", { count: "exact", head: true })
      .eq("status", "confirmed"),
    shop: supabase
      .from("offers")
      .select("id", { count: "exact", head: true })
      .eq("status", "published")
      .eq("show_in_shop", true)
      .eq("funnel_only", false),
    paidOrders: supabase
      .from("offer_orders")
      .select("id", { count: "exact", head: true })
      .eq("status", "fulfilled")
      .gt("amount_minor", 0),
    freeClaims: supabase
      .from("offer_orders")
      .select("id", { count: "exact", head: true })
      .eq("status", "fulfilled")
      .eq("amount_minor", 0),
    nativePaidOffers: supabase
      .from("offers")
      .select("id", { count: "exact", head: true })
      .eq("status", "published")
      .eq("kind", "paid")
      .eq("checkout_mode", "native"),
    queueErrors: supabase
      .from("content_opportunities")
      .select("id", { count: "exact", head: true })
      .in("status", ["proposed", "drafting"])
      .not("last_error", "is", null),
  };
  const entries = await Promise.all(
    Object.entries(requests).map(async ([key, request]) => {
      const { count, error } = await request;
      if (error) throw error;
      if (count === null)
        throw new Error("A dashboard count could not be verified.");
      return [key, count] as const;
    }),
  );
  return Object.fromEntries(entries) as Record<keyof typeof requests, number>;
}
