import { describe, expect, it } from "vitest";
import { fetchAllRows } from "@/lib/feeds.server";

describe("fetchAllRows", () => {
  it("pages past the 1000-row Data API cap", async () => {
    const total = 2300;
    const calls: Array<[number, number]> = [];
    const rows = await fetchAllRows<{ id: number }>(async (from, to) => {
      calls.push([from, to]);
      const data = [];
      for (let i = from; i <= Math.min(to, total - 1); i += 1)
        data.push({ id: i });
      return { data, error: null };
    }, "posts");
    expect(rows).toHaveLength(total);
    expect(calls.length).toBe(3);
    expect(calls[0]).toEqual([0, 999]);
  });

  it("stops after a single short page", async () => {
    const rows = await fetchAllRows<{ id: number }>(
      async () => ({ data: [{ id: 1 }, { id: 2 }], error: null }),
      "posts",
    );
    expect(rows).toHaveLength(2);
  });

  it("throws instead of returning an empty feed on a read error", async () => {
    await expect(
      fetchAllRows(
        async () => ({ data: null, error: { message: "permission denied" } }),
        "posts",
      ),
    ).rejects.toThrow(/posts read failed: permission denied/);
  });
});
