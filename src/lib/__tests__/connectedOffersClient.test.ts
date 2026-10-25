import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyBuilder } from "../offerBuilder";
const mock = vi.hoisted(() => ({
  queries: [] as Array<{ table: string; ids: string[] }>,
  offers: { data: [] as unknown[], error: null as unknown },
  drafts: { data: [] as unknown[], error: null as unknown },
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      const q = {
        select: () => q,
        in: (_field: string, ids: string[]) => {
          mock.queries.push({ table, ids });
          return q;
        },
        abortSignal: () =>
          Promise.resolve(table === "offers" ? mock.offers : mock.drafts),
      };
      return q;
    },
  },
}));
import { loadConnectedOffers } from "../offerBuilderClient";
beforeEach(() => {
  mock.queries = [];
  mock.offers = { data: [], error: null };
  mock.drafts = { data: [], error: null };
});
describe("connected draft reads", () => {
  it("loads only selected IDs once and joins draft documents to their actual rows", async () => {
    const document = {
      offer: { title: "Private name", kind: "paid" },
      builder: emptyBuilder(),
    };
    mock.offers.data = [{ id: "a", status: "draft", kind: "free" }];
    mock.drafts.data = [{ offer_id: "a", document }];
    expect(await loadConnectedOffers(["a", "a", ""])).toEqual([
      { offer: mock.offers.data[0], document },
    ]);
    expect(mock.queries).toEqual([
      { table: "offers", ids: ["a"] },
      { table: "offer_builder_drafts", ids: ["a"] },
    ]);
  });
  it("does not fetch an empty or oversized workspace", async () => {
    expect(await loadConnectedOffers([])).toEqual([]);
    await expect(loadConnectedOffers(["a", "b", "c", "d"])).rejects.toThrow(
      "up to three",
    );
    expect(mock.queries).toEqual([]);
  });
  it("surfaces unavailable or unreadable private draft data", async () => {
    mock.drafts.error = new Error("Not authorized");
    await expect(loadConnectedOffers(["a"])).rejects.toThrow("Not authorized");
    mock.drafts.error = null;
    mock.drafts.data = [
      { offer_id: "a", document: { offer: {}, builder: { version: 99 } } },
    ];
    await expect(loadConnectedOffers(["a"])).rejects.toThrow();
  });
});
