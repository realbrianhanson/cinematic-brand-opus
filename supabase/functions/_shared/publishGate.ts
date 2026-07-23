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
    const verified = Number(fc.verified_count ?? 0);
    const unverified = Number(fc.unverified_count ?? 0);
    const contradicted = Number(fc.contradicted_count ?? 0);
    if (contradicted !== 0) failures.push(`${contradicted} contradicted claims`);
    if (verified < 2) failures.push(`only ${verified} verified claims (need >= 2)`);
    if (unverified > 2) failures.push(`${unverified} unverified claims (max 2)`);
  }

  if (!opts.ignoreDailyCap) {
    const dailyCap = settings.auto_publish_daily_cap ?? 8;
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count: recentCount } = await supabase
      .from("posts")
      .select("id", { count: "exact", head: true })
      .not("opportunity_id", "is", null)
      .in("status", ["scheduled", "published"])
      .gt("updated_at", dayAgo);
    if ((recentCount ?? 0) >= dailyCap) failures.push("daily cap reached");
  }

  return { passed: failures.length === 0, failures };
}

export async function loadGateSettings(supabase: any): Promise<GateSettings> {
  const { data } = await supabase
    .from("site_settings")
    .select("auto_publish_enabled, auto_publish_daily_cap, auto_publish_min_quality")
    .limit(1)
    .maybeSingle();
  return {
    auto_publish_enabled: data?.auto_publish_enabled ?? true,
    auto_publish_daily_cap: data?.auto_publish_daily_cap ?? 8,
    auto_publish_min_quality: data?.auto_publish_min_quality ?? 85,
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
