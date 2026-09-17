/**
 * Public, published-only content readers used by route loaders so that article
 * bodies, canonical URLs, meta tags and JSON-LD are present in the initial HTML.
 *
 * Every function here is unauthenticated by design and MUST only ever return
 * data that is already public on the site. Reads go through the publishable
 * key (RLS applies as `anon`) and additionally filter on `status = 'published'`.
 *
 * A `null` return means "not found" and route loaders turn that into a real
 * HTTP 404. A thrown error means "the read failed" and route loaders surface a
 * retryable error state — the two are never conflated.
 */
import { createServerFn } from "@tanstack/react-start";

import type { Json } from "@/integrations/supabase/types";

import { createPublicServerClient, SITE_SETTINGS_PUBLIC_COLUMNS } from "./publicData.server";

type PublicNiche = {
  id: string | null;
  name: string;
  slug: string;
  context: Json | null;
};

export const BLOG_PAGE_SIZE = 12;
export const NEWS_PAGE_SIZE = 18;

const BLOG_CARD_COLUMNS =
  "id, slug, title, excerpt, featured_image, featured_image_alt, reading_time, created_at, categories(name, slug)";

const NEWS_CARD_COLUMNS =
  "id, title, url, author, published_at, raw_excerpt, image_url, topic_lane, ai_title, ai_summary, source_name";

function slugInput(input: unknown): { slug: string } {
  const slug = (input as { slug?: unknown } | null)?.slug;
  if (typeof slug !== "string" || !slug.trim()) throw new Error("Invalid slug");
  return { slug };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Shared site identity/author fields used by article JSON-LD and bylines. */
export const getPublicSiteSettings = createServerFn({ method: "GET" }).handler(async () => {
  const supabase = createPublicServerClient();
  const { data, error } = await supabase
    .from("site_settings")
    .select(SITE_SETTINGS_PUBLIC_COLUMNS)
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ?? null;
});

export const getPublicPostsFirstPage = createServerFn({ method: "GET" }).handler(async () => {
  const supabase = createPublicServerClient();
  const { data, error } = await supabase
    .from("posts")
    .select(BLOG_CARD_COLUMNS)
    .eq("status", "published")
    .order("created_at", { ascending: false })
    .range(0, BLOG_PAGE_SIZE - 1);
  if (error) throw new Error(error.message);
  const items = data ?? [];
  return { items, nextPage: items.length === BLOG_PAGE_SIZE ? 1 : null };
});

export const getPublicPostBySlug = createServerFn({ method: "GET" })
  .inputValidator(slugInput)
  .handler(async ({ data: { slug } }) => {
    const supabase = createPublicServerClient();
    const { data, error } = await supabase
      .from("posts")
      .select("*, categories(name, slug)")
      .eq("slug", slug)
      .eq("status", "published")
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ?? null;
  });

export const getPublicPillarBySlug = createServerFn({ method: "GET" })
  .inputValidator(slugInput)
  .handler(async ({ data: { slug } }) => {
    const supabase = createPublicServerClient();
    const { data, error } = await supabase
      .from("pillar_pages")
      .select("*, niches(id, name, slug, context)")
      .eq("slug", slug)
      .eq("status", "published")
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ?? null;
  });

export const getPublicResourceIndex = createServerFn({ method: "GET" }).handler(async () => {
  const supabase = createPublicServerClient();
  const [schemasRes, countsRes] = await Promise.all([
    supabase.from("content_schemas").select("*").eq("is_active", true).order("name"),
    supabase.from("generated_pages").select("content_schema_id").eq("status", "published"),
  ]);
  if (schemasRes.error) throw new Error(schemasRes.error.message);
  if (countsRes.error) throw new Error(countsRes.error.message);
  const counts: Record<string, number> = {};
  for (const row of countsRes.data ?? []) {
    if (row.content_schema_id) {
      counts[row.content_schema_id] = (counts[row.content_schema_id] ?? 0) + 1;
    }
  }
  return { schemas: schemasRes.data ?? [], counts };
});

export const getPublicContentType = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => {
    const contentType = (input as { contentType?: unknown } | null)?.contentType;
    if (typeof contentType !== "string" || !contentType.trim()) {
      throw new Error("Invalid content type");
    }
    return { contentType };
  })
  .handler(async ({ data: { contentType } }) => {
    const supabase = createPublicServerClient();
    const { data: schema, error: schemaError } = await supabase
      .from("content_schemas")
      .select("*")
      .eq("slug", contentType)
      .maybeSingle();
    if (schemaError) throw new Error(schemaError.message);
    if (!schema) return null;

    const { data: pages, error: pagesError } = await supabase
      .from("generated_pages")
      .select("*, niches!generated_pages_niche_id_fkey(name, slug)")
      .eq("content_schema_id", schema.id)
      .eq("status", "published")
      .order("title");
    if (pagesError) throw new Error(pagesError.message);

    return { schema, pages: pages ?? [] };
  });

export const getPublicGeneratedPage = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => {
    const raw = input as { contentType?: unknown; pageSlug?: unknown } | null;
    if (typeof raw?.contentType !== "string" || !raw.contentType.trim()) {
      throw new Error("Invalid content type");
    }
    if (typeof raw?.pageSlug !== "string" || !raw.pageSlug.trim()) {
      throw new Error("Invalid page slug");
    }
    return { contentType: raw.contentType, pageSlug: raw.pageSlug };
  })
  .handler(async ({ data: { contentType, pageSlug } }) => {
    const supabase = createPublicServerClient();
    const { data: schema, error: schemaError } = await supabase
      .from("content_schemas")
      .select("id, name, slug, renderer_component")
      .eq("slug", contentType)
      .maybeSingle();
    if (schemaError) throw new Error(schemaError.message);
    if (!schema) return null;

    const { data: page, error: pageError } = await supabase
      .from("generated_pages")
      .select("*, niches!generated_pages_niche_id_fkey(id, name, slug, context)")
      .eq("content_schema_id", schema.id)
      .eq("slug", pageSlug)
      .eq("status", "published")
      .maybeSingle();
    if (pageError) throw new Error(pageError.message);
    if (!page) return null;

    const niche: PublicNiche =
      (page as unknown as { niches?: PublicNiche | null }).niches ?? {
        id: null,
        name: "",
        slug: "",
        context: null,
      };
    return { ...page, schema, niche };
  });

export const getPublicNewsFirstPage = createServerFn({ method: "GET" }).handler(async () => {
  const supabase = createPublicServerClient();
  const { data, error } = await supabase
    .from("source_items")
    .select(NEWS_CARD_COLUMNS)
    .eq("status", "published")
    .order("published_at", { ascending: false, nullsFirst: false })
    .range(0, NEWS_PAGE_SIZE - 1);
  if (error) throw new Error(error.message);
  const items = data ?? [];
  return { items, nextPage: items.length === NEWS_PAGE_SIZE ? 1 : null };
});

export const getPublicNewsItem = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => {
    const id = (input as { id?: unknown } | null)?.id;
    if (typeof id !== "string" || !UUID_RE.test(id)) throw new Error("Invalid id");
    return { id };
  })
  .handler(async ({ data: { id } }) => {
    const supabase = createPublicServerClient();
    const { data, error } = await supabase
      .from("source_items")
      .select(
        "id, title, url, raw_excerpt, image_url, topic_lane, published_at, full_content, ai_title, ai_summary, source_name",
      )
      .eq("id", id)
      .eq("status", "published")
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ?? null;
  });
