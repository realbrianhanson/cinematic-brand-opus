/**
 * Client-side password policy for admin accounts. The auth server remains the
 * final authority (its own minimum and leaked-password check still apply);
 * this only stops obviously weak choices before a round trip.
 */
export const PASSWORD_MIN_LENGTH = 12;
/** GoTrue hashes with bcrypt, which rejects passwords over 72 bytes. */
export const PASSWORD_MAX_LENGTH = 72;
const PASSPHRASE_LENGTH = 16;

const COMMON_FRAGMENTS = [
  "password",
  "passw0rd",
  "qwerty",
  "letmein",
  "welcome",
  "admin",
  "123456",
  "iloveyou",
];

export interface PasswordContext {
  email?: string | null;
  current?: string | null;
}

function characterClasses(value: string): number {
  return [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((re) =>
    re.test(value),
  ).length;
}

function emailName(email: string | null | undefined): string | null {
  const local = (email ?? "").split("@")[0]?.toLowerCase() ?? "";
  return local.length >= 4 ? local : null;
}

/** Returns human-readable problems; an empty list means the password is acceptable. */
export function passwordProblems(
  password: string,
  context: PasswordContext = {},
): string[] {
  const problems: string[] = [];
  const lower = password.toLowerCase();
  if (password.length < PASSWORD_MIN_LENGTH)
    problems.push(`Use at least ${PASSWORD_MIN_LENGTH} characters.`);
  if (new TextEncoder().encode(password).length > PASSWORD_MAX_LENGTH)
    problems.push(`Use no more than ${PASSWORD_MAX_LENGTH} characters.`);
  if (password.length < PASSPHRASE_LENGTH && characterClasses(password) < 3)
    problems.push(
      "Mix at least three of: lowercase, uppercase, numbers, symbols — or use 16+ characters.",
    );
  if (password.length > 0 && new Set(password).size <= 2)
    problems.push("Avoid repeating the same character.");
  if (COMMON_FRAGMENTS.some((fragment) => lower.includes(fragment)))
    problems.push("This password is too common.");
  const name = emailName(context.email);
  if (name && lower.includes(name))
    problems.push("Don't include your email name in the password.");
  if (context.current && password === context.current)
    problems.push("Choose a password different from your current one.");
  return problems;
}

interface AuthErrorLike {
  code?: unknown;
  status?: unknown;
  message?: unknown;
  reasons?: unknown;
}

/** Plain-language message for a failed `auth.updateUser({ password })`. */
export function describePasswordUpdateError(error: unknown): string {
  const { code, message, reasons } = (error ?? {}) as AuthErrorLike;
  const text = typeof message === "string" ? message : "";
  if (code === "same_password" || /different from the old password/i.test(text))
    return "Choose a password different from your current one.";
  if (code === "weak_password") {
    if (Array.isArray(reasons) && reasons.includes("pwned"))
      return "This password appears in a known data breach. Choose a different one.";
    return "The server rejected this password as too weak. Choose a longer, less predictable one.";
  }
  if (code === "reauthentication_needed")
    return "For security, sign in again before changing your password.";
  if (code === "session_not_found" || code === "session_expired")
    return "Your session expired. Sign in again.";
  return text || "Unable to update the password. Try again.";
}
