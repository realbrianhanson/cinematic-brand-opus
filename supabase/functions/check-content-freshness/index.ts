import { createClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  // Auth: verify caller is admin
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const anonClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: claims, error: claimsErr } = await anonClient.auth.getClaims(authHeader.replace("Bearer ", ""));
  if (claimsErr || !claims?.claims?.sub) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }

  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    // Find published pages not refreshed in 90+ days
    const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

    const { data: stalePages, error: fetchErr } = await supabase
      .from("generated_pages")
      .select("id")
      .eq("status", "published")
      .or(`last_refreshed.lt.${cutoff},last_refreshed.is.null`);

    if (fetchErr) throw new Error(`Query failed: ${fetchErr.message}`);

    const staleIds = (stalePages || []).map((p: any) => p.id);

    if (staleIds.length === 0) {
      return new Response(
        JSON.stringify({ flagged: 0, message: "All content is fresh." }),
        { headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    // Flag them
    const { error: updateErr } = await supabase
      .from("generated_pages")
      .update({ performance_trend: "needs_refresh" })
      .in("id", staleIds);

    if (updateErr) throw new Error(`Update failed: ${updateErr.message}`);

    return new Response(
      JSON.stringify({ flagged: staleIds.length, page_ids: staleIds }),
      { headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("check-content-freshness error:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Unknown error" }),
      { status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
    );
  }
});
