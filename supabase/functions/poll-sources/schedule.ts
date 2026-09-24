// Poll cadence for paid sources. daily-content-run polls every ~30 minutes;
// free feeds are cheap, but each Perplexity digest is a paid sonar-pro call and
// uses search_recency_filter "day", so polling it more often adds cost, not news.

export const PAID_SOURCE_KINDS: ReadonlySet<string> = new Set([
  "perplexity_topic",
]);
export const PAID_SOURCE_MIN_INTERVAL_HOURS = 8;

export function isPaidSource(kind: string | null | undefined): boolean {
  return !!kind && PAID_SOURCE_KINDS.has(kind);
}

/** True when this source may be polled now. */
export function paidSourceDue(
  kind: string | null | undefined,
  lastPolledAt: string | null | undefined,
  now: number = Date.now(),
  minIntervalHours: number = PAID_SOURCE_MIN_INTERVAL_HOURS,
): boolean {
  if (!isPaidSource(kind)) return true;
  const last = lastPolledAt ? Date.parse(lastPolledAt) : NaN;
  if (!Number.isFinite(last)) return true;
  return now - last >= minIntervalHours * 3_600_000;
}
