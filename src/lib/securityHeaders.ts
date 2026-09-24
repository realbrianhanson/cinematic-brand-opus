/**
 * Response security headers applied at the server entry (src/server.ts).
 *
 * Admin pages must never render inside another site's frame (clickjacking).
 * Public pages stay framable. On Lovable preview hosts the editor itself
 * frames the app, so admin pages there allow only the Lovable editor.
 */
const DENY_FRAMING = "frame-ancestors 'none'";
const LOVABLE_EDITOR_FRAMING =
  "frame-ancestors 'self' https://lovable.dev https://*.lovable.dev";

export function isAdminPath(pathname: string): boolean {
  return pathname === "/admin" || pathname.startsWith("/admin/");
}

export function isLovablePreviewHost(hostname: string): boolean {
  return (
    /^(id-)?preview--[a-z0-9-]+\.lovable\.app$/i.test(hostname) ||
    /\.lovableproject\.com$/i.test(hostname)
  );
}

function framingPolicy(url: URL): string | null {
  if (!isAdminPath(url.pathname)) return null;
  return isLovablePreviewHost(url.hostname)
    ? LOVABLE_EDITOR_FRAMING
    : DENY_FRAMING;
}

export function withSecurityHeaders(
  request: Request,
  response: Response,
): Response {
  let url: URL;
  try {
    url = new URL(request.url);
  } catch {
    return response;
  }
  const policy = framingPolicy(url);
  if (!policy) return response;

  const headers = new Headers(response.headers);
  const existing = headers.get("content-security-policy");
  // A route that chose its own frame-ancestors keeps it.
  if (existing && /frame-ancestors/i.test(existing)) return response;
  headers.set(
    "content-security-policy",
    existing ? `${existing}; ${policy}` : policy,
  );
  if (policy === DENY_FRAMING) headers.set("x-frame-options", "DENY");

  // Rebuild: some responses (redirects, fetch results) have immutable headers.
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
