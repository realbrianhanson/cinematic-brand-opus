import { isValidEmail } from "./newsletterConfig.ts";

export interface TransactionalSuppression {
  email: string;
  reason: "bounced" | "complained";
}

/** Call only after signature verification. Never enrolls recipients in marketing. */
export function verifiedResendSuppressions(
  event: unknown,
): TransactionalSuppression[] {
  if (!event || typeof event !== "object") return [];
  const { type, data } = event as { type?: unknown; data?: unknown };
  if (
    (type !== "email.bounced" && type !== "email.complained") ||
    !data ||
    typeof data !== "object"
  )
    return [];
  const to = (data as { to?: unknown }).to;
  const recipients = Array.isArray(to) ? to : [to];
  const reason = type === "email.bounced" ? "bounced" : "complained";
  const emails = new Set<string>();
  for (const recipient of recipients) {
    if (typeof recipient !== "string") continue;
    const normalized = recipient.trim().toLowerCase();
    if (isValidEmail(normalized)) emails.add(normalized);
  }
  return Array.from(emails, (email) => ({ email, reason }));
}

export async function persistVerifiedResendSuppressions(
  event: unknown,
  persist: (suppression: TransactionalSuppression) => Promise<boolean>,
): Promise<number> {
  const suppressions = verifiedResendSuppressions(event);
  for (const suppression of suppressions) {
    if (!(await persist(suppression)))
      throw new Error("Suppression storage unavailable");
  }
  return suppressions.length;
}
