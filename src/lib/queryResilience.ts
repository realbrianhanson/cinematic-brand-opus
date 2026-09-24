/**
 * React Query policy for a backend that occasionally blips (DB restarts,
 * PostgREST schema-cache reloads, gateway 5xx): retry reads that can succeed
 * on a second try, never retry permanent errors, and never let a failed admin
 * write go unnoticed.
 */
import { errorMessage } from "./errorMessage";

export const MAX_QUERY_RETRIES = 3;
const RETRY_BASE_MS = 500;
const RETRY_MAX_MS = 8_000;
const RETRY_JITTER_MS = 250;

/** PostgREST: cannot connect / pool error / schema cache not ready / pool timeout. */
const TRANSIENT_POSTGREST = new Set([
  "PGRST000",
  "PGRST001",
  "PGRST002",
  "PGRST003",
]);
/**
 * Postgres SQLSTATEs that mean "not right now": shutdown/crash recovery,
 * connection exceptions and connection exhaustion. 40001 is deliberately
 * absent: this app uses it for "changed in another tab" conflicts.
 */
const TRANSIENT_SQLSTATE = /^(57P0[123]|08\d{3}|53300|40P01)$/;
const NETWORK_TEXT =
  /failed to fetch|fetch failed|networkerror|network request failed|load failed|econnreset|etimedout|socket hang up/i;
/** Non-JSON gateway bodies that PostgREST clients surface as `{ message }`. */
const GATEWAY_TEXT =
  /bad gateway|service unavailable|gateway time-?out|upstream connect error|\b50[234]\b/i;
const NETWORK_ERROR_NAMES = new Set([
  "FunctionsFetchError",
  "FunctionsRelayError",
]);

type Loose = Record<string, unknown>;

const asRecord = (value: unknown): Loose | null =>
  value && typeof value === "object" ? (value as Loose) : null;

function httpStatus(error: Loose): number | null {
  for (const value of [
    error.status,
    error.statusCode,
    asRecord(error.context)?.status,
  ]) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return null;
}

const isTransientStatus = (status: number) =>
  status === 408 || status === 429 || (status >= 500 && status !== 501);

/** True when retrying the same read has a real chance of succeeding. */
export function isTransientError(error: unknown): boolean {
  const e = asRecord(error);
  if (!e) return false;
  const name = typeof e.name === "string" ? e.name : "";
  if (name === "AbortError") return false;
  if (NETWORK_ERROR_NAMES.has(name)) return true;

  const code = typeof e.code === "string" ? e.code : "";
  if (TRANSIENT_POSTGREST.has(code) || TRANSIENT_SQLSTATE.test(code))
    return true;

  const status = httpStatus(e);
  if (status !== null) return isTransientStatus(status);

  const message = typeof e.message === "string" ? e.message : "";
  if (NETWORK_TEXT.test(message)) return true;
  // Only uncoded errors can be raw gateway pages; a coded error that merely
  // mentions a number is an application error.
  return !code && GATEWAY_TEXT.test(message);
}

/** `retry` for queries: transient failures only, bounded. */
export function queryRetry(failureCount: number, error: unknown): boolean {
  return failureCount < MAX_QUERY_RETRIES && isTransientError(error);
}

/** Exponential backoff (0.5s, 1s, 2s … capped at 8s) with a little jitter. */
export function queryRetryDelay(
  failureCount: number,
  random: () => number = Math.random,
): number {
  const base = Math.min(RETRY_BASE_MS * 2 ** failureCount, RETRY_MAX_MS);
  return base + Math.floor(random() * RETRY_JITTER_MS);
}

/**
 * Mutation meta understood by the global MutationCache handler:
 * - `errorToast: false` when the component reports the error itself in a way
 *   the cache cannot see (e.g. per-call `mutate(vars, { onError })`).
 * - `errorTitle` to name the failed action in the toast.
 */
export type MutationToastMeta = {
  errorToast?: boolean;
  errorTitle?: string;
};

type MutationLike = {
  options: { onError?: unknown };
  meta?: Record<string, unknown>;
};

/** Toast only mutations that have no error handling of their own. */
export function shouldToastMutationError(mutation: MutationLike): boolean {
  if (mutation.meta?.errorToast === false) return false;
  return typeof mutation.options.onError !== "function";
}

export function mutationErrorToast(
  error: unknown,
  meta: Record<string, unknown> | undefined,
) {
  const title =
    typeof meta?.errorTitle === "string" && meta.errorTitle.trim()
      ? meta.errorTitle
      : "That change was not saved";
  const description = isTransientError(error)
    ? "The server was temporarily unavailable. Wait a moment, then try again."
    : errorMessage(error);
  return { title, description, variant: "destructive" as const };
}
