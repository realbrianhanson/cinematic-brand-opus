// Safety rails for outbound fetches whose URL comes from configuration or
// remote content (RSS source URLs, article pages, image URLs).
//
// Three separate hazards are handled:
//  1. SSRF: only public https hosts on standard ports, never loopback,
//     private ranges, link-local, or cloud metadata endpoints.
//  2. Hangs: one deadline covers the request AND the body read.
//  3. Unbounded payloads: the body is read incrementally and cut off.
//
// Redirects are followed manually so every hop is validated again — a public
// URL that 302s to 169.254.169.254 must not slip through.
//
// Deno-free on purpose so it can be unit tested from the app test suite.

export class UnsafeUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsafeUrlError";
  }
}

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "localhost.localdomain",
  "metadata.google.internal",
  "instance-data",
]);

const BLOCKED_SUFFIXES = [".localhost", ".local", ".internal", ".home.arpa"];

function isPrivateIPv4(host: string): boolean {
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const a = Number(m[1]);
  const b = Number(m[2]);
  if ([a, b, Number(m[3]), Number(m[4])].some((n) => n > 255)) return true;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true; // link-local / cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a >= 224) return true; // multicast / reserved
  return false;
}

function isPrivateIPv6(host: string): boolean {
  const h = host.replace(/^\[|\]$/g, "").toLowerCase();
  if (!h.includes(":")) return false;
  if (h === "::" || h === "::1") return true;
  if (h.startsWith("fe80") || h.startsWith("fc") || h.startsWith("fd"))
    return true;
  if (h.startsWith("::ffff:")) return isPrivateIPv4(h.slice("::ffff:".length));
  return false;
}

export interface UrlCheckOptions {
  /** Allow plain http as well as https. Off by default. */
  allowHttp?: boolean;
}

/**
 * Parses and validates a URL for outbound fetching. Throws UnsafeUrlError with
 * a specific reason; never returns an unvalidated URL.
 */
export function assertPublicHttpUrl(
  raw: string,
  opts: UrlCheckOptions = {},
): URL {
  if (typeof raw !== "string" || raw.trim() === "") {
    throw new UnsafeUrlError("url is empty");
  }
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new UnsafeUrlError("url is not parseable");
  }

  const allowed = opts.allowHttp ? ["https:", "http:"] : ["https:"];
  if (!allowed.includes(url.protocol)) {
    throw new UnsafeUrlError(`protocol ${url.protocol} is not allowed`);
  }
  if (url.username || url.password) {
    throw new UnsafeUrlError("credentials in url are not allowed");
  }
  if (url.port && url.port !== "80" && url.port !== "443") {
    throw new UnsafeUrlError(`port ${url.port} is not allowed`);
  }

  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (!host || (!host.includes(".") && !host.includes(":"))) {
    // Bare single-label hosts resolve on internal networks only.
    throw new UnsafeUrlError(`host "${host}" is not a public hostname`);
  }
  if (BLOCKED_HOSTNAMES.has(host)) {
    throw new UnsafeUrlError(`host "${host}" is not public`);
  }
  if (BLOCKED_SUFFIXES.some((s) => host.endsWith(s))) {
    throw new UnsafeUrlError(`host "${host}" is not public`);
  }
  if (isPrivateIPv4(host) || isPrivateIPv6(host)) {
    throw new UnsafeUrlError(`host "${host}" is a private address`);
  }
  return url;
}

export function isPublicHttpUrl(
  raw: string,
  opts: UrlCheckOptions = {},
): boolean {
  try {
    assertPublicHttpUrl(raw, opts);
    return true;
  } catch {
    return false;
  }
}

export interface BoundedFetchOptions extends UrlCheckOptions {
  /** Deadline for the request AND reading the body. */
  timeoutMs?: number;
  /** Hard cap on decoded body bytes read. */
  maxBytes?: number;
  headers?: Record<string, string>;
  /** Substring the response content-type must contain (case-insensitive). */
  contentTypeIncludes?: string;
  maxRedirects?: number;
}

export interface BoundedFetchResult {
  ok: boolean;
  status: number;
  finalUrl: string;
  contentType: string;
  body: string;
  truncated: boolean;
}

/**
 * Fetches text with a validated URL, a single deadline covering the body read,
 * a byte ceiling, and per-hop redirect revalidation.
 */
export async function fetchTextBounded(
  raw: string,
  opts: BoundedFetchOptions = {},
): Promise<BoundedFetchResult> {
  const timeoutMs = opts.timeoutMs ?? 8000;
  const maxBytes = opts.maxBytes ?? 512 * 1024;
  const maxRedirects = opts.maxRedirects ?? 3;

  let url = assertPublicHttpUrl(raw, opts);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    let res: Response | null = null;
    for (let hop = 0; ; hop += 1) {
      res = await fetch(url.toString(), {
        headers: opts.headers,
        redirect: "manual",
        signal: controller.signal,
      });
      if (![301, 302, 303, 307, 308].includes(res.status)) break;
      const location = res.headers.get("location");
      if (!location) break;
      if (hop >= maxRedirects) {
        throw new UnsafeUrlError("too many redirects");
      }
      // Revalidate every hop: a public URL may redirect to an internal one.
      url = assertPublicHttpUrl(new URL(location, url).toString(), opts);
    }

    const contentType = res!.headers.get("content-type") ?? "";
    if (
      opts.contentTypeIncludes &&
      !contentType
        .toLowerCase()
        .includes(opts.contentTypeIncludes.toLowerCase())
    ) {
      return {
        ok: false,
        status: res!.status,
        finalUrl: url.toString(),
        contentType,
        body: "",
        truncated: false,
      };
    }

    // Reject obviously oversized payloads before reading them.
    const declared = Number(res!.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > maxBytes * 4) {
      return {
        ok: false,
        status: res!.status,
        finalUrl: url.toString(),
        contentType,
        body: "",
        truncated: true,
      };
    }

    const { text, truncated } = await readBounded(res!, maxBytes);
    return {
      ok: res!.ok,
      status: res!.status,
      finalUrl: url.toString(),
      contentType,
      body: text,
      truncated,
    };
  } finally {
    clearTimeout(timer);
  }
}

async function readBounded(
  res: Response,
  maxBytes: number,
): Promise<{ text: string; truncated: boolean }> {
  const reader = res.body?.getReader();
  if (!reader) {
    const full = await res.text();
    return { text: full.slice(0, maxBytes), truncated: full.length > maxBytes };
  }
  const decoder = new TextDecoder();
  let read = 0;
  let text = "";
  let truncated = false;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    read += value.byteLength;
    if (read > maxBytes) {
      const keep = value.subarray(
        0,
        Math.max(0, value.byteLength - (read - maxBytes)),
      );
      text += decoder.decode(keep);
      truncated = true;
      try {
        await reader.cancel();
      } catch {
        /* the stream is already closing */
      }
      break;
    }
    text += decoder.decode(value, { stream: true });
  }
  return { text, truncated };
}
