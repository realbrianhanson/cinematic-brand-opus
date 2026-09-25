// Cheap checks that run before draft-from-opportunity spends on the
// expensive draft + critique calls, plus the AI-failure contract shared with
// daily-content-run.
import { AI_CREDITS_EXHAUSTED, AI_CREDITS_MESSAGE } from "./aiCredits.ts";

export const FRESHNESS_MAX_HOURS = 96;
const UNKNOWN_FRESHNESS_HOURS = 999;
/** Share of the keyword's words an existing title must already contain. */
const KEYWORD_COVERAGE_THRESHOLD = 0.8;
/** Two-word keywords are too generic to prove a duplicate. */
const MIN_KEYWORD_TOKENS = 3;

const STOPWORDS = new Set(
  "a an and are as at be by can do does for from how i in into is it its my of on or our should the this to use using vs what when which who why will with you your".split(
    " ",
  ),
);

/** Hours since the newest dated source; unknown dates count as very old. */
export function freshnessHours(
  publishedAts: ReadonlyArray<string | null | undefined>,
  now: number = Date.now(),
): number {
  const times = publishedAts
    .map((value) => (value ? Date.parse(value) : NaN))
    .filter((t) => Number.isFinite(t));
  if (times.length === 0) return UNKNOWN_FRESHNESS_HOURS;
  return Math.max(0, Math.round((now - Math.max(...times)) / 3_600_000));
}

/** Rejection reason for news whose sources are too old, or null. */
export function staleSourcesReason(
  hours: number,
  evergreen: boolean,
): string | null {
  if (evergreen || hours <= FRESHNESS_MAX_HOURS) return null;
  return `sources too old (${hours}h > ${FRESHNESS_MAX_HOURS}h)`;
}

function stem(word: string): string {
  if (word.length > 4 && word.endsWith("ies")) return `${word.slice(0, -3)}y`;
  if (word.length > 4 && word.endsWith("es") && /(ss|x|ch|sh)es$/.test(word))
    return word.slice(0, -2);
  if (word.length > 3 && word.endsWith("s") && !word.endsWith("ss"))
    return word.slice(0, -1);
  return word;
}

export function keywordTokens(text: string | null | undefined): string[] {
  const words = String(text ?? "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 1 && !/^\d+$/.test(w) && !STOPWORDS.has(w))
    .map(stem);
  return [...new Set(words)];
}

/**
 * The existing title that already targets this keyword, if any: nearly every
 * meaningful keyword word appears in it. A DB-only check that catches obvious
 * duplicates before any AI call.
 */
export function coveredByExistingTitle(
  targetKeyword: string | null | undefined,
  titles: ReadonlyArray<string | null | undefined>,
): { title: string; coverage: number } | null {
  const wanted = keywordTokens(targetKeyword);
  if (wanted.length < MIN_KEYWORD_TOKENS) return null;
  let best: { title: string; coverage: number } | null = null;
  for (const title of titles) {
    if (!title) continue;
    const have = new Set(keywordTokens(title));
    const coverage = wanted.filter((w) => have.has(w)).length / wanted.length;
    if (
      coverage >= KEYWORD_COVERAGE_THRESHOLD &&
      (!best || coverage > best.coverage)
    )
      best = { title, coverage };
  }
  return best;
}

export type AiFailureKind = "credits" | "retryable" | "terminal";

/** 402 stops the whole run; 408/429/5xx may succeed on a later pass. */
export function classifyAiFailure(status: number): AiFailureKind {
  if (status === 402) return "credits";
  if (status === 408 || status === 429 || status >= 500) return "retryable";
  return "terminal";
}

/** Response body for HTTP 402, matching daily-content-run's stop contract. */
export function creditsExhaustedBody(details?: string) {
  return {
    error: AI_CREDITS_MESSAGE,
    stopped_reason: AI_CREDITS_EXHAUSTED,
    details: details ? details.slice(0, 500) : undefined,
  };
}
