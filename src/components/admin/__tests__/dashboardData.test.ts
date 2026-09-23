import { beforeEach, describe, expect, it, vi } from "vitest";
const { rpc, from } = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc, from } }));
import { loadDashboardOverview } from "../dashboardData";
import { overviewSnapshot } from "./overviewFixture";

describe("business overview snapshot", () => {
  beforeEach(() => {
    rpc.mockReset();
    from.mockReset();
  });
  it("loads every card from one admin RPC instead of a request per count", async () => {
    rpc.mockResolvedValueOnce({ data: overviewSnapshot(), error: null });
    const data = await loadDashboardOverview();
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("admin_overview_snapshot");
    expect(from).not.toHaveBeenCalled();
    expect(data).toMatchObject({
      published: 348,
      drafts: 8,
      subscribers: 1,
      pendingSubscribers: 5,
      shop: 3,
      freeClaims: 1,
      contradictedLivePosts: 104,
    });
    expect(data.recentPosts[0].title).toBe("Newest");
    expect(data.attention[0]).toMatchObject({
      severity: "high",
      link: "/admin#newsletter",
    });
  });
  it("reports live payments as paid orders and keeps test and unknown modes apart", async () => {
    rpc.mockResolvedValueOnce({ data: overviewSnapshot(), error: null });
    const data = await loadDashboardOverview();
    expect(data.paidOrders).toBe(2);
    expect(data.testPaidOrders).toBe(1);
    expect(data.unknownPaidOrders).toBe(0);
  });
  it("keeps hold counts unknown, not zero, before the hold columns exist", async () => {
    rpc.mockResolvedValueOnce({
      data: overviewSnapshot({
        counts: { held_posts: null, contradicted_live_posts: null },
      }),
      error: null,
    });
    const data = await loadDashboardOverview();
    expect(data.heldPosts).toBeNull();
    expect(data.contradictedLivePosts).toBeNull();
  });
  it("fails visibly when the snapshot is unavailable instead of manufacturing zero", async () => {
    rpc.mockResolvedValueOnce({
      data: null,
      error: { message: "Administrator access required" },
    });
    await expect(loadDashboardOverview()).rejects.toThrow(
      "Administrator access required",
    );
  });
  it("rejects a snapshot with a missing or non-numeric count", async () => {
    const partial = overviewSnapshot();
    delete (partial.counts as Record<string, unknown>).paid_orders;
    rpc.mockResolvedValueOnce({ data: partial, error: null });
    await expect(loadDashboardOverview()).rejects.toThrow(
      "A dashboard count could not be verified.",
    );
    rpc.mockResolvedValueOnce({
      data: overviewSnapshot({ counts: { drafts: -1 } }),
      error: null,
    });
    await expect(loadDashboardOverview()).rejects.toThrow(
      "A dashboard count could not be verified.",
    );
  });
  it("rejects attention links that leave the admin", async () => {
    rpc.mockResolvedValueOnce({
      data: overviewSnapshot({
        attention: [
          {
            key: "x",
            severity: "high",
            count: 1,
            message: "Something happened",
            detail: null,
            link: "https://evil.example.com",
          },
        ],
      }),
      error: null,
    });
    await expect(loadDashboardOverview()).rejects.toThrow();
  });
});
