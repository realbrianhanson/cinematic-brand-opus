// Server-only helpers that build the public discovery feeds (sitemap, RSS,
// llms.txt). Reads published rows through the publishable key — RLS applies.
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export function publicClient() {
  const key = process.env.SUPABASE_PUBLISHABLE_KEY!;
  return createClient<Database>(process.env.SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input: RequestInfo | URL, init?: RequestInit) => {
        const h = new Headers(init?.headers);
        if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) {
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
  (html || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

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

export async function getSiteSettings() {
  const supabase = publicClient();
  const { data } = await supabase
    .from("site_settings")
    .select(
      "site_name, site_url, author_name, author_title, author_bio, publisher_name",
    )
    .limit(1)
    .maybeSingle();
  const s = (data ?? {}) as Record<string, string | null>;
  return {
    ...s,
    siteUrl: (s.site_url || "https://brianhanson.com").replace(/\/+$/, ""),
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
    supabase
      .from("posts")
      .select("slug, title, excerpt, tldr, content, created_at, updated_at")
      .eq("status", "published")
      .order("created_at", { ascending: false }),
    supabase.from("content_schemas").select("id, slug").eq("is_active", true),
    supabase
      .from("generated_pages")
      .select("slug, title, content_json, seo_meta, content_schema_id, updated_at")
      .eq("status", "published")
      .order("title"),
    supabase
      .from("pillar_pages")
      .select("slug, title, content, seo_meta, updated_at")
      .eq("status", "published")
      .order("title"),
  ]);
  return {
    posts: posts.data ?? [],
    schemas: schemas.data ?? [],
    pages: pages.data ?? [],
    pillars: pillars.data ?? [],
  };
}

export async function buildSitemapXml(): Promise<string> {
  const { siteUrl } = await getSiteSettings();
  const { posts, schemas, pages, pillars } = await loadPublished();
  const schemaMap = new Map(schemas.map((s) => [s.id, s.slug]));
  const activeSchemaIds = new Set(
    pages.map((p) => p.content_schema_id).filter(Boolean),
  );

  const entries: UrlEntry[] = [
    { loc: `${siteUrl}/`, changefreq: "weekly", priority: "1.0" },
    { loc: `${siteUrl}/blog`, changefreq: "weekly", priority: "0.8" },
  ];

  for (const p of posts) {
    entries.push({
      loc: `${siteUrl}/blog/${p.slug}`,
      lastmod: isoDate(p.updated_at),
      changefreq: "monthly",
      priority: "0.7",
    });
  }

  entries.push({ loc: `${siteUrl}/resources`, changefreq: "weekly", priority: "0.8" });
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
  entries.push({ loc: `${siteUrl}/sitemap`, changefreq: "monthly", priority: "0.4" });

  return urlsetXml(entries);
}

export async function buildRssXml(): Promise<string> {
  const s = await getSiteSettings();
  const supabase = publicClient();
  const { data } = await supabase
    .from("posts")
    .select("slug, title, excerpt, tldr, content, created_at, updated_at")
    .eq("status", "published")
    .order("created_at", { ascending: false })
    .limit(50);
  const posts = data ?? [];

  const brandName = s.site_name || s.publisher_name || "Blog";
  const channelTitle = /blog$/i.test(brandName) ? brandName : `${brandName} Blog`;
  const description =
    s.author_bio ||
    (s.author_name
      ? `${s.author_name}${s.author_title ? ", " + s.author_title : ""} — latest articles`
      : `Latest articles from ${brandName}`);
  const author = s.author_name || s.publisher_name || "";

  const items = posts
    .map((p) => {
      const link = `${s.siteUrl}/blog/${p.slug}`;
      const desc = truncate(p.excerpt || p.tldr || stripHtml(p.content || ""), 500);
      return `    <item>
      <title>${escXml(p.title)}</title>
      <link>${escXml(link)}</link>
      <guid isPermaLink="true">${escXml(link)}</guid>
      <pubDate>${escXml(rfc822(p.created_at))}</pubDate>
      ${author ? `<author>${escXml(author)}</author>` : ""}
      <description>${escXml(desc)}</description>
    </item>`;
    })
    .join("\n");

  const lastBuild = rfc822(posts[0]?.updated_at || posts[0]?.created_at);

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
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
      out.push(`- [${p.title}](${s.siteUrl}/guides/${p.slug}): ${truncate(desc, 160)}`);
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
      out.push(`- [${p.title}](${s.siteUrl}/blog/${p.slug}): ${truncate(desc, 160)}`);
      if (full) {
        const body = p.tldr || stripHtml(p.content || "");
        if (body) out.push("", `  ${truncate(body, 600)}`, "");
      }
    }
    out.push("");
  }

  return out.join("\n");
}
