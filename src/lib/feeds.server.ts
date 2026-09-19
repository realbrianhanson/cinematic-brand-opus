// Server-only helpers that build the public discovery feeds (sitemap, RSS,
// llms.txt). Reads published rows through the publishable key — RLS applies.
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { siteConfig } from "@/config/site";
import { buildRuntimeConfig } from "@/config/runtime";
import {
  loadShopSitemapOffers,
  SHOP_DISCOVERY_COLUMNS,
} from "../../supabase/functions/_shared/shopDiscovery";

export function publicClient() {
  const key = process.env.SUPABASE_PUBLISHABLE_KEY!;
  return createClient<Database>(process.env.SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input: RequestInfo | URL, init?: RequestInit) => {
        const h = new Headers(init?.headers);
        if (
          key.startsWith("sb_") &&
          h.get("Authorization") === `Bearer ${key}`
        ) {
          h.delete("Authorization");
        }
        h.set("apikey", key);
        return fetch(input, { ...init, headers: h });
      },
    },
  });
}

export const escXml = (s: unknown) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

export const stripHtml = (html: string) =>
  (html || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export const truncate = (s: string, n: number) => {
  const t = (s || "").replace(/\s+/g, " ").trim();
  if (t.length <= n) return t;
  const cut = t.slice(0, n);
  const sp = cut.lastIndexOf(" ");
  return (sp > n * 0.6 ? cut.slice(0, sp) : cut).trimEnd() + "\u2026";
};

const isoDate = (d: string | null | undefined) =>
  (d ? new Date(d) : new Date()).toISOString().split("T")[0];

export const rfc822 = (d: string | null | undefined) =>
  new Date(d || Date.now()).toUTCString();

const PAGE_SIZE = 1000;

/**
 * Reads every row of a query in pages. The Data API caps a single response at
 * 1000 rows, so an unpaged feed silently truncates once a site grows past it.
 * Query errors are thrown, never turned into an empty feed.
 */
export async function fetchAllRows<T>(
  build: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  label: string,
): Promise<T[]> {
  const rows: T[] = [];
  for (let page = 0; ; page += 1) {
    const from = page * PAGE_SIZE;
    const { data, error } = await build(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`${label} read failed: ${error.message}`);
    const batch = data ?? [];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) return rows;
    // Guard against an unbounded loop if the backend ignores the range.
    if (page > 200) return rows;
  }
}

export async function getSiteSettings() {
  const supabase = publicClient();
  const { data, error } = await supabase
    .from("site_settings")
    .select(
      "site_name, site_url, author_name, author_title, author_bio, publisher_name",
    )
    .limit(1)
    .maybeSingle();
  // A failed read must not silently fall back to the template's own identity —
  // that would publish this site's branding inside somebody else's feed.
  if (error) throw new Error(`site_settings read failed: ${error.message}`);
  const s = (data ?? {}) as {
    site_name?: string | null;
    site_url?: string | null;
    author_name?: string | null;
    author_title?: string | null;
    author_bio?: string | null;
    publisher_name?: string | null;
  };
  return {
    site_name: s.site_name ?? null,
    author_name: s.author_name ?? null,
    author_title: s.author_title ?? null,
    author_bio: s.author_bio ?? null,
    publisher_name: s.publisher_name ?? null,
    siteUrl: (s.site_url || siteConfig.identity.siteUrl).replace(/\/+$/, ""),
  };
}

interface UrlEntry {
  loc: string;
  lastmod?: string;
  changefreq?: string;
  priority?: string;
}

