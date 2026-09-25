import { isValidEmail, isValidSender } from "@/lib/newsletterConfig";

// Field rules for Brand & publishing. They mirror the CHECK constraints in
// supabase/migrations/20260923151000_indexnow_and_settings_checks.sql, so a
// value the form accepts is never rejected by the database.

export type ValidatedSettings = {
  site_url: string;
  gsc_property?: string;
  publisher_url: string | null;
  cta_url: string | null;
  newsletter_from_address: string;
  newsletter_reply_to: string;
  report_email: string;
  report_enabled: boolean;
  author_social_links: Record<string, string>;
};

export type FieldErrors = Record<string, string>;

function parseHttps(value: string): URL | null {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" || url.username || url.password) return null;
    if (!url.hostname.includes(".")) return null;
    return url;
  } catch {
    return null;
  }
}

/** An https origin (optionally with a trailing slash), no path or query. */
export function isHttpsOrigin(value: string): boolean {
  const url = parseHttps(value);
  return !!url && url.pathname === "/" && !url.search && !url.hash;
}

export function normalizeOrigin(value: string): string {
  const url = parseHttps(value);
  return url ? url.origin : value.trim();
}

const isHttpsUrl = (value: string) =>
  !!parseHttps(value) && !/\s/.test(value.trim());

const isSitePath = (value: string) => /^\/(?!\/)\S*$/.test(value);

export function validateSiteSettings(form: ValidatedSettings): FieldErrors {
  const errors: FieldErrors = {};
  const trimmed = (v: string | null | undefined) => (v ?? "").trim();

  if (!isHttpsOrigin(trimmed(form.site_url)))
    errors.site_url =
      "Enter your full web address starting with https://, like https://yourdomain.com";

  const property = trimmed(form.gsc_property);
  if (
    property &&
    !/^sc-domain:[a-zA-Z0-9]([a-zA-Z0-9.-]*[a-zA-Z0-9])?\.[a-zA-Z]{2,}$/.test(
      property,
    ) &&
    !(
      isHttpsUrl(property) &&
      !new URL(property).search &&
      !new URL(property).hash
    )
  )
    errors.gsc_property =
      "Use sc-domain:yourdomain.com or the exact https:// URL-prefix property";

  const publisher = trimmed(form.publisher_url);
  if (publisher && !isHttpsUrl(publisher))
    errors.publisher_url = "Use a full https:// address, or leave it blank";

  const cta = trimmed(form.cta_url);
  if (cta && !isHttpsUrl(cta) && !isSitePath(cta))
    errors.cta_url =
      "Use a full https:// link or a page on this site starting with /";

  const sender = trimmed(form.newsletter_from_address);
  if (sender && !isValidSender(sender))
    errors.newsletter_from_address = "Use Name <you@domain.com>";

  const replyTo = trimmed(form.newsletter_reply_to);
  if (replyTo && !isValidEmail(replyTo))
    errors.newsletter_reply_to = "Enter one email address, like you@domain.com";

  const report = trimmed(form.report_email);
  if (report && !isValidEmail(report))
    errors.report_email = "Enter one email address, like you@domain.com";
  else if (!report && form.report_enabled)
    errors.report_email =
      "Add your email to turn on weekly reports, or switch reports off";

  for (const [platform, link] of Object.entries(form.author_social_links)) {
    const value = trimmed(link);
    if (value && !isHttpsUrl(value))
      errors[`social.${platform}`] = "Use a full https:// link";
  }
  return errors;
}

const CONSTRAINT_FIELDS: Record<string, string> = {
  site_settings_site_url_https:
    "Site URL. Use an https:// address with no path",
  site_settings_publisher_url_https:
    "Publisher URL. Use an https:// address or leave it blank",
  site_settings_cta_url_format:
    "CTA URL. Use an https:// link or a path starting with /",
  site_settings_newsletter_from_format:
    "the verified sender. Use Name <you@domain.com>",
  site_settings_newsletter_reply_to_format:
    "the reply-to email. Enter one email address",
  site_settings_private_report_email_format:
    "Report email. Enter one email address",
};

/** Plain-English message for a CHECK violation (SQLSTATE 23514), else null. */
export function checkViolationMessage(error: unknown): string | null {
  if (!error || typeof error !== "object") return null;
  const { code, message } = error as { code?: unknown; message?: unknown };
  if (code !== "23514" || typeof message !== "string") return null;
  const name = Object.keys(CONSTRAINT_FIELDS).find((k) => message.includes(k));
  return name
    ? `The database rejected ${CONSTRAINT_FIELDS[name]}, then save again.`
    : "The database rejected one of the values. Check the highlighted format rules, then save again.";
}
