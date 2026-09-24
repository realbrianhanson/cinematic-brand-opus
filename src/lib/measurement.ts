/** Optional first-party conversion measurement. No customer details or full URLs. */
export const MEASUREMENT_CHOICE_KEY = "site-measurement-choice-v1";
export const MEASUREMENT_SESSION_KEY = "site-measurement-session-v1";
export const MEASUREMENT_CHANGE = "site-measurement-change";
export const MEASUREMENT_OPEN = "site-measurement-open";
export type MeasurementChoice = "allow" | "decline" | null;
export interface MeasurementContext {
  session_id: string;
  session_token: string;
}
export interface Attribution {
  source: string;
  medium: string;
  campaign: string;
}
export interface MeasurementEvent {
  id: string;
  type: "page_view" | "shop_view" | "offer_view" | "outbound_click";
  path: string;
  offer_id?: string;
  placement?:
    | "nav"
    | "hero"
    | "event"
    | "shop"
    | "offer"
    | "footer"
    | "resource"
    | "other";
  destination?: "summit" | "workshop" | "external_offer" | "external_resource";
}
interface StoredSession extends MeasurementContext {
  created: number;
  last: number;
  attribution: Attribution;
}
let choiceOverride: MeasurementChoice | undefined;
let eligible = false;
let canonicalOrigin = "";
let pending: Promise<void> = Promise.resolve();
let generation = 0;
let acceptedSession: string | null = null;
let lastOutbound = { key: "", at: 0 };
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function measurementPath(path: string): string | null {
  if (path.length > 200 || /[?#%@\\]/.test(path)) return null;
  if (
    /^\/(?:shop|start-here|about|support|privacy|terms|speaking|resources|blog|news|sitemap)?\/?$/.test(
      path,
    )
  )
    return path.replace(/\/$/, "") || "/";
  if (
    /^\/(?:offers|blog|news|resources|guides)\/[a-z0-9][a-z0-9-]{0,159}\/?$/.test(
      path,
    )
  )
    return path.replace(/\/$/, "");
  // Published resource routes have bounded slug segments; private/admin routes never qualify.
  if (/^\/resources\/[a-z0-9-]+\/[a-z0-9-]+\/?$/.test(path))
    return path.replace(/\/$/, "");
  return null;
}
export function measurementHostAllowed(
  origin: string,
  configured: string,
): boolean {
  try {
    const here = new URL(origin),
      canonical = new URL(configured);
    return (
      here.protocol === "https:" &&
      here.origin === canonical.origin &&
      !/^(?:localhost|127\.|0\.|\[::1\])/.test(here.hostname)
    );
  } catch {
    return false;
  }
}
export function cleanCampaign(value: string | null): string {
  const slug = value?.trim().toLowerCase() ?? "";
  return /^[a-z0-9][a-z0-9_-]{0,63}$/.test(slug) ? slug : "";
}
export function measurementAttribution(
  href: string,
  referrer: string,
  origin: string,
): Attribution {
  let source = "direct",
    medium = "direct";
  const campaign = "";
  try {
    const url = new URL(href);
    const tagged = cleanCampaign(url.searchParams.get("utm_source"));
    if (tagged)
      return {
        source: tagged,
        medium: cleanCampaign(url.searchParams.get("utm_medium")) || "campaign",
        campaign: cleanCampaign(url.searchParams.get("utm_campaign")),
      };
    const from = new URL(referrer);
    if (from.origin !== new URL(origin).origin) {
      const host = from.hostname.replace(/^www\./, "");
      const providers: Array<[RegExp, string, string]> = [
        [/(^|\.)google\.[a-z.]+$/, "google", "organic"],
        [/(^|\.)bing\.com$/, "bing", "organic"],
        [/(^|\.)(facebook\.com|fb\.com)$/, "facebook", "social"],
        [/(^|\.)instagram\.com$/, "instagram", "social"],
        [/(^|\.)(youtube\.com|youtu\.be)$/, "youtube", "social"],
        [/(^|\.)linkedin\.com$/, "linkedin", "social"],
      ];
      const match = providers.find(([pattern]) => pattern.test(host));
      source = match?.[1] ?? "other_referral";
      medium = match?.[2] ?? "referral";
    }
  } catch {
    /* Invalid or absent referrer is direct; never persist it. */
  }
  return { source, medium, campaign };
}
export function sessionIsFresh(
  session: { created: number; last: number },
  now = Date.now(),
): boolean {
  return (
    Number.isFinite(session.created) &&
    Number.isFinite(session.last) &&
    session.created <= session.last &&
    session.last <= now &&
    now - session.last < 30 * 60_000 &&
    now - session.created < 24 * 3600_000
  );
}
export function browserPrivacySignal(): boolean {
  if (typeof navigator === "undefined") return true;
  return (
    navigator.doNotTrack === "1" ||
    (navigator as Navigator & { globalPrivacyControl?: boolean })
      .globalPrivacyControl === true
  );
}
export function measurementChoice(): MeasurementChoice {
  if (choiceOverride !== undefined) return choiceOverride;
  try {
    const value = localStorage.getItem(MEASUREMENT_CHOICE_KEY);
    return value === "allow" || value === "decline" ? value : null;
  } catch {
    return null;
  }
}
export function configureMeasurement(allowed: boolean, origin: string): void {
  canonicalOrigin = origin;
  eligible = allowed;
  if (!allowed) {
    generation++;
    acceptedSession = null;
  }
}
export function measurementAllowed(): boolean {
  return (
    typeof window !== "undefined" &&
    eligible &&
    !browserPrivacySignal() &&
    measurementChoice() === "allow" &&
    measurementHostAllowed(window.location.origin, canonicalOrigin) &&
    !new URLSearchParams(window.location.search).has("measurement")
  );
}
function readSession(): StoredSession | null {
  try {
    const value: unknown = JSON.parse(
      sessionStorage.getItem(MEASUREMENT_SESSION_KEY) || "null",
    );
    if (!value || typeof value !== "object") return null;
    const s = value as StoredSession;
    return UUID.test(s.session_id) &&
      /^[a-f0-9]{64}$/.test(s.session_token) &&
      sessionIsFresh(s) &&
      s.attribution &&
      [s.attribution.source, s.attribution.medium].every(
        (v) => typeof v === "string" && cleanCampaign(v) === v && v.length > 0,
      ) &&
      typeof s.attribution.campaign === "string" &&
      cleanCampaign(s.attribution.campaign) === s.attribution.campaign
      ? s
      : null;
  } catch {
    return null;
  }
}
function getSession(): StoredSession | null {
  if (!measurementAllowed()) return null;
  try {
    let session = readSession();
    if (!session) {
      const bytes = crypto.getRandomValues(new Uint8Array(32));
      session = {
        session_id: crypto.randomUUID(),
        session_token: Array.from(bytes, (b) =>
          b.toString(16).padStart(2, "0"),
        ).join(""),
        created: Date.now(),
        last: Date.now(),
        attribution: measurementAttribution(
          window.location.href,
          document.referrer,
          canonicalOrigin,
        ),
      };
      acceptedSession = null;
    }
    session.last = Date.now();
    sessionStorage.setItem(MEASUREMENT_SESSION_KEY, JSON.stringify(session));
    return session;
  } catch {
    return null;
  } // Storage restrictions disable tracking without affecting the site.
}
async function postMeasurement(body: unknown): Promise<boolean> {
  const base = import.meta.env.VITE_SUPABASE_URL,
    key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!base || !key) return false;
  try {
    const response = await fetch(
      `${base.replace(/\/$/, "")}/functions/v1/conversion-events`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: key },
        body: JSON.stringify(body),
        keepalive: true,
        credentials: "omit",
        signal: AbortSignal.timeout(3500),
      },
    );
    return response.ok && (await response.json()).accepted === true;
  } catch {
    return false;
  }
}
export function recordMeasurement(
  events: Array<Omit<MeasurementEvent, "id">>,
): void {
  const session = getSession();
  if (!session || !events.length) return;
  const normalized = events
    .slice(0, 10)
    .filter((e) => measurementPath(e.path))
    .map((e) => ({ ...e, id: crypto.randomUUID() }));
  if (!normalized.length) return;
  if (normalized.length === 1 && normalized[0].type === "outbound_click") {
    const key = JSON.stringify(events[0]);
    if (key === lastOutbound.key && Date.now() - lastOutbound.at < 800) return;
    lastOutbound = { key, at: Date.now() };
  }
  const version = generation;
  // Navigation never awaits this queue; session capability is only shared with our own collector.
  pending = pending
    .then(async () => {
      if (version !== generation || !measurementAllowed()) return;
      const success = await postMeasurement({
        action: "record",
        consent: true,
        session_id: session.session_id,
        session_token: session.session_token,
        attribution: session.attribution,
        events: normalized,
      });
      if (success && version === generation)
        acceptedSession = session.session_id;
    })
    .catch(() => {});
}
export async function measurementForClaim(): Promise<
  MeasurementContext | undefined
