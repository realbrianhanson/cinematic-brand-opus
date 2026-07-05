// Public, no auth. Generates llms.txt (or llms-full.txt with ?type=full).
// Format: https://llmstxt.org — plain-text index of the site for LLMs.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const truncate = (s: string, n: number) => {
  const t = (s || "").replace(/\s+/g, " ").trim();
  if (t.length <= n) return t;
  const cut = t.slice(0, n);
  const sp = cut.lastIndexOf(" ");
  return (sp > n * 0.6 ? cut.slice(0, sp) : cut).trimEnd() + "…";
};

const stripHtml = (html: string) =>
  (html || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const type = url.searchParams.get("type") || "index";
    const full = type === "full";

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: settings } = await supabase
      .from("site_settings")
      .select("site_name, site_url, author_name, author_title, author_bio, publisher_name")
      .limit(1)
      .maybeSingle();

    const s: any = settings || {};
    const siteUrl = (s.site_url || "https://brianhanson.com").replace(/\/+$/, "");
    const siteName = s.site_name || s.publisher_name || "Website";
    const brand =
      s.author_bio ||
      (s.author_name
        ? `${s.author_name}${s.author_title ? ", " + s.author_title : ""}`
        : "");

    const [{ data: pillars }, { data: pages }, { data: schemas }, { data: posts }] =
      await Promise.all([
        supabase
          .from("pillar_pages")
          .select("slug, title, content, seo_meta, updated_at")
          .eq("status", "published")
          .order("title"),
        supabase
          .from("generated_pages")
          .select("slug, title, content_json, seo_meta, content_schema_id, updated_at")
          .eq("status", "published")
          .order("title"),
        supabase
          .from("content_schemas")
          .select("id, slug")
          .eq("is_active", true),
        supabase
          .from("posts")
          .select("slug, title, excerpt, tldr, content, updated_at")
          .eq("status", "published")
          .order("created_at", { ascending: false }),
      ]);

    const schemaMap = new Map<string, string>(
      (schemas || []).map((x: any) => [x.id, x.slug])
    );

    const out: string[] = [];
    out.push(`# ${siteName}`);
    out.push("");
    if (brand) {
      out.push(`> ${truncate(brand, 240)}`);
      out.push("");
    }
    out.push(`Site: ${siteUrl}`);
    out.push(`Last updated: ${new Date().toISOString().split("T")[0]}`);
    out.push("");

    // Guides (pillar pages)
    if (pillars && pillars.length) {
      out.push("## Guides");
      out.push("");
      for (const p of pillars) {
        const seo = (p.seo_meta ?? {}) as any;
        const desc =
          seo.meta_description ||
          seo.description ||
          stripHtml(p.content || "");
        out.push(`- [${p.title}](${siteUrl}/guides/${p.slug}): ${truncate(desc, 160)}`);
        if (full) {
          const body = stripHtml(p.content || "");
          if (body) {
            out.push("");
            out.push(`  ${truncate(body, 600)}`);
            out.push("");
          }
        }
      }
      out.push("");
    }

    // Resources (generated pages)
    if (pages && pages.length) {
      out.push("## Resources");
      out.push("");
      for (const pg of pages) {
        const typeSlug = schemaMap.get(pg.content_schema_id);
        if (!typeSlug) continue;
        const content = (pg.content_json ?? {}) as any;
        const seo = (pg.seo_meta ?? {}) as any;
        const intro =
          seo.meta_description ||
          seo.description ||
          (typeof content.intro === "string" ? content.intro : "") ||
          (typeof content.summary === "string" ? content.summary : "") ||
          "";
        out.push(
          `- [${pg.title}](${siteUrl}/resources/${typeSlug}/${pg.slug}): ${truncate(intro, 120)}`
        );
        if (full && intro) {
          out.push("");
          out.push(`  ${truncate(intro, 600)}`);
          out.push("");
        }
      }
      out.push("");
    }

    // Blog
    if (posts && posts.length) {
      out.push("## Blog");
      out.push("");
      for (const p of posts) {
        const desc = p.excerpt || p.tldr || stripHtml(p.content || "");
        out.push(`- [${p.title}](${siteUrl}/blog/${p.slug}): ${truncate(desc, 160)}`);
        if (full) {
          const body = p.tldr || stripHtml(p.content || "");
          if (body) {
            out.push("");
            out.push(`  ${truncate(body, 600)}`);
            out.push("");
          }
        }
      }
      out.push("");
    }

    return new Response(out.join("\n"), {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (error: any) {
    console.error("llms-txt error:", error);
    return new Response(`# Error\n\n${error.message || String(error)}\n`, {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "text/plain; charset=utf-8" },
    });
  }
});
