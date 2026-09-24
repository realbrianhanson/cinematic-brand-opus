import {
  escapeHtml,
  isValidEmail,
  type NewsletterConfig,
} from "./newsletterConfig.ts";
import {
  classifyAccessMailResponse,
  type AccessMailPayload,
  type AccessMailResult,
} from "./offerAccessMail.ts";
import type { SpeakingInquiryInput } from "./speakingInquiries.ts";

export type SpeakingMailKind = "owner" | "acknowledgement" | "reminder";
export type SpeakingMailInquiry = Omit<SpeakingInquiryInput, "request_id">;

export function speakingNotificationRecipient(
  configured: string,
  fallback: string,
): string | null {
  const email = (configured || fallback).trim().toLowerCase();
  return isValidEmail(email) && !/[\r\n]/.test(email) ? email : null;
}

export function speakingNotificationPayload(
  config: NewsletterConfig,
  ownerEmail: string,
  kind: SpeakingMailKind,
  inquiry: SpeakingMailInquiry,
): AccessMailPayload {
  const origin = new URL(config.siteUrl);
  if (origin.protocol !== "https:") throw new Error("Secure site URL required");
  const inbox = `${origin.origin}/admin/inquiries`;
  const acknowledgement = kind === "acknowledgement";
  const heading = acknowledgement
    ? "Your speaking inquiry was received"
    : kind === "reminder"
      ? "A speaking inquiry still needs a reply"
      : "New speaking inquiry";
  // A public form must not become a way to email attacker-controlled text or links
  // to arbitrary addresses. Only the private owner email includes submitted text.
  const text = acknowledgement
    ? `Thank you for getting in touch about an event. Your inquiry has been saved for review. This confirms receipt only; availability and booking details have not been agreed. You can reply to this email with any updates.\n\nThis message does not subscribe you to marketing emails. If you did not submit a speaking inquiry, you can ignore it.`
    : `${kind === "reminder" ? "This inquiry has remained New for at least 48 hours. Review it and mark it Contacted after replying.\n\n" : "An organizer submitted a speaking inquiry.\n\n"}Contact: ${inquiry.name} <${inquiry.email}>\nEvent: ${inquiry.event_name}\nTimeframe: ${inquiry.event_date || "Not provided"}\nFormat: ${inquiry.event_format}\nAudience: ${inquiry.audience || "Not provided"}\n\n${inquiry.message || "No additional details provided."}\n\nPrivate inbox: ${inbox}`;
  return {
    from: config.fromAddress,
    to: [acknowledgement ? inquiry.email : ownerEmail],
    reply_to: acknowledgement ? ownerEmail : inquiry.email,
    subject: `${heading} · ${config.siteName}`
      .replace(/[\r\n]/g, " ")
      .slice(0, 200),
    text: `${heading}\n\n${text}`,
    html: `<h1>${escapeHtml(heading)}</h1><p style="white-space:pre-wrap">${escapeHtml(text)}</p>${acknowledgement ? "" : `<p><a href="${escapeHtml(inbox)}">Open the private inbox</a></p>`}`,
  };
}

export async function sendSpeakingNotification(
  payload: AccessMailPayload,
  apiKey: string,
  deliveryId: string,
  fetcher: typeof fetch = fetch,
): Promise<AccessMailResult> {
  try {
    const response = await fetcher("https://api.resend.com/emails", {
      method: "POST",
      signal: AbortSignal.timeout(15000),
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `speaking-${deliveryId}`,
      },
      body: JSON.stringify(payload),
    });
    const body = (await response.text()).slice(0, 4096);
    let providerId: string | null = null;
    try {
      const parsed = JSON.parse(body) as { id?: unknown };
      if (
        typeof parsed.id === "string" &&
        parsed.id.length > 0 &&
        parsed.id.length <= 200
      )
        providerId = parsed.id;
    } catch {
      /* Only a provider receipt confirms acceptance. */
    }
    return classifyAccessMailResponse(response.status, body, providerId);
  } catch {
    return {
      outcome: "uncertain",
      providerId: null,
      httpStatus: null,
      error: "provider_uncertain",
      detail:
        "The email provider did not confirm acceptance. A safe retry is queued.",
    };
  }
}
