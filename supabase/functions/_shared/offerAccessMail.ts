import { accessUrl, canonicalOfferOrigin } from "./offers.ts";
import { escapeHtml, type NewsletterConfig } from "./newsletterConfig.ts";

export interface AccessMailPayload {
  from: string;
  to: string[];
  reply_to: string;
  subject: string;
  html: string;
  text: string;
}
export function accessMailPayload(
  config: NewsletterConfig,
  email: string,
  links: { title: string; token: string }[],
): AccessMailPayload {
  const origin = canonicalOfferOrigin(config.siteUrl);
  const resources = links.map((link) => ({
    title: link.title,
    url: accessUrl(origin, link.token),
  }));
  return {
    from: config.fromAddress,
    to: [email],
    reply_to: config.replyTo,
    subject: `Your download access · ${config.siteName}`
      .replace(/[\r\n]/g, " ")
      .slice(0, 200),
    html: `<h1>Your downloads</h1><p>Here are the private access links requested for this email address:</p><ul>${resources.map(({ title, url }) => `<li><a href="${escapeHtml(url)}">${escapeHtml(title)}</a></li>`).join("")}</ul><p>These links are private and valid for 30 days. Anyone with a link can use it. You can request fresh links from <a href="${escapeHtml(origin)}/offer-access?recover=1">download recovery</a>. Refunds revoke download access.</p><p>This message does not subscribe you to a newsletter. If you did not request it, you can ignore it or contact <a href="mailto:${escapeHtml(config.replyTo)}">${escapeHtml(config.replyTo)}</a>.</p>`,
    text: `Your downloads\n\n${resources.map(({ title, url }) => `${title}\n${url}`).join("\n\n")}\n\nPrivate links expire after 30 days. Anyone with a link can use it. Request fresh links: ${origin}/offer-access?recover=1\nRefunds revoke access. This is not a newsletter subscription. If you did not request this message, ignore it or contact ${config.replyTo}.`,
  };
}
export function randomAccessToken(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
async function envelopeKey(secret: string): Promise<CryptoKey> {
  if (!secret) throw new Error("Delivery encryption unavailable");
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    "HKDF",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new TextEncoder().encode("offer-access-mail-v1"),
      info: new TextEncoder().encode("private-outbox-envelope"),
    },
    key,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}
export async function encryptAccessMail(
  payload: AccessMailPayload,
  secret: string,
  deliveryId: string,
): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
      additionalData: new TextEncoder().encode(deliveryId),
    },
    await envelopeKey(secret),
    new TextEncoder().encode(JSON.stringify(payload)),
  );
  return `v1.${btoa(String.fromCharCode(...iv))}.${btoa(String.fromCharCode(...new Uint8Array(cipher)))}`;
}
export async function decryptAccessMail(
  value: string,
  secret: string,
  deliveryId: string,
): Promise<AccessMailPayload> {
  const [version, encodedIv, encodedCipher] = value.split(".");
  if (version !== "v1" || !encodedIv || !encodedCipher)
    throw new Error("Invalid delivery envelope");
  const decode = (encoded: string) =>
    Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0));
  const plain = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: decode(encodedIv),
      additionalData: new TextEncoder().encode(deliveryId),
    },
    await envelopeKey(secret),
    decode(encodedCipher),
  );
  return JSON.parse(new TextDecoder().decode(plain)) as AccessMailPayload;
}

/** Outcome of one provider call. `uncertain` means Resend may have accepted it. */
export type AccessMailOutcome = "sent" | "not_sent" | "uncertain";
export interface AccessMailResult {
  outcome: AccessMailOutcome;
  providerId: string | null;
  httpStatus: number | null;
  error: string | null;
  detail: string | null;
}
const RETRY_BASE_SECONDS = 300;
const RETRY_MAX_SECONDS = 21600;
const DETAIL_LIMIT = 500;
const PROVIDER_MESSAGE_LIMIT = 300;

