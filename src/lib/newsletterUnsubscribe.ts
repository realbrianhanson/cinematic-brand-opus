/**
 * Newsletter unsubscribe HTTP handling.
 *
 * GET never mutates: email security scanners (e.g. Microsoft Safe Links)
 * fetch every link in a message, so a GET that unsubscribed would silently
 * remove readers. GET shows a confirmation form; POST performs the change.
 * POST also accepts the RFC 8058 one-click body `List-Unsubscribe=One-Click`
 * with the token in the query string, as sent by Gmail and Yahoo.
 */
import { escapeHtml } from "./newsletterConfig";

export interface UnsubscribeStore {
  /** Normalized public site URL, or null when the newsletter is unconfigured. */
  siteUrl(): Promise<string | null>;
  unsubscribe(token: string): Promise<"ok" | "error">;
}

const ACTION_PATH = "/api/public/newsletter/unsubscribe";
const MAX_BODY_BYTES = 4096;
const TOKEN_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isUnsubscribeToken = (value: unknown): value is string =>
  typeof value === "string" && TOKEN_RE.test(value);

const text = (body: string, status: number) =>
  new Response(body, {
    status,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
    },
  });

const redirect = (location: string, status: 302 | 303) =>
  new Response(null, { status, headers: { location } });

const NOT_CONFIGURED = () => text("Newsletter is not configured.", 503);
const UNAVAILABLE = () => text("Unable to unsubscribe right now.", 503);

export function renderConfirmPage(token: string, siteUrl: string): string {
  const safeToken = escapeHtml(token);
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>Unsubscribe</title>
<style>
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0b0b12;color:#f3f3f3;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;padding:24px;box-sizing:border-box}
main{max-width:440px;width:100%;background:#12121a;border:1px solid rgba(255,255,255,.08);padding:32px}
h1{font-size:20px;margin:0 0 12px}p{color:#cfcfcf;line-height:1.6;font-size:15px}
button{background:#D4AF55;color:#07070E;border:0;padding:14px 24px;font-weight:700;font-size:14px;cursor:pointer;width:100%}
button:focus-visible,a:focus-visible{outline:2px solid #fff;outline-offset:3px}
a{color:#cfcfcf;display:inline-block;margin-top:16px;font-size:14px}
</style></head>
<body><main>
<h1>Unsubscribe from the newsletter?</h1>
<p>Confirm below and you won't receive any more newsletter emails.</p>
<form method="post" action="${ACTION_PATH}">
<input type="hidden" name="token" value="${safeToken}">
<button type="submit">Confirm unsubscribe</button>
</form>
<a href="${escapeHtml(siteUrl)}">Keep my subscription</a>
</main></body></html>`;
}

export async function handleUnsubscribeGet(
  request: Request,
  store: UnsubscribeStore,
): Promise<Response> {
  const siteUrl = await store.siteUrl();
  if (!siteUrl) return NOT_CONFIGURED();
  const token = new URL(request.url).searchParams.get("token");
  if (!isUnsubscribeToken(token))
    return redirect(`${siteUrl}/newsletter/unsubscribed`, 302);
  return new Response(renderConfirmPage(token, siteUrl), {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "referrer-policy": "no-referrer",
      "x-robots-tag": "noindex, nofollow",
      "x-frame-options": "DENY",
      "content-security-policy":
        "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'",
    },
  });
}

async function readForm(request: Request): Promise<URLSearchParams | null> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > MAX_BODY_BYTES) return null;
  const buffer = await request.arrayBuffer();
  if (buffer.byteLength > MAX_BODY_BYTES) return null;
  const type = request.headers.get("content-type") ?? "";
  if (type.startsWith("multipart/form-data")) {
    const form = await new Response(buffer, {
      headers: { "content-type": type },
    }).formData();
    const params = new URLSearchParams();
    form.forEach((value, key) => {
      if (typeof value === "string") params.append(key, value);
    });
    return params;
  }
  return new URLSearchParams(new TextDecoder().decode(buffer));
}

export async function handleUnsubscribePost(
  request: Request,
  store: UnsubscribeStore,
): Promise<Response> {
  let form: URLSearchParams | null;
  try {
    form = await readForm(request);
  } catch {
    return text("Malformed request.", 400);
  }
  if (!form) return text("Request body too large.", 413);

  const oneClick = form.get("List-Unsubscribe") === "One-Click";
  const token =
    new URL(request.url).searchParams.get("token") ?? form.get("token");

  if (oneClick) {
    if (!isUnsubscribeToken(token))
      return text("Invalid unsubscribe link.", 400);
    return (await store.unsubscribe(token)) === "ok"
      ? text("You have been unsubscribed.", 200)
      : UNAVAILABLE();
  }

  const siteUrl = await store.siteUrl();
  if (!siteUrl) return NOT_CONFIGURED();
  if (isUnsubscribeToken(token) && (await store.unsubscribe(token)) !== "ok")
    return UNAVAILABLE();
  return redirect(`${siteUrl}/newsletter/unsubscribed`, 303);
}
