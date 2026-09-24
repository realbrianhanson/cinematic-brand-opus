// Pure IndexNow helpers shared by the submit-indexnow edge function and the
// app's unit tests. No Deno globals and no remote imports.

const KEY_RE = /^[A-Za-z0-9-]{8,128}$/;
const MAX_ERROR_LENGTH = 500;

/** Statuses that mean IndexNow accepted the URL; these are never resubmitted. */
export const INDEXNOW_RECEIVED_STATUSES = [
  "indexnow_submitted",
  "indexnow_pending",
] as const;

export function isValidIndexNowKey(value: unknown): value is string {
  return typeof value === "string" && KEY_RE.test(value);
}

/**
 * The key stored in site_settings is served at /<key>.txt by the site, so it
 * wins. The INDEXNOW_KEY secret is only a fallback for installs that have not
 * applied the migration yet.
 */
export function resolveIndexNowKey(
  settingsKey: unknown,
  envKey: unknown,
): { key: string | null; source: "settings" | "env" | null } {
  if (isValidIndexNowKey(settingsKey))
    return { key: settingsKey, source: "settings" };
  if (isValidIndexNowKey(envKey)) return { key: envKey, source: "env" };
  return { key: null, source: null };
}

export function indexNowKeyLocation(origin: string, key: string): string {
  return `${origin}/${key}.txt`;
}

/** The site's https origin, or a plain-English reason it cannot be used. */
export function indexNowSiteOrigin(
  siteUrl: unknown,
): { origin: string; host: string } | { problem: string } {
  if (typeof siteUrl !== "string" || !siteUrl.trim())
    return {
      problem: "Add your Site URL in Brand & publishing before submitting.",
    };
  try {
    const url = new URL(siteUrl.trim());
    if (url.protocol !== "https:" || url.username || url.password)
      throw new Error("not https");
    return { origin: url.origin, host: url.host };
  } catch {
    return {
      problem:
        "Your Site URL must be a full https:// address. Fix it in Brand & publishing.",
    };
  }
}

type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;

/** Confirms the key file is publicly served with exactly the key. */
export async function checkIndexNowKeyFile(
  fetcher: Fetcher,
  location: string,
  key: string,
): Promise<{ ok: true } | { ok: false; detail: string }> {
  let response: Response;
  try {
    response = await fetcher(location, {
      redirect: "follow",
      signal: AbortSignal.timeout(10000),
      headers: { "Cache-Control": "no-cache" },
    });
  } catch {
    return {
      ok: false,
      detail: `The key file at ${location} could not be reached.`,
    };
  }
  const body = (await response.text().catch(() => "")).trim();
  if (!response.ok)
    return {
      ok: false,
      detail: `The key file at ${location} returned HTTP ${response.status}.`,
    };
  if (body !== key)
    return {
      ok: false,
      detail: `The key file at ${location} does not contain the IndexNow key.`,
    };
  return { ok: true };
}

/** One indexing_log row that makes an early exit visible to the admin. */
export function indexNowEarlyExitRow(
  origin: string | null,
  message: string,
  at: string,
) {
  return {
    page_id: null,
    page_url: origin ?? "(site URL not configured)",
    status: "error",
    method: "indexnow",
    error_message: message.slice(0, MAX_ERROR_LENGTH),
    submitted_at: at,
  };
}

export function validateIndexNowUrls(
  values: unknown[],
  origin: string,
): string[] {
  if (values.length > 10000)
    throw new Error("Submit at most 10,000 URLs at a time.");
  return [
    ...new Set(
      values.map((value) => {
        if (typeof value !== "string")
          throw new Error("Every URL must be a string.");
        const url = new URL(value, origin);
        if (
          url.origin !== origin ||
          !["https:", "http:"].includes(url.protocol) ||
          url.username ||
          url.password
        )
          throw new Error("Only URLs on this site's origin can be submitted.");
        url.hash = "";
        return url.href;
      }),
    ),
  ];
}

export function indexNowReceipt(status: number) {
  return status === 200
    ? "indexnow_submitted"
    : status === 202
      ? "indexnow_pending"
      : "error";
}
