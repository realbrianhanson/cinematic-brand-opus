import {
  assertPublicHttpUrl,
  fetchTextBounded,
  readBounded,
} from "./safeFetch.ts";

export async function fetchSourceMarkdown(
  rawUrl: string,
  firecrawlKey?: string,
): Promise<string> {
  const url = assertPublicHttpUrl(rawUrl).toString();
  if (firecrawlKey) {
    try {
      const response = await fetch("https://api.firecrawl.dev/v1/scrape", {
        method: "POST",
        signal: AbortSignal.timeout(15_000),
        headers: {
          Authorization: `Bearer ${firecrawlKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url,
          formats: ["markdown"],
          onlyMainContent: true,
        }),
      });
      if (response.ok) {
        const { text, truncated } = await readBounded(response, 512 * 1024);
        if (!truncated) {
          const result = JSON.parse(text);
          const markdown = result?.data?.markdown ?? result?.markdown;
          if (typeof markdown === "string" && markdown.length > 200)
            return markdown.slice(0, 12000);
        }
      } else await response.body?.cancel();
    } catch {
      /* A bounded direct read can still supply the source. */
    }
  }
  try {
    const response = await fetchTextBounded(url, {
      timeoutMs: 12_000,
      maxBytes: 512 * 1024,
      contentTypeIncludes: "html",
      headers: { "User-Agent": "Mozilla/5.0 NewsRewriter/1.0" },
    });
    if (!response.ok) return "";
    return response.body
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 12000);
  } catch {
    return "";
  }
}
