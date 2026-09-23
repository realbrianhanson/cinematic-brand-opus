import { describe, expect, it } from "vitest";
import {
  addUsage,
  canResumeJob,
  EMPTY_USAGE,
  estimateGeneration,
  isJobStalled,
  jobPhase,
  MAX_PAGES_PER_COMBINATION,
  MAX_PAGES_PER_JOB,
  STALL_AFTER_MINUTES,
  usageCostUsd,
  validateJobSize,
} from "../../../supabase/functions/_shared/generationLimits";

const NOW = Date.parse("2026-09-23T12:00:00Z");
const minutesAgo = (m: number) => new Date(NOW - m * 60_000).toISOString();

describe("validateJobSize", () => {
  it("accepts a confirmed job within the caps", () => {
    expect(
      validateJobSize({
        countPerCombination: 2,
        nicheCount: 3,
        schemaCount: 4,
        confirmedTotal: 24,
      }),
    ).toEqual({ ok: true, total: 24 });
  });

  it("rejects non-integer, zero, negative and oversized counts", () => {
    for (const count of [
      0,
      -1,
      1.5,
      "3",
      null,
      MAX_PAGES_PER_COMBINATION + 1,
    ]) {
      const r = validateJobSize({
        countPerCombination: count,
        nicheCount: 1,
        schemaCount: 1,
        confirmedTotal: 1,
      });
      expect(r.ok, String(count)).toBe(false);
      if (!r.ok) expect(r.code).toBe("invalid_count");
    }
  });

  it("caps a job at MAX_PAGES_PER_JOB pages (12 niches x 6 types x 50)", () => {
    const r = validateJobSize({
      countPerCombination: 10,
      nicheCount: 12,
      schemaCount: 6,
      confirmedTotal: 720,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe("too_many_pages");
      expect(r.total).toBe(720);
      expect(r.message).toMatch(String(MAX_PAGES_PER_JOB));
    }
  });

  it("requires the caller to confirm the exact page count", () => {
    const missing = validateJobSize({
      countPerCombination: 1,
      nicheCount: 2,
      schemaCount: 3,
      confirmedTotal: undefined,
    });
    expect(missing).toMatchObject({
      ok: false,
      code: "confirm_required",
      total: 6,
    });
    const stale = validateJobSize({
      countPerCombination: 1,
      nicheCount: 2,
      schemaCount: 3,
      confirmedTotal: 4,
    });
    expect(stale).toMatchObject({ ok: false, code: "confirm_required" });
  });
});

describe("estimateGeneration", () => {
  it("scales cost and time with page count", () => {
    const one = estimateGeneration(1);
    const fifty = estimateGeneration(50);
    expect(one.pages).toBe(1);
    expect(one.costUsd).toBeGreaterThan(0);
    expect(fifty.costUsd).toBeCloseTo(one.costUsd * 50, 5);
    expect(fifty.minutes).toBeGreaterThan(one.minutes);
    expect(estimateGeneration(0)).toMatchObject({ pages: 0, costUsd: 0 });
  });
});

describe("usage cost", () => {
  it("prefers the cost the gateway reports", () => {
    expect(
      usageCostUsd("google/gemini-3-flash-preview", {
        prompt_tokens: 10,
        completion_tokens: 10,
        cost: 0.0123,
      }),
    ).toBe(0.0123);
  });

  it("prices prompt and completion tokens per model", () => {
    const cost = usageCostUsd("google/gemini-3-flash-preview", {
      prompt_tokens: 1_000_000,
      completion_tokens: 1_000_000,
    });
    expect(cost).toBeGreaterThan(0);
    const lite = usageCostUsd("google/gemini-2.5-flash-lite", {
      prompt_tokens: 1_000_000,
      completion_tokens: 1_000_000,
    });
    expect(lite).toBeLessThan(cost);
  });

  it("returns 0 when no usage came back", () => {
    expect(usageCostUsd("google/gemini-3-flash-preview", null)).toBe(0);
    expect(usageCostUsd("google/gemini-3-flash-preview", {})).toBe(0);
  });

  it("accumulates usage without mutating the previous total", () => {
    const a = addUsage(EMPTY_USAGE, "google/gemini-3-flash-preview", {
      prompt_tokens: 100,
      completion_tokens: 50,
      total_tokens: 150,
    });
    const b = addUsage(a, "sonar-pro", { total_tokens: 10, cost: 0.5 });
    expect(EMPTY_USAGE).toEqual({ tokens: 0, costUsd: 0 });
    expect(a.tokens).toBe(150);
    expect(b.tokens).toBe(160);
    expect(b.costUsd).toBeCloseTo(a.costUsd + 0.5, 8);
  });
});

describe("job state", () => {
  const job = (status: string, updatedMinutesAgo: number, extra = {}) => ({
    status,
    updated_at: minutesAgo(updatedMinutesAgo),
    completed_count: 3,
    total_combinations: 10,
    has_work_queue: true,
    ...extra,
  });

  it("treats a pending/running job with no progress for 30 min as stalled", () => {
    expect(isJobStalled(job("running", STALL_AFTER_MINUTES + 1), NOW)).toBe(
      true,
    );
    expect(isJobStalled(job("pending", 5), NOW)).toBe(false);
    expect(isJobStalled(job("completed", 600), NOW)).toBe(false);
    expect(isJobStalled(job("stalled", 1), NOW)).toBe(true);
  });

  it("classifies jobs so a stalled one never blocks Generate", () => {
    expect(jobPhase(job("running", 2), NOW)).toBe("active");
    expect(jobPhase(job("running", 45), NOW)).toBe("stalled");
    expect(jobPhase(job("stalled", 45), NOW)).toBe("stalled");
    expect(jobPhase(job("cancelled", 1), NOW)).toBe("finished");
    expect(jobPhase(job("failed", 1), NOW)).toBe("finished");
  });

  it("only resumes a stopped job that still has queued work", () => {
    expect(canResumeJob(job("stalled", 45))).toBe(true);
    expect(canResumeJob(job("cancelled", 45))).toBe(true);
    expect(canResumeJob(job("running", 1))).toBe(false);
    expect(canResumeJob(job("stalled", 45, { has_work_queue: false }))).toBe(
      false,
    );
    expect(canResumeJob(job("stalled", 45, { completed_count: 10 }))).toBe(
      false,
    );
  });
});
