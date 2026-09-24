/**
 * Server-only guard for the public site chat endpoint (/api/chat).
 *
 * The endpoint spends real A.I. credits for anonymous visitors, so every
 * request passes, in order: method, origin, content type, body size cap,
 * strict shape validation, configuration, and durable rate limits. Only then
 * is the model called. Dependencies are injected so each gate is unit-tested.
 */
import {
  SITE_CHAT_LIMITS,
  type SiteChatMessage,
  type SiteChatRole,
} from "./siteChat";

/** Durable limits (fixed windows, stored by the rate-limit RPC). */
export const SITE_CHAT_RATE_LIMITS = {
  ipBurst: { limit: 10, window: 10 * 60 },
  ipDaily: { limit: 40, window: 24 * 60 * 60 },
  globalDaily: { limit: 500, window: 24 * 60 * 60 },
} as const;

/** Raw entries beyond this are not worth inspecting at all. */
const MAX_RAW_MESSAGES = 200;

export interface SiteChatDependencies {
  /** Exact origins (scheme + host + port) allowed besides the serving host. */
  allowedOrigins: readonly string[];
  isConfigured: () => boolean;
  /** Returns true when the hit is allowed. Throws when the limiter is down. */
  rateLimit: (
    key: string,
    limit: number,
    windowSeconds: number,
  ) => Promise<boolean>;
  stream: (messages: SiteChatMessage[], request: Request) => Promise<Response>;
}

type ParseResult =
  { ok: true; messages: SiteChatMessage[] } | { ok: false; error: string };

class BodyTooLargeError extends Error {}

function json(
  body: { error: string },
  status: number,
  headers: Record<string, string> = {},
) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...headers,
    },
  });
}

function originOf(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:"
      ? url.origin
      : null;
  } catch {
    return null;
  }
}

/** The configured site origin plus its www / apex twin. */
export function siteChatAllowedOrigins(siteUrl: string): string[] {
  const origin = originOf(siteUrl);
  if (!origin) return [];
  const url = new URL(origin);
  const twin = new URL(origin);
  twin.hostname = url.hostname.startsWith("www.")
    ? url.hostname.slice(4)
    : `www.${url.hostname}`;
  return [origin, twin.origin];
}

/**
 * Browsers always send Origin on a POST, so a missing or foreign Origin is
 * rejected. The serving host itself (production, Lovable preview, local dev)
 * is always allowed.
 */
export function isAllowedSiteChatOrigin(
  request: Request,
  allowedOrigins: readonly string[],
): boolean {
  const header = request.headers.get("origin");
  if (!header) return false;
  const origin = originOf(header);
  if (!origin || origin !== header.replace(/\/$/, "")) return false;
  if (origin === originOf(request.url)) return true;
  return allowedOrigins.includes(origin);
}

