/**
 * GoHighLevel booking widgets (including white-label domains such as
 * api.aiforbusiness.com). Bookings land in GHL directly and are not reported
 * back to the site, so callers must not wait on a booking status.
 */
const WIDGET_PATH = /^\/widget\/booking\/([A-Za-z0-9_-]{8,64})\/?$/;

export function ghlBookingWidgetId(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return null;
    return WIDGET_PATH.exec(parsed.pathname)?.[1] ?? null;
  } catch {
    return null;
  }
}

export function isGhlBookingUrl(url: string): boolean {
  return ghlBookingWidgetId(url) !== null;
}

/** Prefills the widget's contact form with what the applicant already gave. */
export function ghlEmbedUrl(
  url: string,
  contact: { name?: string; email?: string } | null,
  phone?: string,
): string {
  const embed = new URL(url);
  const [first = "", ...rest] = (contact?.name ?? "").trim().split(/\s+/);
  if (first) embed.searchParams.set("first_name", first);
  if (rest.length) embed.searchParams.set("last_name", rest.join(" "));
  if (contact?.email) embed.searchParams.set("email", contact.email);
  if (phone?.trim()) embed.searchParams.set("phone", phone.trim());
  return embed.toString();
}
