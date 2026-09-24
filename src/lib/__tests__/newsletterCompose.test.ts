import { describe, expect, it } from "vitest";
import {
  fetchRecentPosts,
  hasContradictedClaims,
  NEWSLETTER_POST_LIMIT,
  selectNewsletterPosts,
} from "../../../supabase/functions/_shared/newsletter-compose";

const post = (id: string, fact_check: unknown) => ({
  id,
  title: `Title ${id}`,
  slug: `slug-${id}`,
  excerpt: null,
  tldr: null,
  quality_score: 90,
  fact_check,
});

describe("hasContradictedClaims", () => {
  it("flags any claim with a contradicted verdict", () => {
    expect(
      hasContradictedClaims({
        claims: [{ verdict: "verified" }, { verdict: "contradicted" }],
        contradicted_count: 0,
      }),
    ).toBe(true);
  });
  it("flags a positive contradicted_count even without claims", () => {
    expect(hasContradictedClaims({ contradicted_count: 2 })).toBe(true);
    expect(hasContradictedClaims({ contradicted_count: "1" })).toBe(true);
  });
  it("accepts clean, unverified and missing fact checks", () => {
    expect(
      hasContradictedClaims({
        claims: [{ verdict: "verified" }, { verdict: "unverified" }],
        contradicted_count: 0,
      }),
    ).toBe(false);
    expect(hasContradictedClaims(null)).toBe(false);
    expect(hasContradictedClaims("not json")).toBe(false);
    expect(hasContradictedClaims({ claims: "bad shape" })).toBe(false);
  });
});

describe("selectNewsletterPosts", () => {
  it("drops contradicted posts, keeps order and caps the issue", () => {
    const rows = [
      post("a", { contradicted_count: 1 }),
      ...Array.from({ length: 7 }, (_, i) => post(`ok${i}`, null)),
    ];
    const selected = selectNewsletterPosts(rows);
    expect(selected.map((p) => p.id)).toEqual([
      "ok0",
      "ok1",
      "ok2",
      "ok3",
      "ok4",
    ]);
    expect(selected).toHaveLength(NEWSLETTER_POST_LIMIT);
    expect(selected[0]).not.toHaveProperty("fact_check");
  });
});

describe("fetchRecentPosts", () => {
  it("reads fact_check and filters flagged posts before composing", async () => {
    const calls: Array<[string, ...unknown[]]> = [];
    const rows = [
      post("bad", { claims: [{ verdict: "contradicted" }] }),
      post("good", { claims: [{ verdict: "verified" }] }),
    ];
    const chain: Record<string, (...args: unknown[]) => unknown> = {};
    for (const name of ["select", "eq", "gte", "order", "limit"])
      chain[name] = (...args: unknown[]) => {
        calls.push([name, ...args]);
        return name === "limit"
          ? Promise.resolve({ data: rows, error: null })
          : chain;
      };
    const admin = { from: () => chain };
    const posts = await fetchRecentPosts(admin);
    expect(posts.map((p) => p.id)).toEqual(["good"]);
    expect(String(calls.find((c) => c[0] === "select")?.[1])).toContain(
      "fact_check",
    );
  });
  it("throws instead of composing an empty issue when the read fails", async () => {
    const chain: Record<string, () => unknown> = {};
    for (const name of ["select", "eq", "gte", "order"])
      chain[name] = () => chain;
    chain.limit = () =>
      Promise.resolve({ data: null, error: { message: "offline" } });
    await expect(fetchRecentPosts({ from: () => chain })).rejects.toThrow(
      "offline",
    );
  });
});
