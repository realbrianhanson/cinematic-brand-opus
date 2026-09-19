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