> {
  if (!measurementAllowed()) return undefined;
  await Promise.race([
    pending,
    new Promise<void>((resolve) => setTimeout(resolve, 1000)),
  ]);
  const session = readSession();
  return measurementAllowed() &&
    session &&
    acceptedSession === session.session_id
    ? { session_id: session.session_id, session_token: session.session_token }
    : undefined;
}
export function revokeMeasurementSession(session = readSession()): void {
  generation++;
  acceptedSession = null;
  try {
    sessionStorage.removeItem(MEASUREMENT_SESSION_KEY);
  } catch {
    /* Storage unavailable. */
  }
  if (session)
    void pending.finally(() =>
      postMeasurement({
        action: "forget",
        session_id: session.session_id,
        session_token: session.session_token,
      }),
    );
}
export function setMeasurementChoice(
  choice: Exclude<MeasurementChoice, null>,
): void {
  const session = readSession();
  try {
    localStorage.setItem(MEASUREMENT_CHOICE_KEY, choice);
    choiceOverride = undefined;
  } catch {
    choiceOverride = "decline"; // An old readable allow must never override a failed revoke.
  }
  if (choice === "decline" || choiceOverride === "decline")
    revokeMeasurementSession(session);
  window.dispatchEvent(new Event(MEASUREMENT_CHANGE));
}
export function openMeasurementPreferences(): void {
  window.dispatchEvent(new Event(MEASUREMENT_OPEN));
}
