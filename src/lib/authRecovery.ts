/**
 * Reads what a Supabase password-recovery redirect left in the URL. The auth
 * client consumes and clears these parameters during start-up, so the hint is
 * captured once at module load (see `initialRecoveryHint`) before that happens.
 */
export type RecoveryHint =
  { kind: "none" } | { kind: "recovery" } | { kind: "error"; code: string };

const CODE_PATTERN = /^[a-z_]{1,64}$/;

export function readRecoveryHint(href: string): RecoveryHint {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return { kind: "none" };
  }
  const hash = new URLSearchParams(url.hash.replace(/^#/, ""));
  const params = [hash, url.searchParams];
  for (const source of params) {
    const error = source.get("error_code") ?? source.get("error");
    if (error)
      return {
        kind: "error",
        code: CODE_PATTERN.test(error) ? error : "unknown",
      };
  }
  if (hash.get("type") === "recovery" && hash.get("access_token"))
    return { kind: "recovery" };
  return { kind: "none" };
}

export const initialRecoveryHint: RecoveryHint =
  typeof window === "undefined"
    ? { kind: "none" }
    : readRecoveryHint(window.location.href);
