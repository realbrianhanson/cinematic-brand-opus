// Public, no auth. RSS 2.0 feed of the 50 most recent published blog posts.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const esc = (s: unknown) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

const stripHtml = (html: string) =>
  (html || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

const truncate = (s: string, n: number) => {
  const t = (s || "").trim();
  if (t.length <= n) return t;
  const cut = t.slice(0, n);
  const sp = cut.lastIndexOf(" ");
  return (sp > n * 0.6 ? cut.slice(0, sp) : cut).trimEnd() + "…";
};

const rfc822 = (d: string | null | undefined) =>
  new Date(d || Date.now()).toUTCString();

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: settings } = await supabase
      .from("site_settings")
      .select("site_name, site_url, author_name, author_bio, author_title, publisher_name")
      .limit(1)
      .maybeSingle();

    const s: any = settings || {};
    const siteUrl = (s.site_url || "https://brianhanson.com").replace(/\/+$/, "");
    const brandName = s.site_name || s.publisher_name || "Blog";
    const channelTitle = /blog$/i.test(brandName) ? brandName : `${brandName} Blog`;
    const description =
      s.author_bio ||
      (s.author_name
        ? `${s.author_name}${s.author_title ? ", " + s.author_title : ""} — latest articles`
        : `Latest articles from ${brandName}`);
    const author = s.author_name || s.publisher_name || "";

    const { data: posts } = await supabase
      .from("posts")
      .select("slug, title, excerpt, tldr, content, created_at, updated_at")
      .eq("status", "published")
      .order("created_at", { ascending: false })
      .limit(50);

    const items = (posts || [])
      .map((p: any) => {
        const link = `${siteUrl}/blog/${p.slug}`;
        const desc = truncate(
          p.excerpt || p.tldr || stripHtml(p.content || ""),
          500
        );
        return `    <item>
      <title>${esc(p.title)}</title>
      <link>${esc(link)}</link>
      <guid isPermaLink="true">${esc(link)}</guid>
      <pubDate>${esc(rfc822(p.created_at))}</pubDate>
      ${author ? `<author>${esc(author)}</author>` : ""}
      <description>${esc(desc)}</description>
    </item>`;
      })
      .join("\n");

    const lastBuild = rfc822(posts?.[0]?.updated_at || posts?.[0]?.created_at);

    const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${esc(channelTitle)}</title>
    <link>${esc(siteUrl)}</link>
    <atom:link href="${esc(siteUrl)}/rss.xml" rel="self" type="application/rss+xml" />
    <description>${esc(description)}</description>
    <language>en-us</language>
    <lastBuildDate>${esc(lastBuild)}</lastBuildDate>
${items}
  </channel>
</rss>`;

    return new Response(rss, {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/rss+xml; charset=utf-8",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (error: any) {
    console.error("rss error:", error);
    return new Response(
      `<?xml version="1.0" encoding="UTF-8"?><error>${esc(error.message || String(error))}</error>`,
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/xml" } }
    );
  }
});
