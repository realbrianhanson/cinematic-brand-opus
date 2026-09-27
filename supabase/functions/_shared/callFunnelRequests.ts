/** Transport boundaries for the application and signed outcome endpoints. */
export type CallFunnelRequest =
  | { action: "get"; slug: string }
  | { action: "state"; token: string }
  | {
      action: "submit";
      slug: string;
      revision: number;
      token: string;
      requestId: string;
      answers: Record<string, string>;
      contact: { name: string; email: string };
      consent: true;
    };
export const callEventTypes = [
  "booked",
  "cancelled",
  "rescheduled",
  "attended",
  "no_show",
  "sale",
] as const;
export type CallEventType = (typeof callEventTypes)[number];
export type CallWebhookEvent = {
  eventId: string;
  applicationId: string;
  type: CallEventType;
  occurredAt: string;
  startsAt?: string;
  reference: string;
};
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const token = /^[a-f0-9]{64}$/;
const stable = /^[a-z][a-z0-9-]{0,47}$/;
const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const exact = (value: Record<string, unknown>, fields: string[]) =>
  Object.keys(value).every((key) => fields.includes(key));
const text = (value: unknown, max: number, required = false): value is string =>
  typeof value === "string" &&
  value.length <= max &&
  (!required || !!value.trim()) &&
  !value.includes(String.fromCharCode(0));
export function parseCallFunnelRequest(raw: unknown): CallFunnelRequest {
  if (!object(raw)) throw new Error("Invalid call funnel request.");
  if (
    raw.action === "get" &&
    exact(raw, ["action", "slug"]) &&
    typeof raw.slug === "string" &&
    /^[a-z][a-z0-9-]{0,79}$/.test(raw.slug)
  )
    return raw as CallFunnelRequest;
  if (
    raw.action === "state" &&
    exact(raw, ["action", "token"]) &&
    typeof raw.token === "string" &&
    token.test(raw.token)
  )
    return raw as CallFunnelRequest;
  if (
    raw.action !== "submit" ||
    !exact(raw, [
      "action",
      "slug",
      "revision",
      "token",
      "requestId",
      "answers",
      "contact",
      "consent",
    ]) ||
    typeof raw.slug !== "string" ||
    !/^[a-z][a-z0-9-]{0,79}$/.test(raw.slug) ||
    !Number.isSafeInteger(raw.revision) ||
    (raw.revision as number) < 1 ||
    typeof raw.token !== "string" ||
    !token.test(raw.token) ||
    typeof raw.requestId !== "string" ||
    !uuid.test(raw.requestId) ||
    raw.consent !== true ||
    !object(raw.answers) ||
    Object.keys(raw.answers).length > 15 ||
    Object.entries(raw.answers).some(
      ([key, value]) => !stable.test(key) || !text(value, 2000),
    ) ||
    !object(raw.contact) ||
    !exact(raw.contact, ["name", "email"]) ||
    !text(raw.contact.name, 160, true) ||
    !text(raw.contact.email, 254, true) ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw.contact.email)
  )
    throw new Error("Invalid application. Check your name, email and answers.");
  return raw as CallFunnelRequest;
}
const validTime = (value: unknown): value is string => {
  if (typeof value !== "string" || value.length > 35) return false;
  const match =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.exec(
      value,
    );
  if (!match || !Number.isFinite(Date.parse(value))) return false;
  const [year, month, day, hour, minute, second] = match.slice(1).map(Number);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  // Date.parse normalizes February 31 and hour 24; PostgreSQL must receive a
  // real timestamp, otherwise malformed signed events become retryable 503s.
  return (
    year > 0 &&
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= days[month - 1] &&
    hour < 24 &&
    minute < 60 &&
    second < 60
  );
};
export function parseCallWebhookEvent(
  raw: unknown,
  now = Date.now(),
): CallWebhookEvent {
  if (
    !object(raw) ||
    !exact(raw, [
      "eventId",
      "applicationId",
      "type",
      "occurredAt",
      "startsAt",
      "reference",
    ]) ||
    !text(raw.eventId, 160, true) ||
    !/^[a-zA-Z0-9:_-]+$/.test(raw.eventId) ||
    typeof raw.applicationId !== "string" ||
    !uuid.test(raw.applicationId) ||
    !callEventTypes.includes(raw.type as CallEventType) ||
    !validTime(raw.occurredAt) ||
    Date.parse(raw.occurredAt) > now + 300000 ||
    !text(raw.reference, 300, true) ||
    (raw.startsAt !== undefined && !validTime(raw.startsAt)) ||
    (["booked", "rescheduled"].includes(String(raw.type)) &&
      !validTime(raw.startsAt))
  )
    throw new Error("Invalid call outcome event.");
  return raw as CallWebhookEvent;
}
/** HMAC authenticates a trusted server/automation; it is not Stripe payment verification. */
export async function verifyCallWebhook(
  raw: string,
  timestamp: string | null,
  signature: string | null,
  secret: string,
  now = Date.now(),
): Promise<boolean> {
  if (
    secret.length < 32 ||
    !timestamp ||
    !/^\d{10}$/.test(timestamp) ||
    Math.abs(now - Number(timestamp) * 1000) > 300000 ||
    !signature ||
    !/^[a-f0-9]{64}$/i.test(signature)
  )
    return false;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const bytes = Uint8Array.from(signature.match(/.{2}/g)!, (pair) =>
    parseInt(pair, 16),
  );
  return crypto.subtle.verify(
    "HMAC",
    key,
    bytes,
    encoder.encode(`${timestamp}.${raw}`),
  );
}
export async function readCallWebhookBody(
  request: Request,
  limit = 8192,
): Promise<string | null> {
  const declared = request.headers.get("content-length");
  if (
    declared !== null &&
    (!/^\d+$/.test(declared) || Number(declared) > limit)
  )
    return null;
  if (!request.body) return null;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
    const all = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      all.set(chunk, offset);
      offset += chunk.length;
    }
    return new TextDecoder("utf-8", { fatal: true }).decode(all);
  } catch {
    return null;
  } finally {
    reader.releaseLock();
  }
}
