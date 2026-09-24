import { describe, expect, it, vi } from "vitest";
import {
  bulkResultSummary,
  friendlyPublishError,
  keepVisibleSelection,
  publishPagesOneByOne,
  RESOURCE_TITLE_HARD_LIMIT,
  validateResourceSlug,
  validateResourceTitle,
} from "../resourcePages";

describe("friendlyPublishError", () => {
  it("turns publish-gate trigger errors into next steps", () => {
    expect(
      friendlyPublishError(
        "Cannot publish: quality_score is not set. Score the content first or set publish_override.",
      ),
    ).toMatch(/Not scored yet/);
    expect(
      friendlyPublishError(
        "Cannot publish: quality_score 62 is below the 75 threshold. Improve the content or set publish_override.",
      ),
    ).toMatch(/Score 62 is below 75/);
    expect(friendlyPublishError("network down")).toBe("network down");
  });
});

describe("publishPagesOneByOne", () => {
  const titles = new Map([
    ["a", "Page A"],
    ["b", "Page B"],
    ["c", "Page C"],
    ["d", "Page D"],
  ]);

  it("publishes passing pages and reports the rest, without stopping", async () => {
    const scorePage = vi.fn(async (id: string) => {
      if (id === "b") return { score: 60, issues: ["Thin"] };
      if (id === "c") throw new Error("Scoring service unavailable");
      return { score: 90, issues: [] };
    });
    const publishPage = vi.fn(async (id: string) => {
      if (id === "d")
        throw new Error(
          "Cannot publish: quality_score is not set. Score the content first or set publish_override.",
        );
    });
    const result = await publishPagesOneByOne({
      ids: ["a", "b", "c", "d"],
      titleFor: (id) => titles.get(id) ?? id,
      scorePage,
      publishPage,
    });
    expect(result.published).toEqual([{ id: "a", title: "Page A" }]);
    expect(result.blocked.map((b) => b.id)).toEqual(["b", "c", "d"]);
    expect(result.blocked[0].reason).toMatch(/Score 60 is below 75/);
    expect(result.blocked[1].reason).toMatch(/Scoring service unavailable/);
    expect(result.blocked[2].reason).toMatch(/Not scored yet/);
    expect(publishPage).toHaveBeenCalledTimes(2);
    expect(publishPage).not.toHaveBeenCalledWith("b");
  });

  it("summarises the outcome in one line", () => {
    expect(
      bulkResultSummary({
        published: [{ id: "a", title: "A" }],
        blocked: [
          { id: "b", title: "B", reason: "x" },
          { id: "c", title: "C", reason: "y" },
        ],
      }),
    ).toBe("1 published, 2 blocked");
    expect(bulkResultSummary({ published: [], blocked: [] })).toBe(
      "Nothing to publish",
    );
  });
});

describe("keepVisibleSelection", () => {
  it("drops selected ids that the current filters hide", () => {
    const next = keepVisibleSelection(new Set(["a", "b", "z"]), [
      { id: "a" },
      { id: "b" },
      { id: "c" },
    ]);
    expect([...next]).toEqual(["a", "b"]);
  });
});

describe("title and slug checks", () => {
  it("validates slugs", () => {
    expect(validateResourceSlug("ai-tools-2026")).toBeNull();
    expect(validateResourceSlug("")).toMatch(/required/);
    expect(validateResourceSlug("AI Tools")).toMatch(/lowercase/);
    expect(validateResourceSlug("a".repeat(81))).toMatch(/80/);
  });

  it("validates titles", () => {
    expect(validateResourceTitle("12 Best AI Tools in 2026").error).toBeNull();
    expect(validateResourceTitle("   ").error).toMatch(/required/);
    expect(
      validateResourceTitle("x".repeat(RESOURCE_TITLE_HARD_LIMIT + 1)).error,
    ).toMatch(String(RESOURCE_TITLE_HARD_LIMIT));
    expect(validateResourceTitle("x".repeat(75)).warnings.join(" ")).toMatch(
      /70/,
    );
    expect(
      validateResourceTitle("How to Leveraging Drones").warnings.join(" "),
    ).toMatch(/How to/);
  });
});
