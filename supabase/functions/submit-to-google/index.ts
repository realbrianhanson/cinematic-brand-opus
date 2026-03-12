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
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body = await req.json();
    const { page_id, page_url, all_unsubmitted } = body;

    // Get site settings for sitemap URL
    const { data: settings } = await supabase
      .from("site_settings")
      .select("site_url")
      .limit(1)
      .maybeSingle();

    const siteUrl = (settings?.site_url || "https://example.com").replace(/\/$/, "");
    const sitemapUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/generate-sitemap?type=main`;

    let results: { submitted: number; errors: string[] } = { submitted: 0, errors: [] };

    if (all_unsubmitted) {
      // Find published pages not yet in indexing_log
      const { data: pages } = await supabase
        .from("generated_pages")
        .select("id, slug, content_schema_id, niche_id, content_schemas(slug), niches(slug)")
        .eq("status", "published");

      const { data: existingLogs } = await supabase
        .from("indexing_log")
        .select("page_id");

      const submittedIds = new Set((existingLogs || []).map((l: any) => l.page_id));

      for (const pg of pages || []) {
        if (submittedIds.has(pg.id)) continue;
        const contentSlug = (pg as any).content_schemas?.slug;
        const nicheSlug = (pg as any).niches?.slug;
        if (!contentSlug || !nicheSlug) continue;
        const url = `${siteUrl}/resources/${contentSlug}/${nicheSlug}`;
        try {
          await submitPage(supabase, pg.id, url, sitemapUrl);
          results.submitted++;
        } catch (e: any) {
          results.errors.push(`${pg.id}: ${e.message}`);
        }
      }
    } else if (page_id && page_url) {
      await submitPage(supabase, page_id, page_url, sitemapUrl);
      results.submitted = 1;
    } else {
      return new Response(
        JSON.stringify({ error: "Provide page_id + page_url, or all_unsubmitted: true" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, ...results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Submit to Google error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

async function submitPage(
  supabase: any,
  pageId: string,
  pageUrl: string,
  sitemapUrl: string
) {
  // Simple ping — notify Google that sitemap has been updated
  try {
    const pingUrl = `https://www.google.com/ping?sitemap=${encodeURIComponent(sitemapUrl)}`;
    const resp = await fetch(pingUrl);
    await resp.text(); // consume body
  } catch (e) {
    // Non-fatal: ping may fail but we still log the submission
    console.warn("Google ping failed:", e);
  }

  // Log to indexing_log
  const { error } = await supabase.from("indexing_log").insert({
    page_id: pageId,
    page_url: pageUrl,
    submitted_at: new Date().toISOString(),
    status: "submitted",
  });

  if (error) throw error;
}