async function readBoundedText(request: Request): Promise<string> {
  const declared = Number(request.headers.get("content-length"));
  if (declared > SITE_CHAT_LIMITS.maxBodyBytes) throw new BodyTooLargeError();
  const reader = request.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > SITE_CHAT_LIMITS.maxBodyBytes) {
        await reader.cancel().catch(() => {});
        throw new BodyTooLargeError();
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Joined text of a message's `text` parts; every other part type is dropped. */
function textParts(parts: unknown): string {
  if (!Array.isArray(parts)) return "";
  return parts
    .filter(
      (part): part is { type: "text"; text: string } =>
        isRecord(part) && part.type === "text" && typeof part.text === "string",
    )
    .map((part) => part.text)
    .join("")
    .trim();
}

function toMessage(raw: unknown, index: number): SiteChatMessage | null {
  if (!isRecord(raw)) return null;
  if (raw.role !== "user" && raw.role !== "assistant") return null;
  const text = textParts(raw.parts);
  if (!text) return null;
  const id =
    typeof raw.id === "string" && /^[\w-]{1,100}$/.test(raw.id)
      ? raw.id
      : `m${index}`;
  return {
    id,
    role: raw.role as SiteChatRole,
    parts: [{ type: "text", text }],
  };
}

/**
 * Strict request shape: `{ messages: [...] }` with user/assistant text only.
 * System/developer/tool messages, non-text parts and extra fields are
 * dropped; messages are rebuilt from scratch so nothing else passes through.
 */
export function parseSiteChatBody(body: unknown): ParseResult {
  if (!isRecord(body) || !Array.isArray(body.messages))
    return { ok: false, error: "Messages are required." };
  if (body.messages.length === 0 || body.messages.length > MAX_RAW_MESSAGES)
    return { ok: false, error: "Messages are required." };

  const messages = body.messages
    .map(toMessage)
    .filter((message): message is SiteChatMessage => message !== null)
    .slice(-SITE_CHAT_LIMITS.maxMessages);

  const last = messages.at(-1);
  if (!last || last.role !== "user")
    return { ok: false, error: "Ask a question to start." };
  if (
    messages.some(
      (message) =>
        message.role === "user" &&
        message.parts[0].text.length > SITE_CHAT_LIMITS.maxTextChars,
    )
  )
    return { ok: false, error: "Please shorten your question." };

  return {
    ok: true,
    messages: messages.map((message) =>
      message.role === "assistant"
        ? {
            ...message,
            parts: [
              {
                type: "text",
                text: message.parts[0].text.slice(
                  0,
                  SITE_CHAT_LIMITS.maxTextChars,
                ),
              },
            ],
          }
        : message,
    ),
  };
}

function clientIp(request: Request): string {
  return (
    request.headers.get("cf-connecting-ip")?.trim() ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

const LIMITED_VISITOR =
  "You have asked a lot of questions in a short time. Please try again in a little while.";
const LIMITED_GLOBAL =
  "The assistant has answered a lot of questions today. Please try again later or use the email link.";

/** Returns a 429/503 response when the request must stop, otherwise null. */
async function enforceRateLimits(
  deps: SiteChatDependencies,
  request: Request,
): Promise<Response | null> {
  const visitor = await sha256Hex(clientIp(request));
  const { ipBurst, ipDaily, globalDaily } = SITE_CHAT_RATE_LIMITS;
  const checks = [
    [`site-chat:ip-burst:${visitor}`, ipBurst, LIMITED_VISITOR],
    [`site-chat:ip-daily:${visitor}`, ipDaily, LIMITED_VISITOR],
    ["site-chat:global:daily", globalDaily, LIMITED_GLOBAL],
  ] as const;
  try {
    for (const [key, { limit, window }, message] of checks) {
      if (!(await deps.rateLimit(key, limit, window)))
        return json({ error: message }, 429, {
          "Retry-After": String(Math.min(window, 3600)),
        });
    }
    return null;
  } catch (error) {
    console.error("[site-chat] rate limiter unavailable", error);
    return json(
      { error: "The assistant is unavailable right now. Please try again." },
      503,
    );
  }
}

export function createSiteChatHandler(deps: SiteChatDependencies) {
  return async function handleSiteChat(request: Request): Promise<Response> {
    if (request.method !== "POST")
      return json({ error: "Method not allowed." }, 405, { Allow: "POST" });
    if (!isAllowedSiteChatOrigin(request, deps.allowedOrigins))
      return json({ error: "Use the chat on this site." }, 403);
    const contentType = request.headers
      .get("content-type")
      ?.split(";")[0]
      ?.trim()
      .toLowerCase();
    if (contentType !== "application/json")
      return json({ error: "Send a JSON request." }, 415);

    let raw: unknown;
    try {
      raw = JSON.parse(await readBoundedText(request));
    } catch (error) {
      if (error instanceof BodyTooLargeError)
        return json(
          { error: "That conversation is too long. Start a new one." },
          413,
        );
      return json({ error: "Invalid request." }, 400);
    }
    const parsed = parseSiteChatBody(raw);
    if (!parsed.ok) return json({ error: parsed.error }, 400);

    if (!deps.isConfigured())
      return json({ error: "The assistant is not configured." }, 503);

    const limited = await enforceRateLimits(deps, request);
    if (limited) return limited;

    try {
      return await deps.stream(parsed.messages, request);
    } catch (error) {
      console.error("[site-chat] model call failed", error);
      return json({ error: "The assistant is unavailable right now." }, 502);
    }
  };
}
