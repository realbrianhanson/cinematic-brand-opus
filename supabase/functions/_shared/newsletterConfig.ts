// Shared, dependency-free newsletter configuration + rendering helpers.
//
// IMPORTANT: this module must stay free of Deno / browser globals and of remote
// imports so that it can be unit-tested directly from vitest. Callers pass in
// the settings row and the API key.

export interface RawNewsletterSettings {
  site_url?: string | null;
  site_name?: string | null;
  author_name?: string | null;
  newsletter_from_address?: string | null;
  newsletter_reply_to?: string | null;
  newsletter_postal_address?: string | null;
}

export interface NewsletterConfig {
  siteUrl: string;
  siteName: string;
  authorName: string;
  fromAddress: string;
  replyTo: string;
  postalAddress: string | null;
  apiKey: string;
  confirmUrl: string;
  unsubscribeUrl: string;
  postBase: string;
  newsletterPageBase: string;
}

export type NewsletterConfigResult =
  | { ok: true; config: NewsletterConfig }
  | { ok: false; missing: string[] };

const EMAIL_RE = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
const SENDER_RE = /^\s*(?:[^<>]{1,80}<\s*([^\s@<>]+@[^\s@<>]+\.[^\s@<>]+)\s*>|([^\s@<>]+@[^\s@<>]+\.[^\s@<>]+))\s*$/;

export function isValidEmail(value: unknown): boolean {
  return typeof value === "string" &&
    value.length > 0 &&
    value.length <= 254 &&
    EMAIL_RE.test(value);
}

/** Accepts `user@example.com` or `Display Name <user@example.com>`. */
export function isValidSender(value: unknown): boolean {
  return typeof value === "string" && SENDER_RE.test(value);
}

/** Returns an https(s) origin with no trailing slash, or null when unusable. */
export function normalizeSiteUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const raw = value.trim();
  if (!raw) return null;
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
  if (!parsed.hostname.includes(".")) return null;
  const path = parsed.pathname.replace(/\/+$/, "");
  return `${parsed.origin}${path}`;
}

/**
 * Validates every piece of configuration the newsletter needs before any
 * subscriber mutation or send happens. Fails closed with the list of missing
 * settings so callers can surface an honest "unavailable" state.
 */
export function resolveNewsletterConfig(
  settings: RawNewsletterSettings | null | undefined,
  apiKey: string | null | undefined,
): NewsletterConfigResult {
  const missing: string[] = [];

  const siteUrl = normalizeSiteUrl(settings?.site_url);
  if (!siteUrl) missing.push("site_settings.site_url");

  const from = (settings?.newsletter_from_address ?? "").trim();
  if (!isValidSender(from)) missing.push("site_settings.newsletter_from_address");

  const replyTo = (settings?.newsletter_reply_to ?? "").trim();
  if (!isValidEmail(replyTo)) missing.push("site_settings.newsletter_reply_to");

  const key = (apiKey ?? "").trim();
  if (!key) missing.push("RESEND_API_KEY");

  if (missing.length > 0) return { ok: false, missing };

  const siteName = (settings?.site_name ?? "").trim() || new URL(siteUrl!).hostname;
  const authorName = (settings?.author_name ?? "").trim() || siteName;
  const postal = (settings?.newsletter_postal_address ?? "").trim() || null;

  return {
    ok: true,
    config: {
      siteUrl: siteUrl!,
      siteName,
      authorName,
      fromAddress: from,
      replyTo,
      postalAddress: postal,
      apiKey: key,
      confirmUrl: `${siteUrl}/api/public/newsletter/confirm`,
      unsubscribeUrl: `${siteUrl}/api/public/newsletter/unsubscribe`,
      postBase: `${siteUrl}/blog`,
      newsletterPageBase: `${siteUrl}/newsletter`,
    },
  };
}

export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function escapeAttr(value: unknown): string {
  return escapeHtml(value);
}

/** Confirmation email, fully derived from configuration (no hardcoded brand). */
export function buildConfirmationEmail(
  config: NewsletterConfig,
  token: string,
): { subject: string; html: string } {
  const confirmHref = `${config.confirmUrl}?token=${encodeURIComponent(token)}`;
  const brand = escapeHtml(config.siteName);
  const author = escapeHtml(config.authorName);
  const subject = `Confirm your subscription to ${config.siteName}`;

  const html =
    `<!doctype html><html><body style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#0b0b12;color:#f3f3f3;margin:0;padding:32px;">
  <div style="max-width:560px;margin:0 auto;background:#12121a;padding:32px;border:1px solid rgba(255,255,255,0.08);">
    <h1 style="font-size:20px;margin:0 0 16px;color:#fff;">Confirm your subscription</h1>
    <p style="font-size:15px;line-height:1.6;color:#d8d8d8;">You (or someone using your email address) asked to receive the ${brand} newsletter. Confirm below and ${author} will start sending it your way.</p>
    <p style="margin:28px 0;"><a href="${escapeAttr(confirmHref)}" style="display:inline-block;background:linear-gradient(135deg,#D4AF55,#B8962E);color:#07070E;padding:14px 28px;text-decoration:none;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;font-size:13px;">Confirm Subscription</a></p>
    <p style="font-size:13px;color:#8a8a8a;">If you did not request this, ignore this email and nothing will be sent.</p>
    ${
      config.postalAddress
        ? `<p style="font-size:11px;color:#666;margin-top:32px;border-top:1px solid rgba(255,255,255,0.06);padding-top:16px;">${escapeHtml(config.postalAddress)}</p>`
        : ""
    }
  </div></body></html>`;

  return { subject, html };
}

/** Outcome of public.newsletter_public_subscribe. */
export type SubscribeState =
  | "confirmation_due"
  | "already_subscribed"
  | "suppressed"
  | "cooldown"
  | "error";

export interface SubscribeApiResponse {
  status: number;
  body: Record<string, unknown>;
}

/**
 * Maps a DB subscribe outcome to a public response. Responses are deliberately
 * uniform for states that would otherwise leak whether an address is on the
 * list (suppressed / cooldown both read as "already requested").
 */
export function subscribeResponseFor(state: SubscribeState): SubscribeApiResponse {
  switch (state) {
    case "confirmation_due":
      return { status: 200, body: { ok: true, state: "confirmation_sent" } };
    case "already_subscribed":
      return { status: 200, body: { ok: true, state: "already_subscribed" } };
    case "suppressed":
    case "cooldown":
      // No enumeration signal: identical shape either way.
      return { status: 200, body: { ok: true, state: "confirmation_already_requested" } };
    default:
      return { status: 500, body: { ok: false, state: "error" } };
  }
}

/** Stable provider idempotency key for one chunk of one week's digest. */
export function buildBatchIdempotencyKey(base: string, chunkIndex: number): string {
  return `${base}-batch-${chunkIndex}`;
}

/** Stable ordering so retried runs chunk recipients identically. */
export function orderRecipients<T extends { id: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
