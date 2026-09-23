// Pure helpers for the Jev shadow-mode pilot (see docs/JEV_PILOT.md).
// No Deno or network APIs here so the logic is unit-testable from vitest.
//
// Jev (TypeSafe AI) takes a `state` plus typed `questions` and returns typed
// answers with probabilities. Request/response shape follows TypeSafe's
// published System One API; the gateway URL and model id are constants in
// the edge function so they can be corrected in one place at deploy time.

export const QUESTIONS_VERSION = "v1";
export const PILOT_END = "2026-09-28T00:00:00Z";

export const MAX_STATE_CHARS = 6000;
export const MAX_RECENT_TITLES = 60;

export type SubjectType = "source_item" | "opportunity";

export interface ShadowSubject {
  type: SubjectType;
  id: string;
  title: string;
  excerpt?: string | null;
  topicLane?: string | null;
  targetKeyword?: string | null;
  rationale?: string | null;
}

export interface JevQuestion {
  type: "noul" | "score" | "choice";
  instructions: string;
  criteria?: string[] | Record<string, string>;
}

export interface JevRequest {
  state: string;
  questions: Record<string, JevQuestion>;
}

export interface ShadowScore {
  relevant_prob: number | null;
  duplicate_prob: number | null;
  substance_prob: number | null;
  audience_fit_score: number | null;
  verdict: "pursue" | "skip" | null;
}

export const AUDIENCE_FIT_LEVELS = [
  "No fit: not about business or AI in any useful way",
  "Weak fit: tangential, mostly tech or industry news with no action for a small business",
  "Moderate fit: relevant topic but the takeaway for an owner is vague",
  "Good fit: a clear, practical AI use or decision for a small-business owner",
  "Excellent fit: a concrete workflow, tool, or money/time saving an owner can act on this week",
];

export function isPilotActive(now: Date, end = PILOT_END): boolean {
  return now.getTime() < new Date(end).getTime();
}

function clip(text: string | null | undefined, max: number): string {
  const value = (text ?? "").replace(/\s+/g, " ").trim();
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

export function buildJevRequest(
  subject: ShadowSubject,
  recentTitles: string[],
): JevRequest {
  const titles = recentTitles
    .map((t) => clip(t, 160))
    .filter(Boolean)
    .slice(0, MAX_RECENT_TITLES);
  const lines = [
    `Candidate (${subject.type === "source_item" ? "news item" : "article idea"}): ${clip(subject.title, 300)}`,
    subject.targetKeyword
      ? `Target keyword: ${clip(subject.targetKeyword, 120)}`
      : "",
    subject.topicLane ? `Topic lane: ${clip(subject.topicLane, 80)}` : "",
    subject.excerpt ? `Excerpt: ${clip(subject.excerpt, 1500)}` : "",
    subject.rationale
      ? `Why it was proposed: ${clip(subject.rationale, 600)}`
      : "",
    "",
    "Articles already published in the last 90 days:",
    ...titles.map((t) => `- ${t}`),
  ].filter((line, i, all) => line !== "" || all[i - 1] !== "");
  const state = clip(lines.join("\n"), MAX_STATE_CHARS);

  return {
    state,
    questions: {
      relevant: {
        type: "noul",
        instructions:
          "Is this candidate relevant to small-business owners who want practical ways to use AI in marketing, sales, operations or customer service?",
      },
      duplicate: {
        type: "noul",
        instructions:
          "Does an article in the already-published list cover essentially the same story or the same practical takeaway as this candidate?",
      },
      substance: {
        type: "noul",
        instructions:
          "Is there enough concrete, verifiable substance here (a real tool, change, data point or method) to support a full, useful article rather than a thin rewrite?",
      },
      audience_fit: {
        type: "score",
        instructions:
          "How well does this candidate fit Brian Hanson's audience of small-business owners learning to put AI to work?",
        criteria: AUDIENCE_FIT_LEVELS,
      },
    },
  };
}

function toNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim() !== "") return Number(value);
  return Number.NaN;
}

function prob(value: unknown): number | null {
  const n = toNumber(value);
  if (!Number.isFinite(n)) return null;
  return Math.min(1, Math.max(0, n));
}

// Score answers are returned on the rubric's index scale (0..levels-1,
// possibly fractional). Normalise to 0-100.
function scoreTo100(value: unknown, levels: number): number | null {
  const n = toNumber(value);
  if (!Number.isFinite(n) || levels < 2) return null;
  const clamped = Math.min(levels - 1, Math.max(0, n));
  return Math.round((clamped / (levels - 1)) * 1000) / 10;
}

export function parseJevResponse(body: unknown): ShadowScore {
  const answers =
    body && typeof body === "object"
      ? ((body as { answers?: Record<string, Record<string, unknown>> })
          .answers ?? {})
      : {};
  const score: ShadowScore = {
    relevant_prob: prob(answers.relevant?.noul),
    duplicate_prob: prob(answers.duplicate?.noul),
    substance_prob: prob(answers.substance?.noul),
    audience_fit_score: scoreTo100(
      answers.audience_fit?.score,
      AUDIENCE_FIT_LEVELS.length,
    ),
    verdict: null,
  };
  return { ...score, verdict: decideVerdict(score) };
}

// Conservative rule: only "skip" when Jev is fairly sure the idea is
// off-audience, a repeat, or too thin. Everything else is "pursue".
export function decideVerdict(
  s: Omit<ShadowScore, "verdict">,
): "pursue" | "skip" | null {
  const values = [s.relevant_prob, s.duplicate_prob, s.substance_prob];
  if (values.every((v) => v === null)) return null;
  if (s.relevant_prob !== null && s.relevant_prob < 0.35) return "skip";
  if (s.duplicate_prob !== null && s.duplicate_prob > 0.7) return "skip";
  if (s.substance_prob !== null && s.substance_prob < 0.3) return "skip";
  if (s.audience_fit_score !== null && s.audience_fit_score < 25) return "skip";
  return "pursue";
}
