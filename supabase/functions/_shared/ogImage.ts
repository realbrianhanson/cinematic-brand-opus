// Fetches an article page and extracts the best available social image.
// Tries og:image, twitter:image, then the first substantial <img> in the body.
// Falls back to Firecrawl (residential proxy) when the direct fetch is blocked
// by a CDN like Akamai or Cloudflare — common on major news sites.
// Returns absolute URL or null. Short timeout so it never stalls polling.
import { fetchTextBounded, isPublicHttpUrl } from "./safeFetch.ts";

export async function fetchOgImage(
  pageUrl: string,
  timeoutMs = 6000,
): Promise<string | null> {
  // Article URLs arrive from remote feeds, so never fetch one that is not a
  // public https address.
  if (!isPublicHttpUrl(pageUrl)) return null;
  const direct = await tryDirect(pageUrl, timeoutMs);
  if (direct) return direct;
  return await tryFirecrawl(pageUrl);
}

async function tryDirect(
  pageUrl: string,
  timeoutMs: number,
): Promise<string | null> {
  try {
    const res = await fetchTextBounded(pageUrl, {
      headers: {
        // Many news CDNs (Akamai, Cloudflare) 403 obvious bot UAs. Use a realistic
        // desktop Chrome UA so we can read the og:image meta tag.
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
      timeoutMs,
      maxBytes: 200_000,
      contentTypeIncludes: "html",
    });
    if (!res.ok) return null;
    const html = res.body;

    const patterns: RegExp[] = [
      /<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]*content=["']([^"']+)["']/i,
      /<meta[^>]+content=["']([^"']+)["'][^>]*property=["']og:image(?::secure_url)?["']/i,
      /<meta[^>]+name=["']twitter:image(?::src)?["'][^>]*content=["']([^"']+)["']/i,
      /<meta[^>]+content=["']([^"']+)["'][^>]*name=["']twitter:image(?::src)?["']/i,
      /<link[^>]+rel=["']image_src["'][^>]*href=["']([^"']+)["']/i,
    ];
    for (const re of patterns) {
      const m = html.match(re);
      const abs = m && m[1] ? toAbsolute(m[1], pageUrl) : null;
      if (abs) return abs;
    }
    // Fallback: first <img> with a plausible src
    const imgs = html.match(/<img[^>]+src=["']([^"']+)["'][^>]*>/gi) || [];
    for (const tag of imgs) {
      const src = tag.match(/src=["']([^"']+)["']/i)?.[1];
      if (!src) continue;
      if (/(sprite|logo|icon|1x1|pixel|blank|spacer|avatar)/i.test(src))
        continue;
      if (src.startsWith("data:")) continue;
      const abs = toAbsolute(src, pageUrl);
      if (abs) return abs;
    }
    return null;
  } catch {
    return null;
  }
}

async function tryFirecrawl(pageUrl: string): Promise<string | null> {
  const key = Deno.env.get("FIRECRAWL_API_KEY");
  if (!key) return null;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 20_000);
    const res = await fetch("https://api.firecrawl.dev/v1/scrape", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        url: pageUrl,
        formats: ["markdown"],
        onlyMainContent: false,
      }),
      signal: ctrl.signal,
    });
    clearTimeout(t);
    if (!res.ok) return null;
    const json = await res.json();
    const meta = json?.data?.metadata || {};
    const candidate =
      meta.ogImage ||
      meta["og:image"] ||
      meta.twitterImage ||
      meta["twitter:image"] ||
      null;
    return candidate ? toAbsolute(String(candidate), pageUrl) : null;
  } catch {
    return null;
  }
}

// Resolves a candidate image reference and only accepts a public http(s) result,
// so a scraped page can never plant an internal or javascript: URL in the DB.
function toAbsolute(src: string, base: string): string | null {
  try {
    const abs = new URL(src, base).toString();
    return isPublicHttpUrl(abs, { allowHttp: true }) ? abs : null;
  } catch {
    return null;
  }
}
