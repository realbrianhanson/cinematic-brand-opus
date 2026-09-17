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

export interface GateResult {
  passed: boolean;
  failures: string[];
}

export interface GateOptions {
  ignoreDailyCap?: boolean; // manual publish always ignores the cap
}

/**
 * Evaluate publish gates. Rules:
 * - quality_score >= min_quality
 * - lint_flags empty
 * - fact_check has >= 2 claims, contradicted_count === 0, verified_count >= 2,
 *   unverified_count <= 2
 * - (optional) daily cap not reached
 */
export async function evaluateGate(
  supabase: any,
  post: GatePost,
  settings: GateSettings,
  opts: GateOptions = {},
): Promise<GateResult> {
  const failures: string[] = [];
  const minQuality = settings.auto_publish_min_quality ?? 85;

  if (typeof post.quality_score !== "number" || post.quality_score < minQuality) {
    failures.push(`quality_score ${post.quality_score ?? "null"} below ${minQuality}`);
  }

  const lintFlags = post.lint_flags;
  if (Array.isArray(lintFlags) ? lintFlags.length > 0 : lintFlags != null) {
    failures.push("lint_flags present");
  }

  const fc = post.fact_check;
  if (!fc || !Array.isArray(fc.claims) || fc.claims.length < 2) {
    failures.push("fact_check missing or has fewer than 2 claims");
  } else {
    // Non-numeric counts must fail the gate, not slip through a NaN comparison.
    const counts = readFactCounts(fc);
    if (!counts) {
      failures.push("fact_check counts are missing or not numbers");
    } else {
      const { verified, unverified, contradicted } = counts;
      if (contradicted !== 0) failures.push(`${contradicted} contradicted claims`);
      if (verified < 2) failures.push(`only ${verified} verified claims (need >= 2)`);
      if (unverified > 2) failures.push(`${unverified} unverified claims (max 2)`);
    }
  }

  if (!opts.ignoreDailyCap) {
    const dailyCap = settings.auto_publish_daily_cap ?? 8;
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count: recentCount, error: countError } = await supabase
      .from("posts")
      .select("id", { count: "exact", head: true })
      .not("opportunity_id", "is", null)
      .in("status", ["scheduled", "published"])
      .gt("updated_at", dayAgo);
    // A failed count must never read as "nothing published today".
    if (countError || typeof recentCount !== "number") {
      failures.push(
        `daily cap check failed: ${countError?.message ?? "count unavailable"}`,
      );
    } else if (recentCount >= dailyCap) {
      failures.push("daily cap reached");
    }
  }

  return { passed: failures.length === 0, failures };
}

function readFactCounts(
  fc: any,
): { verified: number; unverified: number; contradicted: number } | null {
  const read = (v: unknown): number | null => {
    if (v === null || v === undefined) return 0;
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) && n >= 0 ? n : null;
  };
  const verified = read(fc.verified_count);
  const unverified = read(fc.unverified_count);
  const contradicted = read(fc.contradicted_count);
  if (verified === null || unverified === null || contradicted === null) return null;
  return { verified, unverified, contradicted };
}

/**
 * Loads the publish-gate settings. Fails CLOSED: a missing settings row or a
 * failed read disables auto-publishing rather than enabling it by default.
 */
export async function loadGateSettings(supabase: any): Promise<GateSettings> {
  const { data, error } = await supabase
    .from("site_settings_private")
    .select("auto_publish_enabled, auto_publish_daily_cap, auto_publish_min_quality")
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`gate settings read failed: ${error.message}`);
  const cap = Number(data?.auto_publish_daily_cap);
  const minQuality = Number(data?.auto_publish_min_quality);
  return {
    auto_publish_enabled: data?.auto_publish_enabled === true,
    auto_publish_daily_cap: Number.isFinite(cap) && cap >= 0 ? cap : 0,
    auto_publish_min_quality: Number.isFinite(minQuality) ? minQuality : 85,
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
  const deductions = unverifiedPenalty + contradictedPenalty + thinCitationsPenalty;
  const score = Math.max(0, Math.round((params.structuralScore || 0) - deductions));
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
