/**
 * Automatic 404 handling at the server entry (src/server.ts).
 *
 * A GET/HEAD request whose HTML response is a 404 (unknown route, or a route
 * loader that threw notFound for a missing post/guide/resource/offer) becomes
 * a redirect only when an explicit saved rule exists. Otherwise the path is
 * recorded for the admin Redirects page and the original 404 stays intact.
 * Files, admin, API and asset paths are not looked up. Database failures must
 * not disguise a missing page as a homepage redirect.
 */
import {
  classifyUserAgent,
  isContentPreviewPath,
  isRedirectEligiblePath,
  normalizeRedirectPath,
  sanitizeReferrer,
  type RedirectStatus,
} from "../../supabase/functions/_shared/redirectPaths";
import { hasAdminPreviewCookie } from "./adminPreviewCookie";
import {
  findMissingPageDestination,
  supabaseNotFoundLookup,
  type NotFoundLookup,
} from "./notFoundLookup";
import { createPublicServerClient } from "./publicData.server";

export { ADMIN_PREVIEW_COOKIE } from "./adminPreviewCookie";
export type { NotFoundLookup } from "./notFoundLookup";

/** Total time budget for both database calls on one missing page. */
export const NOT_FOUND_LOOKUP_TIMEOUT_MS = 1500;

function isHtmlNotFound(request: Request, response: Response): boolean {
  if (request.method !== "GET" && request.method !== "HEAD") return false;
  if (response.status !== 404) return false;
  return (response.headers.get("content-type") ?? "").includes("text/html");
}

function redirectResponse(location: string, status: RedirectStatus): Response {
  return new Response(null, {
    status,
    headers: {
      location,
      "cache-control": status === 301 ? "public, max-age=3600" : "no-store",
    },
  });
}

/** The page is eligible and not an admin's draft preview. */
function redirectablePath(request: Request): { url: URL; path: string } | null {
  let url: URL;
  try {
    url = new URL(request.url);
  } catch {
    return null;
  }
  if (!isRedirectEligiblePath(url.pathname)) return null;
  if (
    isContentPreviewPath(url.pathname) &&
    hasAdminPreviewCookie(request.headers.get("cookie"))
  )
    return null;
  const path = normalizeRedirectPath(url.pathname);
  return path ? { url, path } : null;
}

/**
 * Returns a redirect for an eligible HTML 404, or null to keep the original
 * response untouched.
 */
export async function redirectForNotFound(
  request: Request,
  response: Response,
  lookup?: NotFoundLookup,
  options: { timeoutMs?: number } = {},
): Promise<Response | null> {
  if (!isHtmlNotFound(request, response)) return null;
  const target = redirectablePath(request);
  if (!target) return null;

  const controller = new AbortController();
  try {
    let deps = lookup;
    if (!deps) {
      try {
        deps = supabaseNotFoundLookup(
          createPublicServerClient(),
          controller.signal,
        );
      } catch (error) {
        console.error("[not-found] database client unavailable", error);
        deps = { resolve: async () => null, record: async () => undefined };
      }
    }
    const destination = await findMissingPageDestination(
      {
        path: target.path,
        search: target.url.search,
        referrer: sanitizeReferrer(request.headers.get("referer")),
        uaClass: classifyUserAgent(request.headers.get("user-agent")),
      },
      deps,
      options.timeoutMs ?? NOT_FOUND_LOOKUP_TIMEOUT_MS,
    );
    if (!destination) return null;
    void response.body?.cancel().catch(() => undefined);
    return redirectResponse(destination.location, destination.status);
  } finally {
    controller.abort();
  }
}