function urlsetXml(entries: UrlEntry[]): string {
  const urls = entries
    .map((e) =>
      [
        `  <url>`,
        `    <loc>${escXml(e.loc)}</loc>`,
        e.lastmod ? `    <lastmod>${e.lastmod}</lastmod>` : "",
        e.changefreq ? `    <changefreq>${e.changefreq}</changefreq>` : "",
        e.priority ? `    <priority>${e.priority}</priority>` : "",
        `  </url>`,
      ]
        .filter(Boolean)
        .join("\n"),
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;
}

async function loadPublished() {
  const supabase = publicClient();
  const [posts, schemas, pages, pillars] = await Promise.all([
    fetchAllRows(
      (from, to) =>
        supabase
          .from("posts")
          .select(
            "slug, title, excerpt, tldr, content, published_at, created_at, updated_at",
          )
          .eq("status", "published")
          .order("published_at", { ascending: false, nullsFirst: false })
          .order("created_at", { ascending: false })
          .range(from, to),
      "posts",
    ),
    fetchAllRows(
      (from, to) =>
        supabase
          .from("content_schemas")
          .select("id, slug")
          .eq("is_active", true)
          .order("slug")
          .range(from, to),
      "content_schemas",
    ),
    fetchAllRows(
      (from, to) =>
        supabase
          .from("generated_pages")
          .select(
            "slug, title, content_json, seo_meta, content_schema_id, updated_at",
          )
          .eq("status", "published")
          .order("title")
          .range(from, to),
      "generated_pages",
    ),
    fetchAllRows(
      (from, to) =>
        supabase
          .from("pillar_pages")
          .select("slug, title, content, seo_meta, updated_at")
          .eq("status", "published")
          .order("title")
          .range(from, to),
      "pillar_pages",
    ),
  ]);
  return { posts, schemas, pages, pillars };
}

export async function buildSitemapXml(): Promise<string> {
  const { siteUrl } = await getSiteSettings();
  const client = publicClient();
  const [{ posts, schemas, pages, pillars }, shopOffers, branding] =
    await Promise.all([
      loadPublished(),
      loadShopSitemapOffers((from, to) =>
        client
          .from("offers")
          .select(SHOP_DISCOVERY_COLUMNS)
          .eq("status", "published")
          .eq("show_in_shop", true)
          .eq("funnel_only", false)
          .order("slug")
          .range(from, to),
      ),
      client
        .from("site_branding")
        .select("settings")
        .eq("id", true)
        .maybeSingle(),
    ]);
  if (branding.error)
    throw new Error(`site_branding read failed: ${branding.error.message}`);
  const config = branding.data
    ? buildRuntimeConfig(branding.data.settings)
    : siteConfig;
  const schemaMap = new Map(schemas.map((s) => [s.id, s.slug]));
  const activeSchemaIds = new Set(
    pages.map((p) => p.content_schema_id).filter(Boolean),
  );

  const entries: UrlEntry[] = [
    { loc: `${siteUrl}/`, changefreq: "weekly", priority: "1.0" },
    { loc: `${siteUrl}/blog`, changefreq: "weekly", priority: "0.8" },
    { loc: `${siteUrl}/shop`, changefreq: "weekly", priority: "0.8" },
    { loc: `${siteUrl}/start-here`, changefreq: "monthly", priority: "0.8" },
    { loc: `${siteUrl}/support`, changefreq: "monthly", priority: "0.4" },
    { loc: `${siteUrl}/privacy`, changefreq: "monthly", priority: "0.3" },
    { loc: `${siteUrl}/terms`, changefreq: "monthly", priority: "0.3" },
  ];

  if (config.sections.speaking)
    entries.push({
      loc: `${siteUrl}/speaking`,
      changefreq: "monthly",
      priority: "0.7",
    });

  for (const offer of shopOffers) {
    entries.push({
      loc: `${siteUrl}/offers/${offer.slug}`,
      lastmod: isoDate(offer.updated_at),
      changefreq: "monthly",
      priority: "0.7",
    });
  }

  for (const p of posts) {
    entries.push({
      loc: `${siteUrl}/blog/${p.slug}`,
      lastmod: isoDate(p.updated_at),
      changefreq: "monthly",
      priority: "0.7",
    });
  }

  entries.push({
    loc: `${siteUrl}/resources`,
    changefreq: "weekly",
    priority: "0.8",
  });
  for (const s of schemas) {
    if (activeSchemaIds.has(s.id)) {
      entries.push({
        loc: `${siteUrl}/resources/${s.slug}`,
        changefreq: "weekly",
        priority: "0.7",
      });
    }
  }
  for (const pg of pages) {
    const typeSlug = schemaMap.get(pg.content_schema_id as string);
    if (!typeSlug) continue;
    entries.push({
      loc: `${siteUrl}/resources/${typeSlug}/${pg.slug}`,
      lastmod: isoDate(pg.updated_at),
      changefreq: "monthly",
      priority: "0.6",
    });
  }
  for (const p of pillars) {
    entries.push({
      loc: `${siteUrl}/guides/${p.slug}`,
      lastmod: isoDate(p.updated_at),
      changefreq: "monthly",
      priority: "0.9",
    });
  }
  entries.push({
    loc: `${siteUrl}/sitemap`,
    changefreq: "monthly",
    priority: "0.4",
  });

  return urlsetXml(entries);
}

export async function buildRssXml(): Promise<string> {
  const s = await getSiteSettings();
  const supabase = publicClient();
  const { data, error } = await supabase
    .from("posts")
    .select(
      "slug, title, excerpt, tldr, content, published_at, created_at, updated_at",
    )
    .eq("status", "published")
    .order("published_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw new Error(`posts read failed: ${error.message}`);
  const posts = data ?? [];

  const brandName = s.site_name || s.publisher_name || "Blog";
  const channelTitle = /blog$/i.test(brandName)
    ? brandName
    : `${brandName} Blog`;
  const description =
    s.author_bio ||
    (s.author_name
      ? `${s.author_name}${s.author_title ? ", " + s.author_title : ""} — latest articles`
      : `Latest articles from ${brandName}`);
  const author = s.author_name || s.publisher_name || "";

  const items = posts
    .map((p) => {
      const link = `${s.siteUrl}/blog/${p.slug}`;
      const desc = truncate(
        p.excerpt || p.tldr || stripHtml(p.content || ""),
        500,
      );
      return `    <item>
      <title>${escXml(p.title)}</title>
      <link>${escXml(link)}</link>
      <guid isPermaLink="true">${escXml(link)}</guid>
      <pubDate>${escXml(rfc822(p.published_at || p.created_at))}</pubDate>
      ${author ? `<dc:creator>${escXml(author)}</dc:creator>` : ""}
      <description>${escXml(desc)}</description>
    </item>`;
    })
    .join("\n");

  const lastBuild = rfc822(posts[0]?.updated_at || posts[0]?.created_at);

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>${escXml(channelTitle)}</title>
    <link>${escXml(s.siteUrl)}</link>
    <atom:link href="${escXml(s.siteUrl)}/rss.xml" rel="self" type="application/rss+xml" />
    <description>${escXml(description)}</description>
    <language>en-us</language>
    <lastBuildDate>${escXml(lastBuild)}</lastBuildDate>
${items}
  </channel>
</rss>`;
}

export async function buildLlmsTxt(full: boolean): Promise<string> {
  const s = await getSiteSettings();
  const { posts, schemas, pages, pillars } = await loadPublished();
  const schemaMap = new Map(schemas.map((x) => [x.id, x.slug]));

  const siteName = s.site_name || s.publisher_name || "Website";
  const brand =
    s.author_bio ||
    (s.author_name
      ? `${s.author_name}${s.author_title ? ", " + s.author_title : ""}`
      : "");

  const out: string[] = [`# ${siteName}`, ""];
  if (brand) out.push(`> ${truncate(brand, 240)}`, "");
  out.push(`Site: ${s.siteUrl}`);
  out.push(`Last updated: ${new Date().toISOString().split("T")[0]}`, "");

  if (pillars.length) {
    out.push("## Guides", "");
    for (const p of pillars) {
      const seo = (p.seo_meta ?? {}) as Record<string, string>;
      const desc =
        seo.meta_description || seo.description || stripHtml(p.content || "");
      out.push(
        `- [${p.title}](${s.siteUrl}/guides/${p.slug}): ${truncate(desc, 160)}`,
      );
      if (full) {
        const body = stripHtml(p.content || "");
        if (body) out.push("", `  ${truncate(body, 600)}`, "");
      }
    }
    out.push("");
  }

  if (pages.length) {
    out.push("## Resources", "");
    for (const pg of pages) {
      const typeSlug = schemaMap.get(pg.content_schema_id as string);
      if (!typeSlug) continue;
      const content = (pg.content_json ?? {}) as Record<string, unknown>;
      const seo = (pg.seo_meta ?? {}) as Record<string, string>;
      const intro =
        seo.meta_description ||
        seo.description ||
        (typeof content.intro === "string" ? content.intro : "") ||
        (typeof content.summary === "string" ? content.summary : "") ||
        "";
      out.push(
        `- [${pg.title}](${s.siteUrl}/resources/${typeSlug}/${pg.slug}): ${truncate(intro, 120)}`,
      );
      if (full && intro) out.push("", `  ${truncate(intro, 600)}`, "");
    }
    out.push("");
  }

  if (posts.length) {
    out.push("## Blog", "");
    for (const p of posts) {
      const desc = p.excerpt || p.tldr || stripHtml(p.content || "");
      out.push(
        `- [${p.title}](${s.siteUrl}/blog/${p.slug}): ${truncate(desc, 160)}`,
      );
      if (full) {
        const body = p.tldr || stripHtml(p.content || "");
        if (body) out.push("", `  ${truncate(body, 600)}`, "");
      }
    }
    out.push("");
  }

  return out.join("\n");
}