/** Delay after the given (1-based) failed attempt: 5 min doubling to a 6 h cap. */
export function offerDeliveryRetryDelaySeconds(attempts: number): number {
  const exponent = Number.isFinite(attempts) ? Math.max(0, attempts - 1) : 0;
  return Math.min(
    RETRY_BASE_SECONDS * 2 ** Math.min(exponent, 16),
    RETRY_MAX_SECONDS,
  );
}
/** Bounded, single-line provider text with email addresses removed. */
export function safeDeliveryText(value: string, limit: number): string {
  return Array.from(value)
    .map((character) => {
      const code = character.charCodeAt(0);
      return code < 32 || code === 127 ? " " : character;
    })
    .join("")
    .replace(/[^\s@<>()"',;:]+@[^\s@<>()"',;:]+/g, "[email]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, limit);
}
function providerMessage(body: string): string {
  try {
    const parsed = JSON.parse(body) as { message?: unknown; name?: unknown };
    if (typeof parsed.message === "string") return parsed.message;
    if (typeof parsed.name === "string") return parsed.name;
  } catch {
    /* Plain-text provider bodies are summarized as-is. */
  }
  return body;
}
function rejectionSummary(status: number): string {
  if (status === 401)
    return "Resend rejected the API key (HTTP 401). Check RESEND_API_KEY in the server secrets.";
  if (status === 403)
    return "Resend refused to send (HTTP 403). This usually means the sending domain is not verified in Resend or the API key cannot send from it.";
  if (status === 422)
    return "Resend rejected the message (HTTP 422). Check the sender and reply-to addresses in Brand & publishing.";
  if (status === 429)
    return "Resend rate or daily quota limit reached (HTTP 429). Nothing was sent.";
  return `Resend rejected the request (HTTP ${status}). Nothing was sent.`;
}
/** Classifies a provider HTTP response. Only 2xx with an id counts as sent. */
export function classifyAccessMailResponse(
  status: number,
  body: string,
  providerId: string | null,
): AccessMailResult {
  const said = safeDeliveryText(providerMessage(body), PROVIDER_MESSAGE_LIMIT);
  const withReason = (summary: string) =>
    safeDeliveryText(
      said ? `${summary} Resend said: "${said}"` : summary,
      DETAIL_LIMIT,
    );
  if (status >= 200 && status < 300 && providerId)
    return {
      outcome: "sent",
      providerId,
      httpStatus: status,
      error: null,
      detail: null,
    };
  const uncertain =
    (status >= 200 && status < 300) || status === 409 || status >= 500;
  if (uncertain)
    return {
      outcome: "uncertain",
      providerId: null,
      httpStatus: status,
      error: "provider_uncertain",
      detail: withReason(
        status === 409
          ? "Resend reported a duplicate-request conflict (HTTP 409); an earlier attempt with the same key may still be processing."
          : status >= 500
            ? `Resend had a server error (HTTP ${status}); it may or may not have accepted the email.`
            : `Resend answered (HTTP ${status}) without a message ID; it may have accepted the email.`,
      ),
    };
  return {
    outcome: "not_sent",
    providerId: null,
    httpStatus: status,
    error: status === 429 ? "provider_rate_limited" : "provider_rejected",
    detail: withReason(rejectionSummary(status)),
  };
}

export async function sendAccessMail(
  payload: AccessMailPayload,
  apiKey: string,
  deliveryId: string,
  fetcher: typeof fetch = fetch,
): Promise<AccessMailResult> {
  let response: Response;
  try {
    response = await fetcher("https://api.resend.com/emails", {
      method: "POST",
      signal: AbortSignal.timeout(15000),
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `offer-access-${deliveryId}`,
      },
      body: JSON.stringify(payload),
    });
  } catch {
    return {
      outcome: "uncertain",
      providerId: null,
      httpStatus: null,
      error: "provider_uncertain",
      detail:
        "Could not reach Resend, or it did not answer within 15 seconds; the email may or may not have been accepted.",
    };
  }
  let body = "";
  try {
    body = (await response.text()).slice(0, 4096);
  } catch {
    /* An unreadable body leaves only the status to classify. */
  }
  let providerId: string | null = null;
  if (response.ok) {
    try {
      const id = (JSON.parse(body) as { id?: unknown }).id;
      providerId =
        typeof id === "string" && id.length > 0 && id.length <= 200 ? id : null;
    } catch {
      providerId = null;
    }
  }
  return classifyAccessMailResponse(response.status, body, providerId);
}
