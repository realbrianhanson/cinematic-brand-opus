import { createClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";
import { authorizeCronOrAdmin } from "../_shared/cronAuth.ts";
import {
  decliningSearchPages,
  type SearchPerformanceRow,
} from "../_shared/searchFreshness.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Historical imports are 28-day aggregates. Never manufacture daily windows
// from their fetch timestamps or row order.
async function gscDeclineIds(
  supabase: any,
  siteUrl: string,
): Promise<{ url: string; delta: number }[]> {
  const rows: SearchPerformanceRow[] = [];
  const pageSize = 1000;
  for (let offset = 0; offset < 50_000; offset += pageSize) {
    const { data, error } = await supabase
      .from("gsc_performance")
      .select(
        "page_url, query, clicks, impressions, position, period_start, period_end",
      )
      .order("period_end", { ascending: false })
      .order("id", { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (error)
      throw new Error(`Search performance read failed: ${error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < pageSize)
      return decliningSearchPages(rows, siteUrl);
  }
  // A bounded partial history cannot establish comparable reporting periods.
  console.warn(
    "Search freshness comparison skipped: history exceeds 50,000 rows",
  );
  return [];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { headers: corsHeaders });

  const authResult = await authorizeCronOrAdmin(req, corsHeaders);
  if (authResult instanceof Response) return authResult;

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    const { data: settings } = await supabase
      .from("site_settings")
      .select("site_url")
      .limit(1)
      .maybeSingle();
    const siteUrl = (settings?.site_url || "").replace(/\/+$/, "");

    const cutoff = new Date(
      Date.now() - 90 * 24 * 60 * 60 * 1000,
    ).toISOString();

    const [dateFlags, gscFlags] = await Promise.all([
      supabase
        .from("generated_pages")
        .select("id, slug, content_schemas(slug)")
        .eq("status", "published")
        .or(`last_refreshed.lt.${cutoff},last_refreshed.is.null`),
      siteUrl ? gscDeclineIds(supabase, siteUrl) : Promise.resolve([]),
    ]);
    if (dateFlags.error)
      throw new Error(
        `Content freshness read failed: ${dateFlags.error.message}`,
      );

    const dateStaleIds: string[] = (dateFlags.data || []).map((p: any) => p.id);

    // Map GSC declining URLs back to page IDs.
    // URL shape: {siteUrl}/resources/{content_schema_slug}/{slug}
    const decliningIds: string[] = [];
    if (Array.isArray(gscFlags) && gscFlags.length > 0 && siteUrl) {
      const { data: allPages, error: pagesError } = await supabase
        .from("generated_pages")
        .select("id, slug, content_schemas(slug)")
        .eq("status", "published");
      if (pagesError)
        throw new Error(
          `Published resources read failed: ${pagesError.message}`,
        );
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
        JSON.stringify({
          flagged: 0,
          message:
            "No resources were flagged by the available date and comparable search-period checks.",
        }),
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
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
