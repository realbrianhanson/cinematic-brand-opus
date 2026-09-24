// Builds the response for GET /<key>.txt, the IndexNow key-verification file.
// The key itself lives in site_settings.indexnow_key and is looked up by exact
// match, so any other *.txt name gets a plain 404.

const KEY_RE = /^[A-Za-z0-9-]{8,128}$/;

const text = (body: string, status: number, cache: string) =>
  new Response(body, {
    status,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": cache,
      "X-Robots-Tag": "noindex",
    },
  });

export async function indexNowKeyFileResponse(
  candidate: string,
  lookup: (candidate: string) => Promise<string | null>,
): Promise<Response> {
  if (!KEY_RE.test(candidate))
    return text("Not found\n", 404, "public, max-age=300");
  let key: string | null;
  try {
    key = await lookup(candidate);
  } catch (error) {
    console.error("IndexNow key file lookup failed:", error);
    return text("Temporarily unavailable\n", 503, "no-store");
  }
  if (key !== candidate) return text("Not found\n", 404, "public, max-age=300");
  return text(key, 200, "public, max-age=3600");
}
