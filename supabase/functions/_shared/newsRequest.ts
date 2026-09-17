// Pure request validation for the news article generator.
// Deno-free on purpose so it can be unit tested from the app test suite.

export const MAX_NEWS_BODY_BYTES = 1024;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): boolean {
  return typeof value === "string" && UUID_RE.test(value.trim());
}

export type NewsRequestValidation =
  | { ok: true; id: string; force: boolean }
  | { ok: false; status: number; error: string };

/**
 * Validates the raw request body text of a generation call.
 * Rejects oversized bodies, invalid/null JSON and non-UUID ids.
 */
export function validateNewsRequest(rawBody: string): NewsRequestValidation {
  if (typeof rawBody !== "string") {
    return { ok: false, status: 400, error: "invalid_body" };
  }
  if (rawBody.length > MAX_NEWS_BODY_BYTES) {
    return { ok: false, status: 413, error: "body_too_large" };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody || "null");
  } catch {
    return { ok: false, status: 400, error: "invalid_body" };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, status: 400, error: "invalid_body" };
  }
  const { id, force } = parsed as { id?: unknown; force?: unknown };
  if (!isUuid(id)) {
    return { ok: false, status: 400, error: "invalid_id" };
  }
  return { ok: true, id: (id as string).trim(), force: force === true };
}
