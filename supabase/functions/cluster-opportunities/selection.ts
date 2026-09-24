// Pure selection rules for cluster-opportunities (cost controls).

/**
 * pipeline_status for source items the LLM was shown but did not pick. They
 * are not re-sent on later runs, so each item costs at most one LLM look.
 */
export const CONSIDERED_STATUS = "considered";

/**
 * True when at least one candidate arrived after the newest item any earlier
 * run already showed the LLM. When nothing is new, the LLM would only see the
 * same leftovers again, so the run can skip the call entirely.
 */
export function hasItemsFetchedSince(
  items: ReadonlyArray<{ fetched_at?: string | null }>,
  lastSeenAt: string | null,
): boolean {
  if (items.length === 0) return false;
  const since = lastSeenAt ? Date.parse(lastSeenAt) : NaN;
  if (!Number.isFinite(since)) return true;
  return items.some((item) => {
    const at = item.fetched_at ? Date.parse(item.fetched_at) : NaN;
    // Unknown fetch time: treat as new rather than silently starving it.
    return !Number.isFinite(at) || at > since;
  });
}

/** Item ids of every candidate cluster the LLM did not pick. */
export function unpickedItemIds(
  candidates: ReadonlyArray<ReadonlyArray<{ id: string }>>,
  pickedIdx: Iterable<number>,
): string[] {
  const picked = new Set(pickedIdx);
  return candidates.flatMap((cluster, idx) =>
    picked.has(idx) ? [] : cluster.map((item) => item.id),
  );
}
