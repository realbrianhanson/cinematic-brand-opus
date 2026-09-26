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

import {
  createPublicServerClient,
  SITE_SETTINGS_PUBLIC_COLUMNS,
} from "./publicData.server";

type PublicNiche = {
  id: string | null;
  name: string;
  slug: string;
  context: Json | null;
};

import { blogSearch } from "../../supabase/functions/_shared/blogPagination";
import { resourceSearch } from "../../supabase/functions/_shared/resourcePagination";
import {
  fetchBlogPage,
  fetchNewsPage,
  fetchGuideResources,
  fetchResourcePage,
} from "./publicLists";
import {
  PUBLIC_GENERATED_PAGE_LIST_SELECT,
  PUBLIC_GENERATED_PAGE_SELECT,
  PUBLIC_POST_SELECT,
  PUBLIC_POST_SEO_SELECT,
} from "./publicColumns";

function slugInput(input: unknown): { slug: string } {
  const slug = (input as { slug?: unknown } | null)?.slug;
  if (typeof slug !== "string" || !slug.trim()) throw new Error("Invalid slug");
  return { slug };
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Shared site identity/author fields used by article JSON-LD and bylines. */
export const getPublicSiteSettings = createServerFn({ method: "GET" }).handler(
  async () => {
    const supabase = createPublicServerClient();
    const { data, error } = await supabase
      .from("site_settings")
      .select(SITE_SETTINGS_PUBLIC_COLUMNS)
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ?? null;
  },
);

export const getPublicPostsFirstPage = createServerFn({ method: "GET" })
  .inputValidator((input: { category?: string; page?: number }) =>
    blogSearch(input ?? {}),
  )
  .handler(async ({ data }) => ({
    ...(await fetchBlogPage(
      createPublicServerClient(),
      data.page - 1,
      data.category,
    )),
    page: data.page,
    category: data.category,
  }));

export const getPublicPostBySlug = createServerFn({ method: "GET" })
  .inputValidator(slugInput)
  .handler(async ({ data: { slug } }) => {
    const supabase = createPublicServerClient();
    const { data, error } = await supabase
      .from("posts")
      .select(PUBLIC_POST_SELECT)
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
      .select("*, niches(id, name, slug)")
      .eq("slug", slug)
      .eq("status", "published")
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ?? null;
  });

export const getPublicGuideResources = createServerFn({ method: "GET" })
  .inputValidator((input: { nicheId: string }) => {
    if (!UUID_RE.test(input?.nicheId)) throw new Error("Invalid guide topic");
    return input;
  })
  .handler(({ data }) =>
    fetchGuideResources(createPublicServerClient(), data.nicheId),
  );

export const getPublicResourceIndex = createServerFn({ method: "GET" }).handler(
  async () => {
    const supabase = createPublicServerClient();
    const [schemasRes, countsRes, guidesRes] = await Promise.all([
      supabase
        .from("content_schemas")
        .select("*")
        .eq("is_active", true)
        .order("name"),
      supabase.rpc("public_resource_counts"),
      supabase
        .from("pillar_pages")
        .select("id,title,slug,seo_meta")
        .eq("status", "published")
        .order("title")
        .limit(100),
    ]);
    if (guidesRes.error) throw new Error(guidesRes.error.message);
    if (schemasRes.error) throw new Error(schemasRes.error.message);
    if (countsRes.error) throw new Error(countsRes.error.message);
    const counts: Record<string, number> = {};
    for (const row of countsRes.data ?? []) {
      if (row.content_schema_id) {
        counts[row.content_schema_id] = row.page_count;
      }
    }
    return {
      schemas: schemasRes.data ?? [],
      counts,
      guides: (guidesRes.data ?? []).map((g) => {
        // Guides store either meta_description (generator) or description (editor).
        const seo = (g.seo_meta ?? {}) as {
          meta_description?: unknown;
          description?: unknown;
        };
        const text = [seo.meta_description, seo.description].find(
          (v): v is string => typeof v === "string" && v.trim() !== "",
        );
        return {
          id: g.id,
          title: g.title,
          slug: g.slug,
          meta_description: text ?? null,
        };
      }),
    };
  },
);

export const getPublicContentType = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => {
    const contentType = (input as { contentType?: unknown } | null)
      ?.contentType;
    if (typeof contentType !== "string" || !contentType.trim()) {
      throw new Error("Invalid content type");
    }
    return { contentType, ...resourceSearch(input as Record<string, unknown>) };
  })
  .handler(async ({ data: { contentType, page, niche } }) => {
    const supabase = createPublicServerClient();
    const { data: schema, error: schemaError } = await supabase
      .from("content_schemas")
      .select("*")
      .eq("slug", contentType)
      .eq("is_active", true)
      .maybeSingle();
    if (schemaError) throw new Error(schemaError.message);
    if (!schema) return null;

    const [listing, niches] = await Promise.all([
      fetchResourcePage(supabase, schema.id, page, niche),
      supabase
        .from("niches")
        .select("id, name, slug")
        .eq("is_active", true)
        .order("name")
        .limit(1000),
    ]);
    if (niches.error) throw new Error(niches.error.message);
    return { schema, ...listing, page, niche, niches: niches.data ?? [] };
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
      .select(PUBLIC_GENERATED_PAGE_SELECT)
      .eq("content_schema_id", schema.id)
      .eq("slug", pageSlug)
      .eq("status", "published")
      .maybeSingle();
    if (pageError) throw new Error(pageError.message);
    if (!page) return null;

    const niche: PublicNiche = (
      page as unknown as { niches?: PublicNiche | null }
    ).niches ?? {
      id: null,
      name: "",
      slug: "",
      context: null,
    };
    return { ...page, schema, niche };
  });

export const getPublicNewsFirstPage = createServerFn({ method: "GET" }).handler(
  async () => fetchNewsPage(createPublicServerClient(), 0),
);

export const getPublicNewsItem = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => {
    const id = (input as { id?: unknown } | null)?.id;
    if (typeof id !== "string" || !UUID_RE.test(id))
      throw new Error("Invalid id");
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

export const getPublicPostSeo = createServerFn({ method: "GET" })
  .inputValidator((input: { postId: string }) => input)
  .handler(async ({ data }) => {
    const { data: seo, error } = await createPublicServerClient()
      .from("seo_metadata")
      .select(PUBLIC_POST_SEO_SELECT)
      .eq("post_id", data.postId)
      .maybeSingle();
    if (error) throw error;
    return seo;
  });
