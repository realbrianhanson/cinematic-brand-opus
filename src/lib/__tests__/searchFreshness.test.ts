import { describe, expect, it } from "vitest";
import {
  decliningSearchPages,
  type SearchPerformanceRow,
} from "../../../supabase/functions/_shared/searchFreshness";

const site = "https://example.test";
const old = { period_start: "2026-07-31", period_end: "2026-08-27" };
const current = { period_start: "2026-08-28", period_end: "2026-09-24" };
const row = (
  period: typeof old,
  overrides: Partial<SearchPerformanceRow> = {},
): SearchPerformanceRow => ({
  page_url: `${site}/resources/workflow`,
  query: "workflow",
  clicks: 10,
  impressions: 100,
  position: 4,
  ...period,
  ...overrides,
});

describe("search freshness comparisons", () => {
  it("does not label a single snapshot a decline", () => {
    expect(decliningSearchPages([row(current)], site)).toEqual([]);
  });
  it("does not divide overlapping rolling snapshots into two date windows", () => {
    expect(
      decliningSearchPages(
        [
          row(current),
          row(
            { period_start: "2026-08-21", period_end: "2026-09-17" },
            { clicks: 20 },
          ),
        ],
        site,
      ),
    ).toEqual([]);
  });
  it("compares the same queries across actual adjacent equally sized periods", () => {
    expect(
      decliningSearchPages([row(old, { clicks: 20 }), row(current)], site),
    ).toEqual([{ url: `${site}/resources/workflow`, delta: -10 }]);
  });
  it("requires both periods for the page instead of inventing zero previous position", () => {
    expect(
      decliningSearchPages(
        [row(old, { page_url: `${site}/other` }), row(current)],
        site,
      ),
    ).toEqual([]);
  });
  it("does not infer a decline from a query omitted by the API", () => {
    expect(
      decliningSearchPages(
        [row(old, { query: "missing", clicks: 500 }), row(old), row(current)],
        site,
      ),
    ).toEqual([]);
  });
  it("weights average position by impressions instead of query count", () => {
    expect(
      decliningSearchPages(
        [
          row(old, { impressions: 1000, position: 10 }),
          row(old, { query: "rare", impressions: 1, position: 1 }),
          row(current, { impressions: 1000, position: 5 }),
          row(current, { query: "rare", impressions: 1, position: 20 }),
        ],
        site,
      ),
    ).toEqual([]);
  });
  it("does not compare stale periods separated by a gap", () => {
    expect(
      decliningSearchPages(
        [
          row(
            { period_start: "2026-07-01", period_end: "2026-07-28" },
            { clicks: 20 },
          ),
          row(current),
        ],
        site,
      ),
    ).toEqual([]);
  });
  it("rejects duplicate rows from an uncertain or interrupted import", () => {
    expect(
      decliningSearchPages(
        [row(old), row(old), row(current, { clicks: 1 })],
        site,
      ),
    ).toEqual([]);
  });
  it("does not mix a different property's rows into the comparison", () => {
    expect(
      decliningSearchPages(
        [
          row(old, { clicks: 100 }),
          row(current, { page_url: "https://unrelated.test/resource" }),
        ],
        site,
      ),
    ).toEqual([]);
  });
  it("ignores malformed metrics and invalid periods", () => {
    expect(
      decliningSearchPages(
        [
          row(old),
          row(current, { position: NaN }),
          row({ period_start: "invalid", period_end: "invalid" }),
        ],
        site,
      ),
    ).toEqual([]);
  });
});
