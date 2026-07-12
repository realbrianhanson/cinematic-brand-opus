// Fetches an article page and extracts the best available social image.
// Tries og:image, twitter:image, then the first substantial <img> in the body.
// Falls back to Firecrawl (residential proxy) when the direct fetch is blocked
// by a CDN like Akamai or Cloudflare — common on major news sites.
// Returns absolute URL or null. Short timeout so it never stalls polling.

export async function fetchOgImage(pageUrl: string, timeoutMs = 6000): Promise<string | null> {
  const direct = await tryDirect(pageUrl, timeoutMs);
  if (direct) return direct;
  return await tryFirecrawl(pageUrl);
}

async function tryDirect(pageUrl: string, timeoutMs: number): Promise<string | null> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(pageUrl, {
      headers: {
        // Many news CDNs (Akamai, Cloudflare) 403 obvious bot UAs. Use a realistic
        // desktop Chrome UA so we can read the og:image meta tag.
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
      signal: ctrl.signal,
      redirect: "follow",
    });
    clearTimeout(t);
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") || "";
    if (!ct.includes("html")) return null;
    const html = (await res.text()).slice(0, 200_000);

    const patterns: RegExp[] = [
      /<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]*content=["']([^"']+)["']/i,
      /<meta[^>]+content=["']([^"']+)["'][^>]*property=["']og:image(?::secure_url)?["']/i,
      /<meta[^>]+name=["']twitter:image(?::src)?["'][^>]*content=["']([^"']+)["']/i,
      /<meta[^>]+content=["']([^"']+)["'][^>]*name=["']twitter:image(?::src)?["']/i,
      /<link[^>]+rel=["']image_src["'][^>]*href=["']([^"']+)["']/i,
    ];
    for (const re of patterns) {
      const m = html.match(re);
      if (m && m[1]) return toAbsolute(m[1], pageUrl);
    }
    // Fallback: first <img> with a plausible src
    const imgs = html.match(/<img[^>]+src=["']([^"']+)["'][^>]*>/gi) || [];
    for (const tag of imgs) {
      const src = tag.match(/src=["']([^"']+)["']/i)?.[1];
      if (!src) continue;
      if (/(sprite|logo|icon|1x1|pixel|blank|spacer|avatar)/i.test(src)) continue;
      if (src.startsWith("data:")) continue;
      return toAbsolute(src, pageUrl);
    }
    return null;
  } catch {
    return null;
  }
}

function toAbsolute(src: string, base: string): string {
  try {
    return new URL(src, base).toString();
  } catch {
    return src;
  }
}
