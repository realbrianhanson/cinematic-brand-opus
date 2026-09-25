/**
 * Marks a browser that has opened the admin workspace.
 *
 * Draft previews open the public URL (for example /blog/draft-slug). The
 * server renders those as a 404 for anonymous reads, then the signed-in admin
 * sees the draft in the browser. Saved-redirect resolution skips
 * content detail pages for browsers carrying this cookie so previews keep
 * working. It grants nothing: anyone setting it only sees the normal 404 page.
 */
export const ADMIN_PREVIEW_COOKIE = "bh_admin_preview";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export function hasAdminPreviewCookie(cookieHeader: string | null): boolean {
  if (!cookieHeader) return false;
  return cookieHeader
    .split(";")
    .some((part) => part.trim().startsWith(`${ADMIN_PREVIEW_COOKIE}=`));
}

function writeCookie(value: string, maxAge: number) {
  if (typeof document === "undefined") return;
  const secure = window.location.protocol === "https:" ? "; secure" : "";
  document.cookie = `${ADMIN_PREVIEW_COOKIE}=${value}; path=/; max-age=${maxAge}; samesite=lax${secure}`;
}

export function markAdminPreviewBrowser() {
  writeCookie("1", MAX_AGE_SECONDS);
}

export function clearAdminPreviewBrowser() {
  writeCookie("", 0);
}
