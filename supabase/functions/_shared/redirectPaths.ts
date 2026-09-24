/**
 * Shared rules for the automatic 404 -> redirect system.
 *
 * Used by the site server entry (src/server.ts), the in-app not-found screen,
 * the admin Redirects page and the `render-page` crawler function. The SQL in
 * supabase/migrations/20260923160000_redirects.sql mirrors these rules so the
 * database never trusts a caller to have normalized anything.
 *
 * No imports: this file must run unchanged in Node, the browser and Deno.
 */

export const MAX_REDIRECT_PATH_LENGTH = 512;
export const MAX_REDIRECT_URL_LENGTH = 2048;
export const MAX_REFERRER_LENGTH = 300;
export const HOME_PATH = "/";

export type UserAgentClass = "bot" | "human" | "unknown";
export type RedirectStatus = 301 | 302;
export type RedirectTargetResult =
  { ok: true; value: string } | { ok: false; error: string };

// Whitespace, control characters and backslashes are never part of a real
// page address; browsers treat a backslash like "/" which enables `/\evil`.
const SPACE_OR_BACKSLASH = /[\s\\]/;

function hasUnsafePathChars(value: string): boolean {
  if (SPACE_OR_BACKSLASH.test(value)) return true;
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}
const DOT_SEGMENT = /(^|\/)\.{1,2}(\/|$)/;
const FILE_EXTENSION = /\.[a-z0-9]{1,10}$/i;
const HTTPS_URL = /^https:\/\/[a-z0-9.-]+(:[0-9]{1,5})?([/?#][^\s\\]*)?$/i;

/** Paths that keep their real 404: app internals, files and scanner probes. */
const EXCLUDED_PREFIXES = [
  "/admin",
  "/api",
  "/assets",
  "/_",
  "/.",
  "/wp-",
  "/wordpress",
  "/cgi-bin",
  "/xmlrpc",
  "/phpmyadmin",
];

/** Detail pages whose drafts an admin previews by opening the public URL. */
const CONTENT_PREVIEW_PREFIXES = [
  "/blog/",
  "/guides/",
  "/resources/",
  "/news/",
  "/offers/",
];

/**
 * Lowercase site path without query, hash, duplicate or trailing slashes.
 * Returns null for anything that is not a plain site path.
 */
export function normalizeRedirectPath(input: unknown): string | null {
  if (typeof input !== "string") return null;
  let path = input.trim().split("#")[0].split("?")[0];
  if (!path.startsWith("/")) return null;
  if (path.length > MAX_REDIRECT_PATH_LENGTH) return null;
  if (hasUnsafePathChars(path)) return null;
  path = path.replace(/\/{2,}/g, "/").toLowerCase();
  if (DOT_SEGMENT.test(path)) return null;
  if (path.length > 1) path = path.replace(/\/+$/, "") || HOME_PATH;
  return path;
}

function matchesPrefix(path: string, prefix: string): boolean {
  if (prefix.endsWith("-") || prefix === "/_" || prefix === "/.")
    return path.startsWith(prefix);
  return path === prefix || path.startsWith(`${prefix}/`);
}

/** True when a missing page at this path should be redirected (not a file, not admin). */
export function isRedirectEligiblePath(pathname: string): boolean {
  const path = normalizeRedirectPath(pathname);
  if (!path || path === HOME_PATH) return false;
  if (EXCLUDED_PREFIXES.some((prefix) => matchesPrefix(path, prefix)))
    return false;
  const segments = path.split("/");
  if (segments.some((segment) => segment.startsWith("."))) return false;
  return !FILE_EXTENSION.test(segments[segments.length - 1] ?? "");
}

export function isContentPreviewPath(pathname: string): boolean {
  const path = normalizeRedirectPath(pathname);
  return (
    !!path &&
    CONTENT_PREVIEW_PREFIXES.some(
      (prefix) => path.startsWith(prefix) && path.length > prefix.length,
    )
  );
}

/** A redirect target is a site path ("/about") or a full https:// address. */
export function validateRedirectTarget(input: unknown): RedirectTargetResult {
  const value = typeof input === "string" ? input.trim() : "";
  if (!value) return { ok: false, error: "Enter where this link should go" };
  if (value.startsWith("/") && !value.startsWith("//")) {
    if (value.length > MAX_REDIRECT_PATH_LENGTH)
      return { ok: false, error: "That address is too long" };
    if (hasUnsafePathChars(value))
      return { ok: false, error: "Remove spaces from the address" };
    return { ok: true, value };
  }
  if (/^https:\/\//i.test(value)) {
    if (value.length > MAX_REDIRECT_URL_LENGTH)
      return { ok: false, error: "That address is too long" };
    if (hasUnsafePathChars(value) || !HTTPS_URL.test(value))
      return {
        ok: false,
        error: "Use a full web address like https://example.com/page",
      };
    return { ok: true, value };
  }
  return {
    ok: false,
    error: "Start with / for a page on this site, or https:// for another site",
  };
}

/** Site-path targets inherit the visitor's query string (UTM tags) unless they set their own. */
export function buildRedirectLocation(target: string, search: string): string {
  if (!target.startsWith("/") || target.includes("?")) return target;
  const query = search.replace(/^\?/, "");
  return query ? `${target}?${query}` : target;
}

const BOT_UA =
  /bot|crawl|spider|slurp|preview|facebookexternalhit|embedly|headless|python-|curl\/|wget|go-http-client|httpclient|axios|node-fetch|okhttp|java\/|libwww|scrapy|lighthouse|pingdom|uptime/i;

export function classifyUserAgent(
  userAgent: string | null | undefined,
): UserAgentClass {
  const ua = (userAgent ?? "").trim();
  if (!ua) return "unknown";
  if (BOT_UA.test(ua)) return "bot";
  if (/mozilla\/|opera\//i.test(ua)) return "human";
  return "unknown";
}

/** Referrer origin + path only (never query strings, which can carry tokens). */
export function sanitizeReferrer(input: unknown): string | null {
  if (typeof input !== "string" || !input.trim()) return null;
  try {
    const url = new URL(input.trim());
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return `${url.origin}${url.pathname}`.slice(0, MAX_REFERRER_LENGTH);
  } catch {
    return null;
  }
}
