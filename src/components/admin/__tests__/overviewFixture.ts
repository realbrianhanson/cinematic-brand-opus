/** Shape of admin_overview_snapshot() (migration 20260923150000). */
export function overviewSnapshot(
  overrides: {
    counts?: Record<string, number | null>;
    attention?: unknown[];
    recent_posts?: unknown[];
  } = {},
) {
  return {
    generated_at: "2026-09-23T15:00:00+00:00",
    counts: {
      inquiries: 0,
      published: 348,
      drafts: 8,
      scheduled: 0,
      overdue: 0,
      subscribers: 1,
      pending_subscribers: 5,
      shop: 3,
      paid_orders: 2,
      test_paid_orders: 1,
      unknown_paid_orders: 0,
      free_claims: 1,
      native_paid_offers: 0,
      queue_errors: 0,
      stale_pages: 0,
      held_posts: 0,
      contradicted_live_posts: 104,
      ...overrides.counts,
    },
    recent_posts: overrides.recent_posts ?? [
      {
        id: "p1",
        title: "Newest",
        status: "draft",
        updated_at: "2026-09-23T14:00:00+00:00",
      },
    ],
    attention: overrides.attention ?? [
      {
        key: "newsletter_delivery",
        severity: "high",
        count: 1,
        message: "The 2026-W39 newsletter reached nobody (0 of 1 delivered)",
        detail: "Provider returned HTTP 403",
        link: "/admin#newsletter",
      },
    ],
  };
}
