import { describe, it, expect, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  fetchNewsPage,
  fetchBlogPage,
  literalSearchFilter,
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
  it("sends search and lane constraints to the database along with the requested page", async () => {
    const h = client([[{ id: "older-match", title: "Older topic" }]]);
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
  it("returns empty for an unknown category instead of showing unrelated posts", async () => {
    const h = client([null]);
    expect(await fetchBlogPage(h.db, 0, "missing")).toEqual({
      items: [],
      nextPage: null,
    });
    expect(h.fetch).toHaveBeenCalledTimes(1);
  });
});
