/**
 * In-app side of the automatic 404 handling: a visitor who navigates inside
 * the site to a page that does not exist goes to a saved rule's destination
 * or the home page, the same as a direct load handled by src/server.ts.
 */
import {
  classifyUserAgent,
  isRedirectEligiblePath,
  normalizeRedirectPath,
  sanitizeReferrer,
} from "../../supabase/functions/_shared/redirectPaths";
import {
  findMissingPageDestination,
  type NotFoundLookup,
} from "./notFoundLookup";

export const CLIENT_LOOKUP_TIMEOUT_MS = 4000;
const ADMIN_HOME = "/admin";

export type ClientDestination =
  | { kind: "stay" }
  | { kind: "navigate"; href: string }
  | { kind: "external"; href: string };

export type MissingPageLocation = {
  pathname: string;
  search: string;
  referrer: string;
  userAgent: string;
};

function isAdminArea(pathname: string): boolean {
  const path = normalizeRedirectPath(pathname);
  return path === ADMIN_HOME || !!path?.startsWith(`${ADMIN_HOME}/`);
}

export async function missingPageClientDestination(
  location: MissingPageLocation,
  lookup: NotFoundLookup,
  timeoutMs = CLIENT_LOOKUP_TIMEOUT_MS,
): Promise<ClientDestination> {
  // Unknown admin screens go to the admin overview and are never logged.
  if (isAdminArea(location.pathname))
    return { kind: "navigate", href: ADMIN_HOME };
  if (!isRedirectEligiblePath(location.pathname)) return { kind: "stay" };
  const path = normalizeRedirectPath(location.pathname) as string;
  const destination = await findMissingPageDestination(
    {
      path,
      search: location.search,
      referrer: sanitizeReferrer(location.referrer),
      uaClass: classifyUserAgent(location.userAgent),
    },
    lookup,
    timeoutMs,
  );
  return destination.location.startsWith("/")
    ? { kind: "navigate", href: destination.location }
    : { kind: "external", href: destination.location };
}
