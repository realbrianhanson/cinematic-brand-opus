// Shared publish-gate logic used by BOTH auto-publish-gate and manual-publish.
// Keeps a single source of truth so manual and automatic paths can never diverge.

export interface GateSettings {
  auto_publish_enabled: boolean;
  auto_publish_daily_cap: number;
  auto_publish_min_quality: number;
}

export interface GatePost {
  id: string;
  status: string;
  quality_score: number | null;
  lint_flags: unknown;
  fact_check: any;
  opportunity_id: string | null;
}

export type GateFailureCode =
  | "quality_missing"
  | "quality_low"
  | "lint_flags"
  | "fact_check_missing"
  | "fact_check_too_few_claims"
  | "fact_check_incomplete"
  | "fact_check_failed"
  | "contradicted_claims"
  | "too_few_verified"
  | "too_many_unverified"
  | "daily_cap"
  | "daily_cap_unavailable"
  | "auto_publish_disabled"
  | "gate_error";

/** One gate failure: a stable code for logic, a plain-English sentence for Brian. */
export interface GateFailure {
  code: GateFailureCode;
  message: string;
}

export interface GateResult {
  passed: boolean;
  /** Plain-English sentences, one per failure (what the UI shows). */
  failures: string[];
  reasons: GateFailure[];
}

export interface GateOptions {
  ignoreDailyCap?: boolean; // manual publish always ignores the cap
}

const MIN_CLAIMS = 2;
const MIN_VERIFIED = 2;
const MAX_UNVERIFIED = 2;
const DAY_MS = 24 * 60 * 60 * 1000;

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

export function dailyCapReason(cap: number): GateFailure {
  return {
    code: "daily_cap",
    message: `Daily limit of ${cap} reached, will retry automatically`,
  };
}

export function gateErrorReason(detail: string): GateFailure {
  return {
    code: "gate_error",
    message: `Publishing checks couldn't run: ${detail}`,
  };
}

function qualityReasons(post: GatePost, minQuality: number): GateFailure[] {
  const q = post.quality_score;
  if (typeof q !== "number" || !Number.isFinite(q))
    return [
      {
        code: "quality_missing",
        message: `Not scored for quality yet, needs ${minQuality}`,
      },
    ];
  if (!Number.isFinite(minQuality) || q < minQuality)
    return [
      {
        code: "quality_low",
        message: `Quality score ${q}, needs ${minQuality}`,
      },
    ];
  return [];
}

function lintReasons(lintFlags: unknown): GateFailure[] {
  if (Array.isArray(lintFlags)) {
    return lintFlags.length > 0
      ? [
          {
            code: "lint_flags",
            message: `${plural(lintFlags.length, "writing-style flag")} to fix`,
          },
        ]
      : [];
  }
  return lintFlags != null
    ? [{ code: "lint_flags", message: "Writing-style flags to fix" }]
    : [];
}

function factCheckReasons(fc: any): GateFailure[] {
  if (!fc || !Array.isArray(fc.claims))
    return [{ code: "fact_check_missing", message: "Not fact-checked yet" }];
  if (fc.claims.length < MIN_CLAIMS)
    return [
      {
        code: "fact_check_too_few_claims",
        message: `Fact check found only ${plural(fc.claims.length, "checkable claim")}, needs at least ${MIN_CLAIMS}`,
      },
    ];
  // Non-numeric counts must fail the gate, not slip through a NaN comparison.
  const counts = readFactCounts(fc);
  if (!counts)
    return [
      {
        code: "fact_check_incomplete",
        message: "Fact-check results are incomplete, run the fact check again",
      },
    ];
  const { verified, unverified, contradicted } = counts;
  const out: GateFailure[] = [];
  if (contradicted !== 0)
    out.push({
      code: "contradicted_claims",
      message: `${plural(contradicted, "claim")} the fact-checker marked as contradicted`,
    });
  if (verified < MIN_VERIFIED)
    out.push({
      code: "too_few_verified",
      message: `Only ${plural(verified, "claim")} verified, needs at least ${MIN_VERIFIED}`,
    });
  if (unverified > MAX_UNVERIFIED)
    out.push({
      code: "too_many_unverified",
      message: `${plural(unverified, "claim")} the fact-checker couldn't confirm, ${MAX_UNVERIFIED} allowed`,
    });
  return out;
}

