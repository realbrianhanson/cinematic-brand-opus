// Limits, cost estimates and job-state rules for AI resource generation.
// Pure (no imports): used by the generate-content and refresh-stale-content
// edge functions and by the admin Generate drafts screen.

/** Hard cap on pages one generation job may create. */
export const MAX_PAGES_PER_JOB = 50;
/** Hard cap on pages per niche x content type pair. */
export const MAX_PAGES_PER_COMBINATION = 10;
/** A pending/running job with no progress for this long is stalled. */
export const STALL_AFTER_MINUTES = 30;
/** Most pages one refresh-stale-content call may rewrite. */
export const MAX_REFRESH_PAGES_PER_CALL = 10;

export const ACTIVE_JOB_STATUSES = ["pending", "running"] as const;
export const RESUMABLE_JOB_STATUSES = ["stalled", "cancelled", "failed"];

// ─── Cost ───
// List prices in USD per 1M tokens. They are estimates: confirm them against
// the AI gateway invoice and update here when models or prices change.
export const MODEL_PRICES_PER_MILLION: Record<
  string,
  { input: number; output: number }
> = {
  "google/gemini-3-flash-preview": { input: 0.5, output: 3 },
  "google/gemini-2.5-flash-lite": { input: 0.1, output: 0.4 },
  "google/gemini-3.1-flash-image-preview": { input: 0.5, output: 60 },
  "sonar-pro": { input: 3, output: 15 },
};
const DEFAULT_PRICE = { input: 0.5, output: 3 };
/** Share of a bare total_tokens count treated as completion tokens. */
const COMPLETION_SHARE = 0.35;

// Per-page averages measured from generation_logs (36 pages, Sep 2026):
// 12,457 tokens and 64 s per page.
export const AVG_TOKENS_PER_PAGE = 12_500;
export const AVG_SECONDS_PER_PAGE = 65;
/** Perplexity + Firecrawl research per page (request fees and tokens). */
export const EST_RESEARCH_COST_PER_PAGE_USD = 0.02;
/** One in-body image per page that passes the quality gate. */
export const EST_IMAGE_COST_PER_PAGE_USD = 0.04;

export interface GatewayUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  /** Some gateways report the real charge; it wins over the price table. */
  cost?: number;
}

const num = (v: unknown) =>
  typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0;

function priceFor(model: string) {
  return MODEL_PRICES_PER_MILLION[model] ?? DEFAULT_PRICE;
}

/** USD cost of one gateway response's usage block. */
export function usageCostUsd(
  model: string,
  usage: GatewayUsage | null | undefined,
): number {
  if (!usage || typeof usage !== "object") return 0;
  if (typeof usage.cost === "number" && Number.isFinite(usage.cost))
    return Math.max(0, usage.cost);
  const price = priceFor(model);
  let prompt = num(usage.prompt_tokens);
  let completion = num(usage.completion_tokens);
  if (!prompt && !completion) {
    const total = num(usage.total_tokens);
    completion = total * COMPLETION_SHARE;
    prompt = total - completion;
  }
  return (prompt * price.input + completion * price.output) / 1_000_000;
}

export interface UsageTotals {
  tokens: number;
  costUsd: number;
}

export const EMPTY_USAGE: UsageTotals = Object.freeze({
  tokens: 0,
  costUsd: 0,
}) as UsageTotals;

/** New totals with one more usage block added (the input is not changed). */
export function addUsage(
  totals: UsageTotals,
  model: string,
  usage: GatewayUsage | null | undefined,
): UsageTotals {
  const tokens =
    num(usage?.total_tokens) ||
    num(usage?.prompt_tokens) + num(usage?.completion_tokens);
  return {
    tokens: totals.tokens + tokens,
    costUsd: totals.costUsd + usageCostUsd(model, usage),
  };
}

/** Round a USD amount for storage in numeric columns. */
export const roundUsd = (usd: number) =>
  Math.round(usd * 1_000_000) / 1_000_000;

