// Detects "AI credits exhausted" from a stage's response so the run stops
// cleanly instead of burning every claimed opportunity on the same failure.

export const AI_CREDITS_EXHAUSTED = "ai_credits_exhausted";
export const AI_CREDITS_MESSAGE =
  "AI credits ran out. Add credits in Lovable, then run again";

const CREDIT_TEXT =
  /not enough credits|insufficient credits|credits? (?:are |is )?(?:exhausted|depleted|used up)|payment required|\b402\b/i;

export interface StageResult {
  status: number;
  data: unknown;
}

/**
 * True when the gateway said 402 directly, or a stage wrapped the gateway's
 * credit error in its own failure response (draft-from-opportunity and
 * cluster-opportunities return 500 with the gateway body in `details`).
 * Successful responses never count, even if a nested item mentions credits.
 */
export function isCreditsExhausted(result: StageResult): boolean {
  if (result.status === 402) return true;
  if (result.status < 400) return false;
  let text: string;
  try {
    text = JSON.stringify(result.data ?? "");
  } catch {
    return false;
  }
  return CREDIT_TEXT.test(text);
}
