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

  // Auth: verify caller is admin
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const anonClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: claims, error: claimsErr } = await anonClient.auth.getClaims(authHeader.replace("Bearer ", ""));
  if (claimsErr || !claims?.claims?.sub) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body = await req.json();
    const { page_id, rebuild_all } = body;

    if (rebuild_all) {
      // Batch rebuild: delete all auto-generated silo links, then recreate
      await supabase
        .from("internal_links")
        .delete()
        .in("link_type", ["silo_up", "silo_sibling"]);

      const { data: publishedPages } = await supabase
        .from("generated_pages")
        .select("id, niche_id, content_schema_id, slug, title, content_schemas(slug, name), niches(slug, name)")
        .eq("status", "published");

      const { data: pillarPages } = await supabase
        .from("pillar_pages")
        .select("id, niche_id, slug, title")
        .eq("status", "published");

      let linksCreated = 0;

      for (const page of publishedPages ?? []) {
        const created = await buildSiloLinks(
          supabase,
          page,
          publishedPages ?? [],
          pillarPages ?? []
        );
        linksCreated += created;
      }

      return new Response(
        JSON.stringify({ success: true, links_created: linksCreated }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!page_id) {
      return new Response(
        JSON.stringify({ error: "Provide page_id or rebuild_all: true" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Single page: clear existing silo links for this page, then rebuild
    await supabase
      .from("internal_links")
      .delete()
      .eq("source_page_id", page_id)
      .in("link_type", ["silo_up", "silo_sibling"]);

    // Also remove links from others pointing to this page as silo_sibling
    await supabase
      .from("internal_links")
      .delete()
      .eq("target_page_id", page_id)
      .eq("link_type", "silo_sibling");

    const { data: currentPage } = await supabase
      .from("generated_pages")
      .select("id, niche_id, content_schema_id, slug, title, content_schemas(slug, name), niches(slug, name)")
      .eq("id", page_id)
      .maybeSingle();

    if (!currentPage) {
      return new Response(
        JSON.stringify({ error: "Page not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get all published pages in same niche (siblings)
    const { data: siblingPages } = await supabase
      .from("generated_pages")
      .select("id, niche_id, content_schema_id, slug, title, content_schemas(slug, name), niches(slug, name)")
      .eq("niche_id", currentPage.niche_id!)
      .eq("status", "published")
      .neq("id", page_id);

    // Get pillar for this niche
    const { data: pillarPages } = await supabase
      .from("pillar_pages")
      .select("id, niche_id, slug, title")
      .eq("status", "published");

    const allPublished = [currentPage, ...(siblingPages ?? [])];
    const linksCreated = await buildSiloLinks(
      supabase,
      currentPage,
      allPublished,
      pillarPages ?? []
    );

    // Also create reciprocal sibling links (siblings → this page)
    for (const sibling of siblingPages ?? []) {
      // Check if sibling already has a link to this page
      const { data: existing } = await supabase
        .from("internal_links")
        .select("id")
        .eq("source_page_id", sibling.id)
        .eq("target_page_id", page_id)
        .eq("link_type", "silo_sibling")
        .maybeSingle();

      if (!existing) {
        const nicheName = (currentPage as any).niches?.name || "";
        const contentName = (currentPage as any).content_schemas?.name || "";
        const anchorText = pickAnchor(contentName, nicheName, currentPage.title, sibling.id, page_id);
        await supabase.from("internal_links").insert({
          source_page_id: sibling.id,
          source_page_type: "generated",
          target_page_id: page_id,
          target_page_type: "generated",
          link_type: "silo_sibling",
          anchor_text: anchorText,
          position: "related",
        });
      }
    }

    return new Response(
      JSON.stringify({ success: true, links_created: linksCreated }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Build silo links error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function pickAnchor(contentName: string, nicheName: string, title: string, sourceId: string, targetId: string): string {
  const variants = [
    `${contentName} for ${nicheName}`,
    `${nicheName} ${contentName.toLowerCase()}`,
    `Explore ${contentName.toLowerCase()}`,
    title.length <= 60 ? title : title.slice(0, 57) + "...",
  ];
  const hash = (sourceId + targetId).split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  return variants[hash % variants.length];
}

async function buildSiloLinks(
  supabase: any,
  page: any,
  allPublished: any[],
  pillarPages: any[]
): Promise<number> {
  let count = 0;
  const nicheId = page.niche_id;
  const nicheName = (page as any).niches?.name || "";

  // 1. Link UP to pillar (silo_up)
  const pillar = pillarPages.find((p: any) => p.niche_id === nicheId);
  if (pillar) {
    const { data: existing } = await supabase
      .from("internal_links")
      .select("id")
      .eq("source_page_id", page.id)
      .eq("target_page_id", pillar.id)
      .eq("link_type", "silo_up")
      .maybeSingle();

    if (!existing) {
      await supabase.from("internal_links").insert({
        source_page_id: page.id,
        source_page_type: "generated",
        target_page_id: pillar.id,
        target_page_type: "pillar",
        link_type: "silo_up",
        anchor_text: pillar.title,
        position: "pillar_banner",
      });
      count++;
    }
  }

  // 2. Link to SIBLINGS (same niche, different content type) — silo_sibling
  const siblings = allPublished.filter(
    (p: any) =>
      p.id !== page.id &&
      p.niche_id === nicheId &&
      p.content_schema_id !== page.content_schema_id
  );

  for (const sibling of siblings) {
    const { data: existing } = await supabase
      .from("internal_links")
      .select("id")
      .eq("source_page_id", page.id)
      .eq("target_page_id", sibling.id)
      .eq("link_type", "silo_sibling")
      .maybeSingle();

    if (!existing) {
      const contentName = (sibling as any).content_schemas?.name || "";
      const anchorText = pickAnchor(contentName, nicheName, sibling.title, page.id, sibling.id);
      await supabase.from("internal_links").insert({
        source_page_id: page.id,
        source_page_type: "generated",
        target_page_id: sibling.id,
        target_page_type: "generated",
        link_type: "silo_sibling",
        anchor_text: anchorText,
        position: "related",
      });
      count++;
    }
  }

  // NOTE: We do NOT create cross-silo links. This is intentional.
  // Link juice stays within the silo and flows up to the pillar.

  return count;
}
