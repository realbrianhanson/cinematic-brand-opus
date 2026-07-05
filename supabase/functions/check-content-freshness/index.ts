import { createClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";
import { authorizeCronOrAdmin } from "../_shared/cronAuth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Aggregate GSC data by page over two 14-day windows within the last 28 days
// and flag pages whose clicks or average position declined.
async function gscDeclineIds(supabase: any, siteUrl: string): Promise<{ url: string; delta: number }[]> {
  const { data: recent } = await supabase.from("gsc_performance").select("*").order("period_end", { ascending: false }).limit(50000);
  if (!recent || recent.length === 0) return [];
  // Group by page_url; split into "recent half" vs "older half" of the 28d snapshot by fetched_at.
  const perPage: Record<string, { clicksNew: number; clicksOld: number; posNew: number; posOld: number; nNew: number; nOld: number }> = {};
  const midpoint = recent[Math.floor(recent.length / 2)]?.fetched_at || null;
  for (const r of recent) {
    const url = String(r.page_url);
    perPage[url] ||= { clicksNew: 0, clicksOld: 0, posNew: 0, posOld: 0, nNew: 0, nOld: 0 };
    const isNew = midpoint ? new Date(r.fetched_at) >= new Date(midpoint) : true;
    if (isNew) {
      perPage[url].clicksNew += r.clicks;
      perPage[url].posNew += Number(r.position);
      perPage[url].nNew += 1;
    } else {
      perPage[url].clicksOld += r.clicks;
      perPage[url].posOld += Number(r.position);
      perPage[url].nOld += 1;
    }
  }
  const results: { url: string; delta: number }[] = [];
  for (const [url, v] of Object.entries(perPage)) {
    const clickDelta = v.clicksNew - v.clicksOld;
    const posNew = v.nNew ? v.posNew / v.nNew : 0;
    const posOld = v.nOld ? v.posOld / v.nOld : 0;
    // Decline = clicks dropped OR average position got worse (higher = worse)
    if (clickDelta < 0 || posNew > posOld) {
      results.push({ url, delta: clickDelta });
    }
  }
  results.sort((a, b) => a.delta - b.delta); // biggest click drops first
  return results;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const authResult = await authorizeCronOrAdmin(req, corsHeaders);
  if (authResult instanceof Response) return authResult;

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    const { data: settings } = await supabase.from("site_settings").select("site_url").limit(1).maybeSingle();
    const siteUrl = (settings?.site_url || "").replace(/\/+$/, "");

    const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

    const [dateFlags, gscFlags] = await Promise.all([
      supabase
        .from("generated_pages")
        .select("id, slug, content_schemas(slug)")
        .eq("status", "published")
        .or(`last_refreshed.lt.${cutoff},last_refreshed.is.null`),
      siteUrl ? gscDeclineIds(supabase, siteUrl) : Promise.resolve([]),
    ]);

    const dateStaleIds: string[] = (dateFlags.data || []).map((p: any) => p.id);

    // Map GSC declining URLs back to page IDs.
    // URL shape: {siteUrl}/resources/{content_schema_slug}/{slug}
    const decliningIds: string[] = [];
    if (Array.isArray(gscFlags) && gscFlags.length > 0 && siteUrl) {
      const { data: allPages } = await supabase
        .from("generated_pages")
        .select("id, slug, content_schemas(slug)")
        .eq("status", "published");
      const urlToId: Record<string, string> = {};
      for (const p of (allPages || []) as any[]) {
        const cs = p.content_schemas?.slug;
        if (cs) urlToId[`${siteUrl}/resources/${cs}/${p.slug}`] = p.id;
      }
      for (const g of gscFlags) {
        const id = urlToId[g.url];
        if (id) decliningIds.push(id);
      }
    }

    // Priority order: GSC-declining first, then date-stale (dedupe).
    const seen = new Set<string>();
    const priorityOrdered = [...decliningIds, ...dateStaleIds].filter((id) => {
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });

    if (priorityOrdered.length === 0) {
      return new Response(
        JSON.stringify({ flagged: 0, message: "All content is fresh." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { error: updateErr } = await supabase
      .from("generated_pages")
      .update({ performance_trend: "needs_refresh" })
      .in("id", priorityOrdered);
    if (updateErr) throw new Error(`Update failed: ${updateErr.message}`);

    return new Response(
      JSON.stringify({
        flagged: priorityOrdered.length,
        gsc_declining: decliningIds.length,
        date_stale: dateStaleIds.length,
        page_ids: priorityOrdered,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    console.error("check-content-freshness error:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
