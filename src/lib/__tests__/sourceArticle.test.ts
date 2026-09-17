import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchSourceMarkdown } from "../../../supabase/functions/_shared/sourceArticle";

afterEach(() => vi.unstubAllGlobals());
describe("article source fetching", () => {
  it("rejects private URLs before contacting either provider or source", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      fetchSourceMarkdown("https://[::ffff:127.0.0.1]/", "mock-key"),
    ).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("uses a bounded direct fallback after provider failure", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("unavailable", { status: 503 }))
      .mockResolvedValueOnce(
        new Response("<p>Real source text</p><script>untrusted()</script>", {
          headers: { "content-type": "text/html" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    expect(
      await fetchSourceMarkdown("https://example.com/article", "mock-key"),
    ).toBe("Real source text");
    expect(fetchMock.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
    expect(fetchMock.mock.calls[1][1]).toMatchObject({
      redirect: "manual",
      signal: expect.any(AbortSignal),
    });
  });
  it("does not follow a source redirect to a private host", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(null, {
          status: 302,
          headers: { location: "https://169.254.169.254/metadata" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    expect(await fetchSourceMarkdown("https://example.com/article")).toBe("");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
