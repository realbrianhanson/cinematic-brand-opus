/** Strict, intentionally small payload. Never persist arbitrary browser metadata. */
export const CONVERSION_UUID =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const TOKEN = /^[a-f0-9]{64}$/;
const SLUG = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const ROUTE_SLUG = "[a-z0-9]+(?:-[a-z0-9]+)*";
const PUBLIC_PATH = new RegExp(
  `^/(?:|shop|start-here|speaking|support|privacy|terms|sitemap|blog(?:/${ROUTE_SLUG})?|guides/${ROUTE_SLUG}|news(?:/[a-f0-9-]{36})?|resources(?:/${ROUTE_SLUG}){0,2}|offers/${ROUTE_SLUG})$`,
);
const TYPES = [
  "page_view",
  "shop_view",
  "offer_view",
  "outbound_click",
] as const;
const PLACEMENTS = [
  "nav",
  "hero",
  "event",
  "shop",
  "offer",
  "footer",
  "resource",
  "other",
] as const;
const DESTINATIONS = [
  "summit",
  "workshop",
  "external_offer",
  "external_resource",
] as const;
export type ConversionEvent = {
  id: string;
  type: (typeof TYPES)[number];
  path: string;
  offer_id?: string;
  placement?: (typeof PLACEMENTS)[number];
  destination?: (typeof DESTINATIONS)[number];
};
export type ConversionIdentity = { session_id: string; session_token: string };
export type ConversionRequest = ConversionIdentity & {
  action: "record" | "forget";
  events: ConversionEvent[];
  attribution: { source: string; medium: string; campaign: string };
};
export function conversionIdentity(value: unknown): ConversionIdentity | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  return typeof item.session_id === "string" &&
    CONVERSION_UUID.test(item.session_id) &&
    typeof item.session_token === "string" &&
    TOKEN.test(item.session_token)
    ? {
        session_id: item.session_id.toLowerCase(),
        session_token: item.session_token,
      }
    : null;
}
export function conversionSlug(value: unknown, fallback: string): string {
  return typeof value === "string" && SLUG.test(value) ? value : fallback;
}
export function parseConversionRequest(
  value: unknown,
): ConversionRequest | null {
  const identity = conversionIdentity(value);
  if (!identity || !value || typeof value !== "object") return null;
  const body = value as Record<string, unknown>;
  if (body.action === "forget")
    return {
      ...identity,
      action: "forget",
      events: [],
      attribution: { source: "direct", medium: "none", campaign: "none" },
    };
  if (
    body.action !== "record" ||
    body.consent !== true ||
    !Array.isArray(body.events) ||
    body.events.length < 1 ||
    body.events.length > 10
  )
    return null;
  const events: ConversionEvent[] = [];
  for (const value of body.events) {
    if (!value || typeof value !== "object") return null;
    const event = value as Record<string, unknown>;
    if (
      typeof event.id !== "string" ||
      !CONVERSION_UUID.test(event.id) ||
      !TYPES.includes(event.type as never) ||
      typeof event.path !== "string" ||
      event.path.length > 240 ||
      !PUBLIC_PATH.test(event.path)
    )
      return null;
    if (
      event.offer_id !== undefined &&
      (typeof event.offer_id !== "string" ||
        !CONVERSION_UUID.test(event.offer_id))
    )
      return null;
    if (
      event.placement !== undefined &&
      !PLACEMENTS.includes(event.placement as never)
    )
      return null;
    if (
      event.destination !== undefined &&
      !DESTINATIONS.includes(event.destination as never)
    )
      return null;
    if (event.type === "shop_view" && event.path !== "/shop") return null;
    if (
      event.type === "offer_view" &&
      (!event.offer_id || !event.path.startsWith("/offers/"))
    )
      return null;
    if (event.type === "outbound_click" && !event.destination) return null;
    if (event.type !== "outbound_click" && event.destination !== undefined)
      return null;
    if (event.destination === "external_offer" && !event.offer_id) return null;
    events.push({
      id: event.id.toLowerCase(),
      type: event.type as ConversionEvent["type"],
      path: event.path,
      ...(event.offer_id
        ? { offer_id: (event.offer_id as string).toLowerCase() }
        : {}),
      ...(event.placement
        ? { placement: event.placement as ConversionEvent["placement"] }
        : {}),
      ...(event.destination
        ? { destination: event.destination as ConversionEvent["destination"] }
        : {}),
    });
  }
  const attribution =
    body.attribution && typeof body.attribution === "object"
      ? (body.attribution as Record<string, unknown>)
      : {};
  return {
    ...identity,
    action: "record",
    events,
    attribution: {
      source: conversionSlug(attribution.source, "direct"),
      medium: conversionSlug(attribution.medium, "none"),
      campaign: conversionSlug(attribution.campaign, "none"),
    },
  };
}
export async function conversionHash(value: string): Promise<string> {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    ),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
}
/** Role claim of a JWT, read only to tell public keys from session tokens. */
function jwtRole(token: string): string | null {
  const payload = token.split(".")[1];
  if (!payload || token.split(".").length !== 3) return null;
  try {
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const claims = JSON.parse(
      atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "=")),
    );
    return typeof claims?.role === "string" ? claims.role : null;
  } catch {
    return null;
  }
}

/**
 * True for requests that carry no user session. supabase.functions.invoke
 * sends the bundled publishable key as both `apikey` and the bearer, and that
 * key does not always equal this function's SUPABASE_ANON_KEY (legacy JWT vs
 * publishable key, or a rotated key). Requiring an exact match silently
 * dropped every anonymous claim's measurement. A signed-in user's bearer is
 * their session JWT (role "authenticated"), which never qualifies, even when
 * a caller copies it into `apikey`. This only decides whether an optional
 * measurement is linked; a request with no Authorization header at all is
 * already treated as public.
 */
function publicBearer(req: Request, anonKey: string | undefined): boolean {
  const header = req.headers.get("authorization");
  if (header === null) return true;
  const token = /^Bearer\s+(\S+)$/i.exec(header.trim())?.[1];
  if (!token) return false;
  if (anonKey && token === anonKey.trim()) return true;
  if (token !== req.headers.get("apikey")?.trim()) return false;
  return token.startsWith("sb_publishable_") || jwtRole(token) === "anon";
}

export function conversionRequestAllowed(
  req: Request,
  origin: string,
  anonKey: string | undefined,
  forget = false,
): boolean {
  if (req.headers.get("origin") !== origin || !origin.startsWith("https://"))
    return false;
  // Revocation must still work after a visitor enables GPC/DNT or signs in.
  if (forget) return true;
  // Signed-in or unrecognised bearer traffic is excluded; see publicBearer.
  if (!publicBearer(req, anonKey)) return false;
  if (req.headers.get("dnt") === "1" || req.headers.get("sec-gpc") === "1")
    return false;
  if (req.headers.has("x-qa") || req.headers.has("x-codex-qa")) return false;
  const agent = req.headers.get("user-agent") ?? "";
  if (
    /bot|crawler|spider|headless|playwright|puppeteer|lighthouse|curl|wget/i.test(
      agent,
    )
  )
    return false;
  const referer = req.headers.get("referer");
  if (referer) {
    try {
      const url = new URL(referer);
      if (
        url.origin !== origin ||
        url.pathname.startsWith("/admin") ||
        url.pathname.startsWith("/offers/preview") ||
        url.searchParams.has("qa") ||
        url.searchParams.has("preview") ||
        url.searchParams.has("__qa") ||
        url.searchParams.get("measurement") === "off"
      )
        return false;
    } catch {
      return false;
    }
  }
  return true;
}