function estimatedCostPerPage(): number {
  const price = priceFor("google/gemini-3-flash-preview");
  const completion = AVG_TOKENS_PER_PAGE * COMPLETION_SHARE;
  const prompt = AVG_TOKENS_PER_PAGE - completion;
  const tokens = (prompt * price.input + completion * price.output) / 1_000_000;
  return tokens + EST_RESEARCH_COST_PER_PAGE_USD + EST_IMAGE_COST_PER_PAGE_USD;
}

export interface GenerationEstimate {
  pages: number;
  costUsd: number;
  minutes: number;
}

/** Rough cost and duration of a job, shown before Brian confirms it. */
export function estimateGeneration(pages: number): GenerationEstimate {
  const n = Number.isFinite(pages) && pages > 0 ? Math.floor(pages) : 0;
  return {
    pages: n,
    costUsd: n * estimatedCostPerPage(),
    minutes: Math.ceil((n * AVG_SECONDS_PER_PAGE) / 60),
  };
}

// ─── Request validation ───

export type JobSizeResult =
  | { ok: true; total: number }
  | {
      ok: false;
      code: "invalid_count" | "too_many_pages" | "confirm_required";
      message: string;
      total?: number;
      estimate?: GenerationEstimate;
    };

/**
 * Server-side bounds for a generation request: an integer count per pair,
 * at most MAX_PAGES_PER_JOB pages, and an explicit confirmation of the exact
 * page count (the admin confirm dialog sends it).
 */
export function validateJobSize(input: {
  countPerCombination: unknown;
  nicheCount: number;
  schemaCount: number;
  confirmedTotal: unknown;
}): JobSizeResult {
  const count = input.countPerCombination;
  if (
    typeof count !== "number" ||
    !Number.isInteger(count) ||
    count < 1 ||
    count > MAX_PAGES_PER_COMBINATION
  ) {
    return {
      ok: false,
      code: "invalid_count",
      message: `Pages per industry must be a whole number from 1 to ${MAX_PAGES_PER_COMBINATION}.`,
    };
  }
  const total = input.nicheCount * input.schemaCount * count;
  if (total > MAX_PAGES_PER_JOB) {
    return {
      ok: false,
      code: "too_many_pages",
      total,
      message: `This job would create ${total} pages. The limit is ${MAX_PAGES_PER_JOB} pages per job; pick fewer industries, content types or pages per industry.`,
    };
  }
  if (input.confirmedTotal !== total) {
    return {
      ok: false,
      code: "confirm_required",
      total,
      estimate: estimateGeneration(total),
      message: `Confirm that you want to create ${total} pages before starting.`,
    };
  }
  return { ok: true, total };
}

// ─── Job state ───

export interface JobLike {
  status: string;
  updated_at: string | null;
  completed_count?: number | null;
  total_combinations?: number | null;
  /** True when generation_jobs.work_queue was saved for this job. */
  has_work_queue?: boolean;
}

const isActiveStatus = (status: string) =>
  (ACTIVE_JOB_STATUSES as readonly string[]).includes(status);

/** Stalled: marked so by the server, or active with no progress for 30 min. */
export function isJobStalled(
  job: JobLike,
  nowMs: number,
  stallMinutes: number = STALL_AFTER_MINUTES,
): boolean {
  if (job.status === "stalled") return true;
  if (!isActiveStatus(job.status)) return false;
  const updated = job.updated_at ? Date.parse(job.updated_at) : NaN;
  if (!Number.isFinite(updated)) return false;
  return nowMs - updated > stallMinutes * 60_000;
}

/** "active" jobs block Generate; "stalled" ones show Cancel/Resume instead. */
export function jobPhase(
  job: JobLike,
  nowMs: number,
): "active" | "stalled" | "finished" {
  if (isJobStalled(job, nowMs)) return "stalled";
  return isActiveStatus(job.status) ? "active" : "finished";
}

/** A stopped job can resume when its queue was saved and work remains. */
export function canResumeJob(job: JobLike): boolean {
  if (!RESUMABLE_JOB_STATUSES.includes(job.status)) return false;
  if (!job.has_work_queue) return false;
  const done = job.completed_count ?? 0;
  const total = job.total_combinations ?? 0;
  return done < total;
}
