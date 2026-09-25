/** Search imports contain whole reporting periods, not daily observations.
 * Compare only adjacent, equal-length periods and queries present in both.
 * Missing rows are unknown: Search Console returns top rows, not every query.
 */
export interface SearchPerformanceRow {
  page_url: string;
  query: string;
  clicks: number;
  impressions: number;
  position: number;
  period_start: string;
  period_end: string;
}

interface Period {
  start: number;
  end: number;
  pages: Map<string, Map<string, SearchPerformanceRow>>;
  duplicate: boolean;
}

const DAY = 86_400_000;
function dateNumber(value: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(parsed) &&
    new Date(parsed).toISOString().slice(0, 10) === value
    ? parsed
    : null;
}

export function decliningSearchPages(
  rows: SearchPerformanceRow[],
  siteUrl: string,
): { url: string; delta: number }[] {
  let origin: string;
  try {
    origin = new URL(siteUrl).origin;
  } catch {
    return [];
  }
  const periods = new Map<string, Period>();
  for (const row of rows) {
    const start = dateNumber(row.period_start);
    const end = dateNumber(row.period_end);
    if (start === null || end === null || start > end) continue;
    if (
      !row.query ||
      !Number.isFinite(row.clicks) ||
      row.clicks < 0 ||
      !Number.isFinite(row.impressions) ||
      row.impressions <= 0 ||
      !Number.isFinite(row.position) ||
      row.position <= 0
    )
      continue;
    try {
      if (new URL(row.page_url).origin !== origin) continue;
    } catch {
      continue;
    }
    const key = `${row.period_start}:${row.period_end}`;
    let period = periods.get(key);
    if (!period) {
      period = { start, end, pages: new Map(), duplicate: false };
      periods.set(key, period);
    }
    let queries = period.pages.get(row.page_url);
    if (!queries) {
      queries = new Map();
      period.pages.set(row.page_url, queries);
    }
    if (queries.has(row.query)) period.duplicate = true;
    queries.set(row.query, row);
  }
  const ordered = [...periods.values()].sort(
    (a, b) => b.end - a.end || b.start - a.start,
  );
  const current = ordered[0];
  if (!current || current.duplicate) return [];
  const previous = ordered.find(
    (period) =>
      period.end + DAY === current.start &&
      period.end - period.start === current.end - current.start,
  );
  if (!previous || previous.duplicate) return [];

  const results: { url: string; delta: number }[] = [];
  for (const [url, currentQueries] of current.pages) {
    const oldQueries = previous.pages.get(url);
    if (!oldQueries) continue;
    let clicksNew = 0,
      clicksOld = 0,
      weightedNew = 0,
      weightedOld = 0,
      impressionsNew = 0,
      impressionsOld = 0;
    for (const [query, next] of currentQueries) {
      const old = oldQueries.get(query);
      if (!old) continue;
      clicksNew += next.clicks;
      clicksOld += old.clicks;
      impressionsNew += next.impressions;
      impressionsOld += old.impressions;
      weightedNew += next.position * next.impressions;
      weightedOld += old.position * old.impressions;
    }
    if (!impressionsNew || !impressionsOld) continue;
    const delta = clicksNew - clicksOld;
    if (
      delta < 0 ||
      weightedNew / impressionsNew > weightedOld / impressionsOld
    )
      results.push({ url, delta });
  }
  return results.sort(
    (a, b) => a.delta - b.delta || a.url.localeCompare(b.url),
  );
}
