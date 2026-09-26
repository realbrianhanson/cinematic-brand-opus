import { newsDisplay } from "./newsDisplay";
import {
  newsFeedIssue,
  uniqueNewsItems,
} from "../../supabase/functions/_shared/newsQuality";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { PUBLIC_GENERATED_PAGE_LIST_SELECT } from "./publicColumns";
import { RESOURCE_PAGE_SIZE } from "../../supabase/functions/_shared/resourcePagination";

export async function fetchResourcePage(
  client: SupabaseClient<Database>,
  schemaId: string,
  page = 1,
  niche = "",
) {
  let nicheId: string | undefined;
  if (niche) {
    const { data, error } = await client
      .from("niches")
      .select("id")
      .eq("slug", niche)
      .eq("is_active", true)
      .maybeSingle();
    if (error) throw error;
    if (!data) return { pages: [], nextPage: null };
    nicheId = data.id;
  }
  let query = client
    .from("generated_pages")
    .select(PUBLIC_GENERATED_PAGE_LIST_SELECT)
    .eq("content_schema_id", schemaId)
    .eq("status", "published");
  if (nicheId) query = query.eq("niche_id", nicheId);
  const offset = (page - 1) * RESOURCE_PAGE_SIZE;
  const { data, error } = await query
    .order("title")
    .order("id")
    .range(offset, offset + RESOURCE_PAGE_SIZE);
  if (error) throw error;
  return {
    pages: (data ?? []).slice(0, RESOURCE_PAGE_SIZE),
    nextPage: (data?.length ?? 0) > RESOURCE_PAGE_SIZE ? page + 1 : null,
  };
}

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
  const term = search.trim().slice(0, 200);
  // The cursor is a raw database page. Filtering must never turn a short
  // visible page into an end-of-feed signal or discard unreturned matches.
  let cursor = Math.max(0, Math.floor(page));
  const items = [] as Array<Awaited<ReturnType<typeof readPage>>[number]>;
  async function readPage(rawPage: number) {
    let query = client
      .from("source_items")
      .select(NEWS_CARD_COLUMNS)
      .eq("status", "published");
    if (lanes.length) query = query.in("topic_lane", lanes);
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
      .range(rawPage * NEWS_PAGE_SIZE, (rawPage + 1) * NEWS_PAGE_SIZE - 1);
    if (error) throw error;
    return data ?? [];
  }
  for (let batch = 0; batch < 8; batch++) {
    const raw = await readPage(cursor++);
    const display = raw
      .map((item) => {
        const text = newsDisplay(item);
        return { ...item, ai_title: text.title, ai_summary: text.summary };
      })
      .filter((item) => !newsFeedIssue(item));
    items.push(...display);
    const visible = uniqueNewsItems(items);
    if (raw.length < NEWS_PAGE_SIZE) return { items: visible, nextPage: null };
    // Return the entire final batch, rather than lose any eligible results.
    if (visible.length >= NEWS_PAGE_SIZE || batch === 7)
      return { items: visible, nextPage: cursor };
  }
  return { items: uniqueNewsItems(items), nextPage: cursor };
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
    // One extra card proves there is another page; an exact multiple must not link to an empty archive.
    .range(page * BLOG_PAGE_SIZE, (page + 1) * BLOG_PAGE_SIZE);
  if (error) throw error;
  return {
    items: (data ?? []).slice(0, BLOG_PAGE_SIZE),
    nextPage: (data?.length ?? 0) > BLOG_PAGE_SIZE ? page + 1 : null,
  };
}

/** Guide connections use the stored niche relationship, never word-overlap guesses. */
export async function fetchGuideResources(
  client: SupabaseClient<Database>,
  nicheId: string,
) {
  const { data, error } = await client
    .from("generated_pages")
    .select("id, title, slug, content_schemas!inner(name, slug)")
    .eq("niche_id", nicheId)
    .eq("status", "published")
    .eq("content_schemas.is_active", true)
    .order("title")
    .order("id")
    .limit(100)
    .abortSignal(AbortSignal.timeout(5000));
  if (error) throw error;
  return data ?? [];
}
export type GuideResource = Awaited<
  ReturnType<typeof fetchGuideResources>
>[number];
