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
/** The orchestrator can return HTTP 200 while individual stages fail. */
export function pipelineOutcome(value: unknown) {
  const data = record(value);
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
  let published = 0;
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
    else if (gate.decision === "published") published++;
    else if (draft.post_id) held++;
  }
  const skipReason =
    typeof log.skipped_reason === "string" ? ` ${log.skipped_reason}.` : "";
  return {
    title: failures
      ? "Run finished with issues"
      : data.drafted === 0
        ? "No new drafts"
        : "Run finished",
    description: `${data.drafted} created · ${published} auto-published · ${held} held for review · ${failures} stage issue(s).${skipReason}`,
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
  return data.already_published === true
    ? "Already published"
    : data.decision === "published_with_override"
      ? "Published with override"
      : "Published";
}
