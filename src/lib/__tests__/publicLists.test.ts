import { describe, it, expect, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  fetchNewsPage,
  fetchBlogPage,
  literalSearchFilter,
  fetchGuideResources,
} from "../publicLists";
function client(responses: unknown[]) {
  const urls: URL[] = [];
  const fetch = vi.fn(async (input: RequestInfo | URL) => {
    urls.push(new URL(String(input)));
    return new Response(JSON.stringify(responses.shift() ?? []), {
      headers: { "Content-Type": "application/json" },
    });
  });
  return {
    urls,
    fetch,
    db: createClient<Database>(
      "https://example.supabase.co",
      "public-test-key",
      { auth: { persistSession: false }, global: { fetch } },
    ),
  };
}
describe("public listing filters", () => {
  it("connects guides only to published resources in their exact stored topic and active format", async () => {
    const h = client([
      [
        {
          id: "resource",
          slug: "sample",
          title: "A related resource",
          content_schemas: { name: "Templates", slug: "templates" },
        },
      ],
    ]);
    expect(await fetchGuideResources(h.db, "topic-id")).toHaveLength(1);
    expect(h.urls[0].searchParams.get("niche_id")).toBe("eq.topic-id");
    expect(h.urls[0].searchParams.get("status")).toBe("eq.published");
    expect(h.urls[0].searchParams.get("content_schemas.is_active")).toBe(
      "eq.true",
    );
    expect(h.urls[0].searchParams.get("limit")).toBe("100");
  });
  it("sends search and lane constraints to the database along with the requested page", async () => {
    const h = client([
      [
        {
          id: "older-match",
          title: "Older topic for business owners",
          url: "https://example.com/story",
        },
      ],
    ]);
    const result = await fetchNewsPage(h.db, 0, "Older topic", ["health"]);
    expect(result.items[0].id).toBe("older-match");
    expect(h.urls[0].searchParams.get("topic_lane")).toBe("in.(health)");
    expect(h.urls[0].searchParams.get("or")).toContain(
      'title.ilike."%Older topic%"',
    );
    expect(h.urls[0].searchParams.get("status")).toBe("eq.published");
    expect(h.urls[0].searchParams.get("order")).toContain("id.desc");
  });
  it("keeps punctuation inside a single quoted filter value", () => {
    expect(literalSearchFilter('a%,_"\\')).toBe('"%a\\\\%,\\\\_\\"\\\\\\\\%"');
  });
  it("resolves the category and filters in the database before loading another page", async () => {
    const h = client([{ id: "cat-id" }, [{ id: "match" }]]);
    await fetchBlogPage(h.db, 2, "guides");
    expect(h.urls[0].searchParams.get("slug")).toBe("eq.guides");
    expect(h.urls[1].searchParams.get("category_id")).toBe("eq.cat-id");
    expect(h.urls[1].searchParams.get("offset")).toBe("24");
  });
  it("looks ahead one row without rendering it or linking beyond an exact final page", async () => {
    const rows = Array.from({ length: 13 }, (_, index) => ({
      id: `post-${index}`,
    }));
    const h = client([rows, rows.slice(0, 12)]);
    const first = await fetchBlogPage(h.db, 0);
    expect(first.items).toHaveLength(12);
    expect(first.nextPage).toBe(1);
    expect(h.urls[0].searchParams.get("limit")).toBe("13");
    const last = await fetchBlogPage(h.db, 1);
    expect(last.items).toHaveLength(12);
    expect(last.nextPage).toBeNull();
    expect(h.urls[1].searchParams.get("offset")).toBe("12");
  });
  it("returns empty for an unknown category instead of showing unrelated posts", async () => {
    const h = client([null]);
    expect(await fetchBlogPage(h.db, 0, "missing")).toEqual({
      items: [],
      nextPage: null,
    });
    expect(h.fetch).toHaveBeenCalledTimes(1);
  });
});

describe("news pagination after editorial filtering", () => {
  const row = (index: number, good = true) => ({
    id: `story-${index}`,
    title: good
      ? `A new scheduling feature for business owners ${index}`
      : `An executive addresses a security council ${index}`,
    url: `https://example.com/article/${index}`,
    raw_excerpt: good
      ? "A useful scheduling update."
      : "International coordination is discussed.",
    source_name: "Perplexity Daily",
    topic_lane: "ai_tools",
  });
  it("continues past filtered pages without losing eligible results", async () => {
    const h = client([
      Array.from({ length: 18 }, (_, i) => row(i, false)),
      Array.from({ length: 18 }, (_, i) => row(i + 18)),
      [row(36)],
    ]);
    const first = await fetchNewsPage(h.db, 0);
    expect(first.items).toHaveLength(18);
    expect(first.nextPage).toBe(2);
    expect(h.urls[1].searchParams.get("offset")).toBe("18");
    const next = await fetchNewsPage(h.db, first.nextPage!);
    expect(next.items.map((item) => item.id)).toEqual(["story-36"]);
    expect(next.nextPage).toBeNull();
  });
  it("deduplicates within fetched batches but preserves a real end cursor", async () => {
    const h = client([
      [
        row(1),
        { ...row(1), id: "repeat", url: "https://another.com/reprint" },
        row(2),
      ],
    ]);
    const result = await fetchNewsPage(h.db, 0);
    expect(result.items).toHaveLength(2);
    expect(result.nextPage).toBeNull();
  });
  it("does not present an exhausted batch limit as an exhausted feed", async () => {
    const h = client(
      Array.from({ length: 8 }, (_, page) =>
        Array.from({ length: 18 }, (_, i) => row(page * 18 + i, false)),
      ),
    );
    expect(await fetchNewsPage(h.db, 0)).toEqual({ items: [], nextPage: 8 });
  });
});
