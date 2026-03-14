import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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

    // Get site_url from site_settings
    const { data: settings } = await supabase
      .from("site_settings")
      .select("site_url")
      .limit(1)
      .maybeSingle();

    const siteUrl = (settings?.site_url || "https://example.com").replace(
      /\/$/,
      ""
    );

    let xml = "";

    if (type === "resources") {
      xml = await generateResourcesSitemap(supabase, siteUrl);
    } else if (type === "guides") {
      xml = await generateGuidesSitemap(supabase, siteUrl);
    } else if (type === "blog") {
      xml = await generateBlogSitemap(supabase, siteUrl);
    } else {
      // main - sitemap index
      xml = generateSitemapIndex(siteUrl);
    }

    return new Response(xml, {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (error) {
    console.error("Sitemap generation error:", error);
    return new Response(
      `<?xml version="1.0" encoding="UTF-8"?><error>${error.message}</error>`,
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/xml" },
      }
    );
  }
});

function generateSitemapIndex(siteUrl: string): string {
  const funcUrl = Deno.env.get("SUPABASE_URL")!;
  return `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap>
    <loc>${funcUrl}/functions/v1/generate-sitemap?type=resources</loc>
  </sitemap>
  <sitemap>
    <loc>${funcUrl}/functions/v1/generate-sitemap?type=guides</loc>
  </sitemap>
  <sitemap>
    <loc>${funcUrl}/functions/v1/generate-sitemap?type=blog</loc>
  </sitemap>
</sitemapindex>`;
}

async function generateResourcesSitemap(
  supabase: any,
  siteUrl: string
): Promise<string> {
  // Fetch published generated pages with joins
  const { data: pages } = await supabase
    .from("generated_pages")
    .select("slug, updated_at, content_schema_id, niche_id")
    .eq("status", "published");

  // Fetch content schemas and niches for URL building
  const { data: schemas } = await supabase
    .from("content_schemas")
    .select("id, slug")
    .eq("is_active", true);

  const { data: niches } = await supabase
    .from("niches")
    .select("id, slug")
    .eq("is_active", true);

  const schemaMap = new Map((schemas || []).map((s: any) => [s.id, s.slug]));
  const nicheMap = new Map((niches || []).map((n: any) => [n.id, n.slug]));

  let urls = "";

  // Resources index
  urls += `  <url>
    <loc>${siteUrl}/resources</loc>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>\n`;

  // Content type list pages
  const activeSchemasSlugs = new Set<string>();
  for (const s of schemas || []) {
    activeSchemasSlugs.add(s.slug);
    urls += `  <url>
    <loc>${siteUrl}/resources/${s.slug}</loc>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>\n`;
  }

  // Individual pages
  for (const page of pages || []) {
    const contentTypeSlug = schemaMap.get(page.content_schema_id);
    const nicheSlug = nicheMap.get(page.niche_id);
    if (!contentTypeSlug || !nicheSlug) continue;

    const lastmod = page.updated_at
      ? new Date(page.updated_at).toISOString().split("T")[0]
      : new Date().toISOString().split("T")[0];

    urls += `  <url>
    <loc>${siteUrl}/resources/${contentTypeSlug}/${nicheSlug}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>\n`;
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}</urlset>`;
}

async function generateGuidesSitemap(
  supabase: any,
  siteUrl: string
): Promise<string> {
  const { data: pillars } = await supabase
    .from("pillar_pages")
    .select("slug, updated_at")
    .eq("status", "published");

  let urls = "";
  for (const p of pillars || []) {
    const lastmod = p.updated_at
      ? new Date(p.updated_at).toISOString().split("T")[0]
      : new Date().toISOString().split("T")[0];

    urls += `  <url>
    <loc>${siteUrl}/guides/${p.slug}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.9</priority>
  </url>\n`;
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}</urlset>`;
}

async function generateBlogSitemap(
  supabase: any,
  siteUrl: string
): Promise<string> {
  const { data: posts } = await supabase
    .from("posts")
    .select("slug, updated_at")
    .eq("status", "published");

  let urls = "";

  urls += `  <url>
    <loc>${siteUrl}/blog</loc>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>\n`;

  for (const post of posts || []) {
    const lastmod = post.updated_at
      ? new Date(post.updated_at).toISOString().split("T")[0]
      : new Date().toISOString().split("T")[0];

    urls += `  <url>
    <loc>${siteUrl}/blog/${post.slug}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>\n`;
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}</urlset>`;
}
