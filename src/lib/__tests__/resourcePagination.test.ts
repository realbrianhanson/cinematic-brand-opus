import { describe, expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { fetchResourcePage } from "../publicLists";
import {
  resourceArchivePath,
  resourceSearch,
} from "../../../supabase/functions/_shared/resourcePagination";

describe("resource archive pagination", () => {
  it("bounds pages and preserves only supported filters in canonical links", () => {
    expect(resourceSearch({ page: "2", niche: "business" })).toEqual({
      page: 2,
      niche: "business",
    });
    expect(resourceSearch({ page: Infinity, niche: ["bad"] })).toEqual({
      page: 1,
      niche: "",
    });
    expect(resourceArchivePath("guides", 2, "business")).toBe(
      "/resources/guides?niche=business&page=2",
    );
  });
  it("filters before pagination and never advertises a nonexistent next page", async () => {
    const urls: URL[] = [];
    const results = [
      { id: "niche-id" },
      Array.from({ length: 13 }, (_, i) => ({ id: String(i) })),
      Array.from({ length: 12 }, (_, i) => ({ id: String(i + 12) })),
    ];
    const fetch = vi.fn(async (input: RequestInfo | URL) => {
      urls.push(new URL(String(input)));
      return new Response(JSON.stringify(results.shift()), {
        headers: { "Content-Type": "application/json" },
      });
    });
    const db = createClient<Database>("https://example.supabase.co", "test", {
      auth: { persistSession: false },
      global: { fetch },
    });
    const first = await fetchResourcePage(db, "schema-id", 1, "business");
    expect(first.pages).toHaveLength(12);
    expect(first.nextPage).toBe(2);
    expect(urls[1].searchParams.get("niche_id")).toBe("eq.niche-id");
    expect(urls[1].searchParams.get("status")).toBe("eq.published");
    expect(urls[1].searchParams.get("order")).toBe("title.asc,id.asc");
    expect(urls[1].searchParams.get("limit")).toBe("13");
    const last = await fetchResourcePage(db, "schema-id", 2);
    expect(last.nextPage).toBeNull();
    expect(urls[2].searchParams.get("offset")).toBe("12");
  });
  it("propagates a failed load rather than treating it as an empty category", async () => {
    const db = createClient<Database>("https://example.supabase.co", "test", {
      auth: { persistSession: false },
      global: {
        fetch: async () =>
          new Response(JSON.stringify({ message: "Unavailable" }), {
            status: 400,
          }),
      },
    });
    await expect(fetchResourcePage(db, "schema-id", 1)).rejects.toMatchObject({
      message: "Unavailable",
    });
  });
});