/**
 * Counts posts AUTO-scheduled in the last 24 hours. This is the same rule the
 * content_schedule_checked() RPC enforces under its advisory lock.
 *
 * Never count by updated_at: every edit, maintenance update or held-reason
 * write bumps it, which used to fill the cap with old published posts and
 * strand drafts that passed every check.
 */
async function dailyCapReasons(
  supabase: any,
  cap: number,
): Promise<GateFailure[]> {
  const since = new Date(Date.now() - DAY_MS).toISOString();
  const { count, error } = await supabase
    .from("posts")
    .select("id", { count: "exact", head: true })
    .gt("auto_scheduled_at", since);
  // A failed count must never read as "nothing published today".
  if (error || typeof count !== "number") {
    console.error(
      "daily cap count failed",
      error?.message ?? "count unavailable",
    );
    return [
      {
        code: "daily_cap_unavailable",
        message:
          "Couldn't check today's publishing limit, will retry on the next run",
      },
    ];
  }
  return count >= cap ? [dailyCapReason(cap)] : [];
}

/**
 * Evaluate publish gates. Rules:
 * - quality_score >= min_quality
 * - lint_flags empty
 * - fact_check has >= 2 claims, contradicted_count === 0, verified_count >= 2,
 *   unverified_count <= 2
 * - (optional) fewer than daily_cap posts auto-scheduled in the last 24h
 */
export async function evaluateGate(
  supabase: any,
  post: GatePost,
  settings: GateSettings,
  opts: GateOptions = {},
): Promise<GateResult> {
  const minQuality = settings.auto_publish_min_quality ?? 85;
  const reasons: GateFailure[] = [
    ...qualityReasons(post, minQuality),
    ...lintReasons(post.lint_flags),
    ...factCheckReasons(post.fact_check),
  ];
  if (!opts.ignoreDailyCap) {
    reasons.push(
      ...(await dailyCapReasons(
        supabase,
        settings.auto_publish_daily_cap ?? 0,
      )),
    );
  }
  return {
    passed: reasons.length === 0,
    failures: reasons.map((r) => r.message),
    reasons,
  };
}

function readFactCounts(
  fc: any,
): { verified: number; unverified: number; contradicted: number } | null {
  const read = (v: unknown): number | null => {
    return typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : null;
  };
  const verified = read(fc.verified_count);
  const unverified = read(fc.unverified_count);
  const contradicted = read(fc.contradicted_count);
  if (verified === null || unverified === null || contradicted === null)
    return null;
  return { verified, unverified, contradicted };
}

const HOLD_REASON_MAX = 1000;

/** The text stored in posts.held_reason: sentences joined by "; ". */
export function holdReasonText(reasons: GateFailure[]): string {
  return reasons
    .map((r) => r.message)
    .join("; ")
    .slice(0, HOLD_REASON_MAX);
}

/**
 * Maps a content_schedule_checked() 'queued'/'skipped' reason to a sentence.
 * Returns null when the post is simply not eligible (nothing to record).
 */
export function scheduleHoldReason(
  rpcReason: unknown,
  cap: number,
): GateFailure | null {
  switch (rpcReason) {
    case "daily cap reached":
      return dailyCapReason(cap);
    case "fact-check failed":
      return {
        code: "fact_check_failed",
        message: "Fact check didn't pass the final publishing check",
      };
    case "quality or fact-check incomplete":
      return {
        code: "fact_check_incomplete",
        message: "Quality score or fact check is missing or invalid",
      };
    case "auto-publish disabled":
      return {
        code: "auto_publish_disabled",
        message: "Auto-publishing is turned off",
      };
    case "not a pipeline draft":
      return null;
    default:
      return gateErrorReason(
        typeof rpcReason === "string" && rpcReason
          ? rpcReason
          : "unexpected scheduling result",
      );
  }
}

