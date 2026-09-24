// Plain-English newsletter delivery states for the admin. Pure: no network.

export type SendTone = "success" | "warning" | "danger" | "info" | "muted";

export interface SendCounts {
  status: string;
  sent_count?: number | null;
  recipient_count?: number | null;
}

export interface SendStatusView {
  tone: SendTone;
  label: string;
}

const count = (value: number | null | undefined) =>
  typeof value === "number" && Number.isFinite(value) ? value : 0;

export function sendStatusView(row: SendCounts): SendStatusView {
  const sent = count(row.sent_count);
  const total = count(row.recipient_count);
  switch (row.status) {
    case "preview":
      return { tone: "info", label: "Preview · sends Tuesday" };
    case "sending":
      return {
        tone: "info",
        label: `Sending · ${sent} of ${total} delivered so far`,
      };
    case "sent": {
      const tone: SendTone =
        total > 0 && sent === total
          ? "success"
          : sent === 0
            ? "danger"
            : "warning";
      return { tone, label: `Sent · ${sent} of ${total} delivered` };
    }
    case "failed":
      return { tone: "danger", label: `Not delivered · ${sent} of ${total}` };
    case "needs_review":
      return {
        tone: "danger",
        label: `Delivery stopped · ${sent} of ${total} delivered`,
      };
    case "cancelled":
      return { tone: "muted", label: "Cancelled" };
    default:
      return { tone: "muted", label: "Status unknown" };
  }
}

const DOMAIN_RE = /([a-z0-9-]+(?:\.[a-z0-9-]+)+)/i;

/** Domain of `Name <user@domain>` or `user@domain`, lower-cased. */
export function senderDomain(from: string | null | undefined): string | null {
  if (!from) return null;
  const match = /@([^\s<>@]+?)\s*>?\s*$/.exec(from.trim());
  if (!match || !DOMAIN_RE.test(match[1])) return null;
  return match[1].toLowerCase();
}

export interface DeliveryErrorInput {
  status: number | null | undefined;
  detail: string | null | undefined;
  fromAddress?: string | null;
}

export interface DeliveryErrorExplanation {
  title: string;
  explanation: string;
  action: string;
  /** False when the provider may have delivered: never offer a retry. */
  retryable: boolean;
}

function providerMessage(detail: string): string {
  return detail.replace(/^Provider returned HTTP \d{3}:?\s*/, "").trim();
}

function unverifiedDomain(detail: string): string | null {
  const match = /the\s+(\S+)\s+domain is not verified/i.exec(detail);
  return match ? match[1].toLowerCase() : null;
}

function explainRejection(
  status: number,
  detail: string,
  fromAddress: string | null | undefined,
): DeliveryErrorExplanation {
  const message = providerMessage(detail);
  const said = message ? ` Resend said: “${message}”` : "";
  if (status === 403) {
    const named = unverifiedDomain(detail);
    const domain = named ?? senderDomain(fromAddress) ?? "your sending domain";
    return {
      title: named
        ? "Resend rejected: domain not verified (403)"
        : "Resend rejected the sender (403)",
      explanation: `Resend refused to send from ${domain}, so these recipients got nothing.${said}`,
      action: named
        ? `Verify ${domain} in Resend (Domains → add the DNS records it shows), then retry failed recipients.`
        : `Verify ${domain} in Resend (Domains → add the DNS records it shows) and check that RESEND_API_KEY can send from it, then retry failed recipients.`,
      retryable: true,
    };
  }
  if (status === 401)
    return {
      title: "Resend rejected the API key (401)",
      explanation: `The RESEND_API_KEY secret is missing, revoked or wrong.${said}`,
      action:
        "Create a sending key in Resend, update the RESEND_API_KEY secret in Supabase, then retry failed recipients.",
      retryable: true,
    };
  if (status === 429)
    return {
      title: "Resend rate limit reached (429)",
      explanation: `Resend asked us to slow down before every recipient was sent.${said}`,
      action: "Wait a few minutes, then retry failed recipients.",
      retryable: true,
    };
  return {
    title: `Resend rejected the message (${status})`,
    explanation: `Resend refused this email.${said || " No reason was given."}`,
    action:
      "Check the sender and reply-to addresses in Brand & publishing, then retry failed recipients.",
    retryable: true,
  };
}

export function explainDeliveryError(
  input: DeliveryErrorInput,
): DeliveryErrorExplanation | null {
  const detail = (input.detail ?? "").trim();
  const status =
    typeof input.status === "number"
      ? input.status
      : Number(/HTTP (\d{3})/.exec(detail)?.[1]) || null;
  if (status && status >= 500)
    return {
      title: `Resend's answer was unclear (${status})`,
      explanation:
        "Resend had a server problem, so some recipients may already have this issue.",
      action:
        "Check Resend → Emails for this send before doing anything. Retrying is locked to avoid double sends.",
      retryable: false,
    };
  if (status && status >= 400)
    return explainRejection(status, detail, input.fromAddress);
  if (!detail) return null;
  if (/nobody was emailed/i.test(detail))
    return {
      title: "Nobody was emailed",
      explanation: detail,
      action:
        "Check Audience for confirmed subscribers. Pending sign-ups need their confirmation email first.",
      retryable: false,
    };
  if (/^Recorded as sent/i.test(detail))
    return {
      title: "Recorded as sent, but not delivered",
      explanation: detail,
      action:
        "This older issue has no delivery receipts, so it can't be resent safely. Fix the sender, then let the next issue go out.",
      retryable: false,
    };
  if (/interrupted|incomplete|unclear|unknown/i.test(detail))
    return {
      title: "Resend's answer was unclear",
      explanation: detail,
      action:
        "Check Resend → Emails for this send before doing anything. Retrying is locked to avoid double sends.",
      retryable: false,
    };
  return {
    title: "Delivery failed",
    explanation: detail,
    action: "Check the sender settings and Resend, then try again.",
    retryable: false,
  };
}

export interface RetryGateInput {
  status: string;
  hasSnapshot: boolean;
  failed: number;
  uncertain: number;
  attempting: number;
}

/** Mirrors newsletter_retry_failed_delivery: only definite rejections. */
export function canRetryFailed(input: RetryGateInput): boolean {
  return (
    (input.status === "failed" || input.status === "needs_review") &&
    input.hasSnapshot &&
    input.failed > 0 &&
    input.uncertain === 0 &&
    input.attempting === 0
  );
}

/** A queued/abandoned 'sending' row with no live lease can be resumed. */
export function canResumeDelivery(
  row: { status: string; delivery_lease_until?: string | null },
  now = Date.now(),
): boolean {
  if (row.status !== "sending") return false;
  if (!row.delivery_lease_until) return true;
  const until = Date.parse(row.delivery_lease_until);
  return !Number.isFinite(until) || until <= now;
}
