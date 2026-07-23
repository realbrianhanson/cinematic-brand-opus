// Dynamic sitemap. A reverse proxy maps /sitemap.xml on the site domain to this
// function. `type=main` returns ONE complete <urlset> with every published URL —
// search engines reject cross-host sitemap index entries pointing at supabase.co.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const escXml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

const isoDate = (d: string | null | undefined) =>
  d ? new Date(d).toISOString().split("T")[0] : new Date().toISOString().split("T")[0];

interface UrlEntry {
  loc: string;
  lastmod?: string;
  changefreq?: string;
  priority?: string;
}

function urlsetXml(entries: UrlEntry[]): string {
  const urls = entries
    .map((e) => {
      const lines = [
        `  <url>`,
        `    <loc>${escXml(e.loc)}</loc>`,
        e.lastmod ? `    <lastmod>${e.lastmod}</lastmod>` : "",
        e.changefreq ? `    <changefreq>${e.changefreq}</changefreq>` : "",
        e.priority ? `    <priority>${e.priority}</priority>` : "",
        `  </url>`,
      ].filter(Boolean);
      return lines.join("\n");
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const type = url.searchParams.get("type") || "main";

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: settings } = await supabase
      .from("site_settings")
      .select("site_url")
      .limit(1)
      .maybeSingle();

    const siteUrl = (settings?.site_url || "https://brianhanson.com").replace(/\/+$/, "");

    let xml = "";
    if (type === "resources") {
      xml = urlsetXml(await resourcesEntries(supabase, siteUrl));
    } else if (type === "guides") {
      xml = urlsetXml(await guidesEntries(supabase, siteUrl));
    } else if (type === "blog") {
      xml = urlsetXml(await blogEntries(supabase, siteUrl));
    } else {
      xml = urlsetXml(await mainEntries(supabase, siteUrl));
    }

    return new Response(xml, {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (error: any) {
    console.error("Sitemap generation error:", error);
    return new Response(
      `<?xml version="1.0" encoding="UTF-8"?><error>${escXml(error.message || String(error))}</error>`,
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/xml" } }
    );
  }
});

async function mainEntries(supabase: any, siteUrl: string): Promise<UrlEntry[]> {
  const entries: UrlEntry[] = [];

  // Homepage
  entries.push({ loc: `${siteUrl}/`, changefreq: "weekly", priority: "1.0" });

  // Blog index + posts
  const { data: posts } = await supabase
    .from("posts")
    .select("slug, updated_at")
    .eq("status", "published");
  entries.push({ loc: `${siteUrl}/blog`, changefreq: "weekly", priority: "0.8" });
  for (const p of posts || []) {
    entries.push({
      loc: `${siteUrl}/blog/${p.slug}`,
      lastmod: isoDate(p.updated_at),
      changefreq: "monthly",
      priority: "0.7",
    });
  }

  // Resources index + content-type lists + generated pages
  entries.push({ loc: `${siteUrl}/resources`, changefreq: "weekly", priority: "0.8" });

  const { data: schemas } = await supabase
    .from("content_schemas")
    .select("id, slug")
    .eq("is_active", true);
  const schemaMap = new Map<string, string>((schemas || []).map((s: any) => [s.id, s.slug]));
  for (const s of schemas || []) {
    entries.push({
      loc: `${siteUrl}/resources/${s.slug}`,
      changefreq: "weekly",
      priority: "0.7",
    });
  }

  const { data: pages } = await supabase
    .from("generated_pages")
    .select("slug, updated_at, content_schema_id")
    .eq("status", "published");
  for (const pg of pages || []) {
    const typeSlug = schemaMap.get(pg.content_schema_id);
    if (!typeSlug) continue;
    entries.push({
      loc: `${siteUrl}/resources/${typeSlug}/${pg.slug}`,
      lastmod: isoDate(pg.updated_at),
      changefreq: "monthly",
      priority: "0.6",
    });
  }

  // Pillar guides
  const { data: pillars } = await supabase
    .from("pillar_pages")
    .select("slug, updated_at")
    .eq("status", "published");
  for (const p of pillars || []) {
    entries.push({
      loc: `${siteUrl}/guides/${p.slug}`,
      lastmod: isoDate(p.updated_at),
      changefreq: "monthly",
      priority: "0.9",
    });
  }

  // HTML sitemap
  entries.push({ loc: `${siteUrl}/sitemap`, changefreq: "monthly", priority: "0.4" });

  return entries;
}

async function resourcesEntries(supabase: any, siteUrl: string): Promise<UrlEntry[]> {
  const entries: UrlEntry[] = [
    { loc: `${siteUrl}/resources`, changefreq: "weekly", priority: "0.8" },
  ];
  const { data: schemas } = await supabase
    .from("content_schemas")
    .select("id, slug")
    .eq("is_active", true);
  const schemaMap = new Map<string, string>((schemas || []).map((s: any) => [s.id, s.slug]));

  const { data: pages } = await supabase
    .from("generated_pages")
    .select("slug, updated_at, content_schema_id")
    .eq("status", "published");

  // Only include hub URLs for content types with at least 1 published page —
  // otherwise the hub renders "No published resources found." (thin content).
  const activeSchemaIds = new Set<string>(
    (pages || []).map((p: any) => p.content_schema_id).filter(Boolean),
  );
  for (const s of schemas || []) {
    if (activeSchemaIds.has(s.id)) {
      entries.push({ loc: `${siteUrl}/resources/${s.slug}`, changefreq: "weekly", priority: "0.7" });
    }
  }

  for (const pg of pages || []) {
    const typeSlug = schemaMap.get(pg.content_schema_id);
    if (!typeSlug) continue;
    entries.push({
      loc: `${siteUrl}/resources/${typeSlug}/${pg.slug}`,
      lastmod: isoDate(pg.updated_at),
      changefreq: "monthly",
      priority: "0.6",
    });
  }
  return entries;
}

async function guidesEntries(supabase: any, siteUrl: string): Promise<UrlEntry[]> {
  const { data: pillars } = await supabase
    .from("pillar_pages")
    .select("slug, updated_at")
    .eq("status", "published");
  return (pillars || []).map((p: any) => ({
    loc: `${siteUrl}/guides/${p.slug}`,
    lastmod: isoDate(p.updated_at),
    changefreq: "monthly",
    priority: "0.9",
  }));
}

async function blogEntries(supabase: any, siteUrl: string): Promise<UrlEntry[]> {
  const entries: UrlEntry[] = [
    { loc: `${siteUrl}/blog`, changefreq: "weekly", priority: "0.8" },
  ];
  const { data: posts } = await supabase
    .from("posts")
    .select("slug, updated_at")
    .eq("status", "published");
  for (const p of posts || []) {
    entries.push({
      loc: `${siteUrl}/blog/${p.slug}`,
      lastmod: isoDate(p.updated_at),
      changefreq: "monthly",
      priority: "0.7",
    });
  }
  return entries;
}
