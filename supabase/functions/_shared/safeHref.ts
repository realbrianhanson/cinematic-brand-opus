const ALLOWED_SCHEMES = ["http:", "https:", "mailto:"];

/**
 * Returns a safe href, or null when the URL must not be linked.
 * Accepts site-relative paths and http / https / mailto absolute URLs only.
 */
export function safeHref(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const url = raw.trim();
  if (!url) return null;
  // Reject control characters and whitespace used to smuggle schemes.
  // eslint-disable-next-line no-control-regex -- blocking control characters is the point
  if (/[\u0000-\u001f\u007f<>"'\\]/.test(url)) return null;
  if (url.startsWith("//")) return null; // protocol-relative
  if (url.startsWith("/")) return url;
  if (url.startsWith("#")) return null;
  try {
    const parsed = new URL(url);
    if (!ALLOWED_SCHEMES.includes(parsed.protocol)) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}
