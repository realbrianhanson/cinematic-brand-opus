/** Reviewed entrances from Brian's previous site, with a real current equivalent. */
const legacyDestinations: Readonly<Record<string, string>> = {
  "/my-story": "/#story",
  "/case-studies": "/#testimonials",
};

// This repository is also a member template. Never apply Brian's historic URL
// policy to an unrelated member domain or to arbitrary Host headers.
const brianHosts = new Set([
  "brianhanson.com",
  "www.brianhanson.com",
  "id-preview--aad54f9f-2dc1-4e99-9396-88f3e07eb70c.lovable.app",
]);

export function legacyRedirect(request: Request): Response | null {
  if (request.method !== "GET" && request.method !== "HEAD") return null;
  const url = new URL(request.url);
  if (!brianHosts.has(url.hostname)) return null;
  const path = url.pathname.replace(/\/$/, "");
  const destination = legacyDestinations[path];
  if (!destination) return null;
  const target = new URL(destination, url.origin);
  // Preserve campaign attribution without letting query parameters choose a URL.
  target.search = url.search;
  return new Response(null, {
    status: 308,
    headers: {
      Location: `${target.pathname}${target.search}${target.hash}`,
      "Cache-Control": "public, max-age=3600",
    },
  });
}
