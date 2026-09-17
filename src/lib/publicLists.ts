import { newsDisplay } from "./newsDisplay";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export const BLOG_PAGE_SIZE = 12;
export const NEWS_PAGE_SIZE = 18;
export const BLOG_CARD_COLUMNS =
  "id, slug, title, excerpt, featured_image, featured_image_alt, reading_time, created_at, categories(name, slug)";
export const NEWS_CARD_COLUMNS =
  "id, title, url, author, published_at, raw_excerpt, image_url, topic_lane, ai_title, ai_summary, source_name";

/** Quote a PostgREST filter value and make SQL wildcard characters literal. */
export function literalSearchFilter(value: string): string {
  const pattern = `%${value.replace(/[\\%_]/g, "\\$&")}%`;
  return `"${pattern.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

export async function fetchNewsPage(
  client: SupabaseClient<Database>,
  page: number,
  search = "",
  lanes: string[] = [],
) {
  let query = client
    .from("source_items")
    .select(NEWS_CARD_COLUMNS)
    .eq("status", "published");
  if (lanes.length) query = query.in("topic_lane", lanes);
  const term = search.trim().slice(0, 200);
  if (term) {
    const filter = literalSearchFilter(term);
    query = query.or(
      ["title", "ai_title", "ai_summary", "raw_excerpt", "source_name"]
        .map((column) => `${column}.ilike.${filter}`)
        .join(","),
    );
  }
  const { data, error } = await query
    .order("published_at", { ascending: false, nullsFirst: false })
    .order("id", { ascending: false })
    .range(page * NEWS_PAGE_SIZE, (page + 1) * NEWS_PAGE_SIZE - 1);
  if (error) throw error;
  return {
    items: (data ?? []).map((item) => {
      const display = newsDisplay(item);
      return { ...item, ai_title: display.title, ai_summary: display.summary };
    }),
    nextPage: data?.length === NEWS_PAGE_SIZE ? page + 1 : null,
  };
}

export async function fetchBlogPage(
  client: SupabaseClient<Database>,
  page: number,
  category = "",
) {
  let query = client
    .from("posts")
    .select(BLOG_CARD_COLUMNS)
    .eq("status", "published");
  if (category) {
    const { data, error } = await client
      .from("categories")
      .select("id")
      .eq("slug", category)
      .maybeSingle();
    if (error) throw error;
    if (!data) return { items: [], nextPage: null };
    query = query.eq("category_id", data.id);
  }
  const { data, error } = await query
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(page * BLOG_PAGE_SIZE, (page + 1) * BLOG_PAGE_SIZE - 1);
  if (error) throw error;
  return {
    items: data ?? [],
    nextPage: data?.length === BLOG_PAGE_SIZE ? page + 1 : null,
  };
}
