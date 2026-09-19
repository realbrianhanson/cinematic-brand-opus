import { describe, expect, it } from "vitest";
import { refreshOutcome, indexingOutcome } from "../adminOutcomes";
import {
  validateIndexNowUrls,
  indexNowReceipt,
} from "../../../supabase/functions/_shared/indexnow";
describe("truthful admin outcomes", () => {
  it("does not hide partial refresh failures or protected pages", () => {
    expect(
      refreshOutcome({ refreshed: 2, failed: 1, skipped_human_edited: [{}] }),
    ).toMatchObject({
      failed: 1,
      description: "2 refreshed · 1 failed · 1 human-edited pages preserved.",
    });
    expect(() => refreshOutcome({})).toThrow();
  });
  it("rejects unconfigured and failed indexing responses", () => {
    expect(() =>
      indexingOutcome({ indexnow_status: "no_key", submitted_count: 10 }),
    ).toThrow();
    expect(() => indexingOutcome({ indexnow_status: "error_403" })).toThrow();
    expect(
      indexingOutcome({
        indexnow_status: "partial",
        submitted_count: 3,
        failed_count: 2,
      }).failed,
    ).toBe(true);
  });
  it("distinguishes receipt, pending validation and rejection", () => {
    expect(indexNowReceipt(200)).toBe("indexnow_submitted");
    expect(indexNowReceipt(202)).toBe("indexnow_pending");
    expect(indexNowReceipt(403)).toBe("error");
  });
  it("only submits this site's URLs and removes duplicates", () => {
    expect(
      validateIndexNowUrls(
        ["/blog/a", "https://example.com/blog/a#part"],
        "https://example.com",
      ),
    ).toEqual(["https://example.com/blog/a"]);
    expect(() =>
      validateIndexNowUrls(["https://other.test/a"], "https://example.com"),
    ).toThrow();
    expect(() =>
      validateIndexNowUrls(["javascript:alert(1)"], "https://example.com"),
    ).toThrow();
  });
});
