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

export async function sendAccessMail(
  payload: AccessMailPayload,
  apiKey: string,
  deliveryId: string,
  fetcher: typeof fetch = fetch,
): Promise<string | null> {
  try {
    const response = await fetcher("https://api.resend.com/emails", {
      method: "POST",
      signal: AbortSignal.timeout(15000),
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `offer-access-${deliveryId}`,
      },
      body: JSON.stringify(payload),
    });
    if (!response.ok) return null;
    const result = await response.json();
    return typeof result.id === "string" &&
      result.id.length > 0 &&
      result.id.length <= 200
      ? result.id
      : null;
  } catch {
    return null;
  }
}
