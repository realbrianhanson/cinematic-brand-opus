import { describe, expect, it, vi, afterEach } from "vitest";
import {
  assertPublicHttpUrl,
  fetchTextBounded,
  isPublicHttpUrl,
  UnsafeUrlError,
} from "@/lib/safeFetch";

describe("assertPublicHttpUrl", () => {
  it("accepts ordinary public https URLs", () => {
    expect(assertPublicHttpUrl("https://example.com/feed.xml").hostname).toBe("example.com");
    expect(isPublicHttpUrl("https://news.example.co.uk/rss")).toBe(true);
  });

  it("rejects non-https schemes unless http is opted in", () => {
    expect(() => assertPublicHttpUrl("http://example.com")).toThrow(UnsafeUrlError);
    expect(isPublicHttpUrl("http://example.com", { allowHttp: true })).toBe(true);
    expect(isPublicHttpUrl("javascript:alert(1)")).toBe(false);
    expect(isPublicHttpUrl("file:///etc/passwd")).toBe(false);
    expect(isPublicHttpUrl("data:text/html,<b>x</b>")).toBe(false);
  });

  it("rejects loopback, private, link-local and metadata hosts", () => {
    for (const url of [
      "https://localhost/x",
      "https://127.0.0.1/x",
      "https://10.1.2.3/x",
      "https://172.16.0.9/x",
      "https://192.168.1.1/x",
      "https://169.254.169.254/latest/meta-data",
      "https://metadata.google.internal/x",
      "https://db.internal/x",
      "https://printer.local/x",
      "https://[::1]/x",
      "https://[fd00::1]/x",
    ]) {
      expect(isPublicHttpUrl(url), url).toBe(false);
    }
  });

  it("rejects credentials, odd ports and bare hostnames", () => {
    expect(isPublicHttpUrl("https://user:pass@example.com")).toBe(false);
    expect(isPublicHttpUrl("https://example.com:8080/x")).toBe(false);
    expect(isPublicHttpUrl("https://intranet/x")).toBe(false);
  });
});

function textResponse(body: string, init: ResponseInit = {}) {
  return new Response(body, {
    status: 200,
    headers: { "content-type": "text/html", ...(init.headers as Record<string, string>) },
    ...init,
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchTextBounded", () => {
  it("returns the body for a valid public URL", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => textResponse("<html>ok</html>")));
    const res = await fetchTextBounded("https://example.com/page");
    expect(res.ok).toBe(true);
    expect(res.body).toContain("ok");
  });

  it("refuses to fetch a private URL at all", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(fetchTextBounded("https://127.0.0.1/x")).rejects.toBeInstanceOf(UnsafeUrlError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("revalidates redirect targets and blocks an internal hop", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(null, {
        status: 302,
        headers: { location: "http://169.254.169.254/latest/meta-data" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    await expect(fetchTextBounded("https://example.com/redir")).rejects.toBeInstanceOf(
      UnsafeUrlError,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("stops following after the redirect limit", async () => {
    let n = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        n += 1;
        return new Response(null, {
          status: 302,
          headers: { location: `https://example.com/hop${n}` },
        });
      }),
    );
    await expect(
      fetchTextBounded("https://example.com/start", { maxRedirects: 2 }),
    ).rejects.toThrow(/too many redirects/);
  });

  it("truncates an oversized body instead of buffering it", async () => {
    const big = "x".repeat(5000);
    vi.stubGlobal("fetch", vi.fn(async () => textResponse(big)));
    const res = await fetchTextBounded("https://example.com/big", { maxBytes: 100 });
    expect(res.truncated).toBe(true);
    expect(res.body.length).toBeLessThanOrEqual(100);
  });

  it("rejects an unexpected content type", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => textResponse("{}", { headers: { "content-type": "application/json" } })),
    );
    const res = await fetchTextBounded("https://example.com/x", { contentTypeIncludes: "html" });
    expect(res.ok).toBe(false);
    expect(res.body).toBe("");
  });
});
