// Pure request rules for manual-publish. No Deno APIs, so vitest covers them.

export type PublishMode = "publish" | "schedule" | "check";

export const MIN_OVERRIDE_REASON = 10;
const MAX_SCHEDULE_AHEAD_MS = 366 * 24 * 60 * 60 * 1000;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MODES: readonly PublishMode[] = ["publish", "schedule", "check"];

export type PublishRequest =
  | {
      ok: true;
      postId: string;
      mode: PublishMode;
      scheduledAt: string | null;
      overrideReason: string;
    }
  | { ok: false; status: 400; error: string };

const invalid = (error: string): PublishRequest => ({
  ok: false,
  status: 400,
  error,
});

/**
 * One post per call. Bulk and multi-id bodies are rejected outright so a gate
 * override can never be applied to more than one article at a time (318 posts
 * were once bulk-published past the gate).
 */
export function parsePublishRequest(
  body: unknown,
  nowMs: number,
): PublishRequest {
  if (!body || typeof body !== "object" || Array.isArray(body))
    return invalid("post_id required");
  const b = body as Record<string, unknown>;
  if (
    "post_ids" in b ||
    Array.isArray(b.post_id) ||
    (typeof b.post_id === "string" && /[,\s]/.test(b.post_id.trim()))
  )
    return invalid(
      "Publish one article per request. Overrides can't be applied in bulk",
    );
  if (typeof b.post_id !== "string" || !b.post_id)
    return invalid("post_id required");
  if (!UUID_RE.test(b.post_id)) return invalid("post_id must be a post id");

  const mode = (b.mode ?? "publish") as PublishMode;
  if (!MODES.includes(mode))
    return invalid("mode must be 'publish', 'schedule' or 'check'");

  let scheduledAt: string | null = null;
  if (mode === "schedule") {
    const ms =
      typeof b.scheduled_at === "string" ? Date.parse(b.scheduled_at) : NaN;
    if (!Number.isFinite(ms))
      return invalid("scheduled_at must be a date and time");
    if (ms <= nowMs) return invalid("Choose a future publish time");
    if (ms > nowMs + MAX_SCHEDULE_AHEAD_MS)
      return invalid("Choose a publish time within the next year");
    scheduledAt = new Date(ms).toISOString();
  }

  if (b.override_reason != null && typeof b.override_reason !== "string")
    return invalid("override_reason must be text");
  const overrideReason =
    typeof b.override_reason === "string" ? b.override_reason.trim() : "";

  return { ok: true, postId: b.post_id, mode, scheduledAt, overrideReason };
}

export interface OverrideCheck {
  proceed: boolean;
  override: boolean;
  reasonError: string | null;
}

export function overrideCheck(
  failureCount: number,
  reason: string,
): OverrideCheck {
  if (failureCount === 0)
    return { proceed: true, override: false, reasonError: null };
  if (reason.length >= MIN_OVERRIDE_REASON)
    return { proceed: true, override: true, reasonError: null };
  return {
    proceed: false,
    override: false,
    reasonError: reason
      ? `Override reason must be at least ${MIN_OVERRIDE_REASON} characters`
      : null,
  };
}

export type PublishDecision =
  | "published"
  | "published_with_override"
  | "scheduled"
  | "scheduled_with_override";

export function publishDecision(
  mode: "publish" | "schedule",
  override: boolean,
): PublishDecision {
  const base = mode === "schedule" ? "scheduled" : "published";
  return override ? `${base}_with_override` : base;
}