export interface HoldState {
  held_reason: string | null;
  held_at: string | null;
}

/**
 * The held_reason/held_at write for a post that is held again, or null when
 * nothing changed. Skipping unchanged writes keeps cron re-checks from bumping
 * updated_at (which the editor uses for conflict detection) every run.
 * held_at keeps the time the post was FIRST held.
 */
export function nextHoldUpdate(
  current: HoldState,
  reason: string,
  nowIso: string,
): HoldState | null {
  if (current.held_reason === reason) return null;
  return {
    held_reason: reason,
    held_at: current.held_reason ? (current.held_at ?? nowIso) : nowIso,
  };
}

export interface ScheduledPostFlags {
  publish_override: boolean | null;
  auto_scheduled_at: string | null;
  schedule_checked_at: string | null;
}

/**
 * What publish-scheduled-posts does with a due post.
 * - An explicit, audited override always publishes.
 * - Auto-scheduled posts are re-gated: settings or fact-check data may have
 *   changed since the pipeline scheduled them.
 * - A post Brian scheduled through manual-publish (mode 'schedule') already
 *   passed the gate, or was overridden, at that moment: it publishes on time.
 * - A post scheduled without any check (older editor, direct SQL) is gated
 *   now so a failure is recorded as a hold, never silently skipped.
 */
export function publishTimeAction(
  post: ScheduledPostFlags,
): "publish" | "gate" {
  if (post.publish_override === true) return "publish";
  if (post.auto_scheduled_at) return "gate";
  if (post.schedule_checked_at) return "publish";
  return "gate";
}

/**
 * Loads the publish-gate settings. Fails CLOSED: a missing settings row or a
 * failed read disables auto-publishing rather than enabling it by default.
 */
export async function loadGateSettings(supabase: any): Promise<GateSettings> {
  const { data, error } = await supabase
    .from("site_settings_private")
    .select(
      "auto_publish_enabled, auto_publish_daily_cap, auto_publish_min_quality",
    )
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`gate settings read failed: ${error.message}`);
  const cap = data?.auto_publish_daily_cap;
  const minQuality = data?.auto_publish_min_quality;
  return {
    auto_publish_enabled: data?.auto_publish_enabled === true,
    auto_publish_daily_cap:
      typeof cap === "number" && Number.isInteger(cap) && cap >= 0 ? cap : 0,
    auto_publish_min_quality:
      typeof minQuality === "number" &&
      Number.isFinite(minQuality) &&
      minQuality >= 0 &&
      minQuality <= 100
        ? minQuality
        : 85,
  };
}

/**
 * Recompute quality_score using structural score + fact-check deductions.
 * Formula: structural_score - 5 * unverified - 20 * contradicted - (10 if citations<2).
 * Floors at 0.
 */
export function computeQualityWithFacts(params: {
  structuralScore: number;
  unverifiedCount: number;
  contradictedCount: number;
  citationsCount: number;
}): { score: number; deductions: number; breakdown: Record<string, number> } {
  const unverifiedPenalty = 5 * (params.unverifiedCount || 0);
  const contradictedPenalty = 20 * (params.contradictedCount || 0);
  const thinCitationsPenalty = (params.citationsCount || 0) < 2 ? 10 : 0;
  const deductions =
    unverifiedPenalty + contradictedPenalty + thinCitationsPenalty;
  const score = Math.max(
    0,
    Math.round((params.structuralScore || 0) - deductions),
  );
  return {
    score,
    deductions,
    breakdown: {
      structural: params.structuralScore,
      unverified_penalty: unverifiedPenalty,
      contradicted_penalty: contradictedPenalty,
      thin_citations_penalty: thinCitationsPenalty,
    },
  };
}
