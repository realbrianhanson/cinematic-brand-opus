export function refreshOutcome(data: {
  refreshed?: number;
  failed?: number;
  skipped_human_edited?: unknown[];
}) {
  if (!Number.isInteger(data.refreshed) || !Number.isInteger(data.failed ?? 0))
    throw new Error(
      "The refresh result could not be verified. Check recent runs before retrying.",
    );
  const failed = data.failed ?? 0;
  const skipped = data.skipped_human_edited?.length ?? 0;
  return {
    title: failed
      ? "Refresh needs attention"
      : skipped
        ? "Refresh finished with skipped pages"
        : "Refresh complete",
    description: `${data.refreshed} refreshed · ${failed} failed · ${skipped} human-edited pages preserved.`,
    failed,
  };
}
export function indexingOutcome(data: {
  submitted_count?: number;
  pending_count?: number;
  failed_count?: number;
  indexnow_status?: string;
  error?: string;
}) {
  if (data.error) throw new Error(data.error);
  if (
    !["ok", "partial", "pending", "no_urls"].includes(
      data.indexnow_status ?? "",
    )
  )
    throw new Error(
      "Submission was not confirmed. Check IndexNow configuration and try again.",
    );
  return {
    title: data.failed_count
      ? "Some submissions failed"
      : data.indexnow_status === "no_urls"
        ? "Nothing to submit"
        : "Submission results",
    description: `${data.submitted_count ?? 0} received · ${data.pending_count ?? 0} awaiting key validation · ${data.failed_count ?? 0} failed. This does not confirm indexing.`,
    failed: (data.failed_count ?? 0) > 0,
  };
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
function stepFailed(value: unknown): boolean {
  const step = record(value);
  return (
    !!step.error ||
    step.ok === false ||
    (typeof step.status === "number" &&
      (step.status < 200 || step.status >= 300))
  );
}
const AUTO_SCHEDULED = new Set(["scheduled", "published"]);
const AI_CREDITS_EXHAUSTED = "ai_credits_exhausted";

function count(value: unknown): number {
  return Number.isInteger(value) && Number(value) > 0 ? Number(value) : 0;
}

/** Up to two distinct hold reasons, so the toast says why drafts wait. */
function heldSummary(reasons: string[]): string {
  const distinct = [...new Set(reasons)].slice(0, 2);
  return distinct.length ? ` Held: ${distinct.join("; ")}.` : "";
}

function creditsStopped(data: Record<string, unknown>) {
  const message =
    typeof data.message === "string" && data.message
      ? data.message
      : "AI credits ran out. Add credits in Lovable, then run again";
  return {
    title: "Run stopped: AI credits ran out",
    description: `${message} · ${count(data.drafted)} created before it stopped.`,
    failed: true,
    stoppedReason: AI_CREDITS_EXHAUSTED,
  };
}

/** The orchestrator can return HTTP 200 while individual stages fail. */
export function pipelineOutcome(value: unknown) {
  const data = record(value);
  if (data.stopped_reason === AI_CREDITS_EXHAUSTED) return creditsStopped(data);
  if (data.error || data.ok !== true)
    throw new Error(
      typeof data.error === "string"
        ? data.error
        : "The run could not be confirmed. Refresh the queue before retrying.",
    );
  if (typeof data.skipped === "string")
    return { title: "Run skipped", description: data.skipped, failed: false };
  if (!Number.isInteger(data.drafted) || Number(data.drafted) < 0)
    throw new Error(
      "The run returned an incomplete result. Refresh the queue before retrying.",
    );
  const log = record(data.log);
  const steps = record(log.steps);
  const drafts = Array.isArray(steps.drafts) ? steps.drafts : [];
  let failures = [steps.poll, steps.cluster].filter(stepFailed).length;
  let held = 0;
  let scheduled = 0;
  const heldReasons: string[] = [];
  for (const value of drafts) {
    const draft = record(value);
    if (stepFailed(draft)) failures++;
    if (
      typeof draft.fact_check_status === "number" &&
      (draft.fact_check_status < 200 || draft.fact_check_status >= 300)
    )
      failures++;
    if (stepFailed(draft.remediation)) failures++;
    const gate = record(draft.auto_publish);
    if (stepFailed(gate)) failures++;
    // The gate schedules (decision 'scheduled'); the cron publishes later.
    else if (AUTO_SCHEDULED.has(String(gate.decision))) scheduled++;
    else if (draft.post_id) {
      held++;
      if (typeof gate.held_reason === "string" && gate.held_reason)
        heldReasons.push(gate.held_reason);
    }
  }
  const regated = record(data.regated);
  if (typeof regated.error === "string" && regated.error) failures++;
  const regatedScheduled = count(regated.scheduled);
  const regatedText = regatedScheduled
    ? ` ${regatedScheduled} earlier draft${regatedScheduled === 1 ? "" : "s"} now scheduled.`
    : "";
  const skipReason =
    typeof log.skipped_reason === "string" ? ` ${log.skipped_reason}.` : "";
  return {
    title: failures
      ? "Run finished with issues"
      : data.drafted === 0 && !regatedScheduled
        ? "No new drafts"
        : "Run finished",
    description: `${data.drafted} created · ${scheduled} scheduled to auto-publish · ${held} held for review · ${failures} stage issue(s).${regatedText}${heldSummary(heldReasons)}${skipReason}`,
    failed: failures > 0,
  };
}
export function draftOutcome(value: unknown) {
  const data = record(value);
  if (
    data.error ||
    data.ok !== true ||
    typeof data.post_id !== "string" ||
    !data.post_id
  )
    throw new Error(
      typeof data.error === "string"
        ? data.error
        : "No saved draft was confirmed. Refresh before retrying.",
    );
  return {
    title: "Draft saved for review",
    description: `Quality ${typeof data.quality_score === "number" ? data.quality_score : "not scored"} · originality ${typeof data.originality_score === "number" ? `${data.originality_score}%` : "not scored"}.`,
  };
}
export function confirmedPublish(value: unknown) {
  const data = record(value);
  if (data.ok !== true)
    throw new Error(
      typeof data.error === "string"
        ? data.error
        : "Publishing was not confirmed. Check the post before retrying.",
    );
  if (data.already_published === true) return "Already published";
  switch (data.decision) {
    case "published_with_override":
      return "Published with override";
    case "scheduled":
      return "Scheduled";
    case "scheduled_with_override":
      return "Scheduled with override";
    default:
      return "Published";
  }
}
