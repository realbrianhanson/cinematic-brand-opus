// Pure helpers behind the Sitemap and IndexNow cards in Brand & publishing.

/** Number of <loc> entries in a sitemap, or null when it is not a urlset. */
export function countSitemapUrls(xml: string): number | null {
  if (!/<urlset[\s>]/.test(xml)) return null;
  return (xml.match(/<loc>/g) ?? []).length;
}

export type RobotsCheck =
  | { state: "ok"; sitemapUrl: string }
  | { state: "missing" }
  | { state: "mismatch"; sitemapUrl: string; message: string };

const hostOf = (value: string) => {
  try {
    return new URL(value.trim()).host;
  } catch {
    return null;
  }
};

/** Checks that robots.txt names a sitemap on the configured site. */
export function robotsSitemapCheck(
  robots: string,
  siteUrl: string,
): RobotsCheck {
  const match = robots.match(/^\s*Sitemap:\s*(\S+)/im);
  if (!match) return { state: "missing" };
  const sitemapUrl = match[1];
  const robotsHost = hostOf(sitemapUrl);
  const siteHost = hostOf(siteUrl);
  if (robotsHost && siteHost && robotsHost !== siteHost)
    return {
      state: "mismatch",
      sitemapUrl,
      message: `robots.txt points crawlers to ${robotsHost}, but your Site URL is ${siteHost}.`,
    };
  return { state: "ok", sitemapUrl };
}

export type IndexNowStatus = {
  key: string | null;
  receivedTotal: number;
  lastSubmissionAt: string | null;
  lastSubmissionCount: number;
  lastErrorAt: string | null;
  lastError: string | null;
};

const str = (v: unknown) => (typeof v === "string" && v ? v : null);
const num = (v: unknown) => {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : 0;
};

/** Parses the admin_indexnow_status() RPC result without trusting its shape. */
export function parseIndexNowStatus(raw: unknown): IndexNowStatus {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<
    string,
    unknown
  >;
  return {
    key: str(r.key),
    receivedTotal: num(r.received_total),
    lastSubmissionAt: str(r.last_submission_at),
    lastSubmissionCount: num(r.last_submission_count),
    lastErrorAt: str(r.last_error_at),
    lastError: str(r.last_error),
  };
}

export type StatusSummary = {
  tone: "ok" | "warn" | "bad";
  headline: string;
  detail?: string;
};

export function describeIndexNowStatus(s: IndexNowStatus): StatusSummary {
  if (!s.key)
    return {
      tone: "bad",
      headline: "No IndexNow key",
      detail:
        "Apply the latest database migration to create one. Nothing can be sent until then.",
    };
  const errorIsNewest =
    !!s.lastErrorAt &&
    (!s.lastSubmissionAt ||
      Date.parse(s.lastErrorAt) > Date.parse(s.lastSubmissionAt));
  if (errorIsNewest && s.receivedTotal > 0)
    return {
      tone: "bad",
      headline: "Last run failed",
      detail: s.lastError ?? "No details were recorded.",
    };
  if (s.receivedTotal === 0)
    return { tone: "warn", headline: "Set up, but no URLs sent yet" };
  return { tone: "ok", headline: "Sending new pages" };
}
