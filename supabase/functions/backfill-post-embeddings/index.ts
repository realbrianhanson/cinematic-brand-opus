// Backfills posts.embedding for rows where it's NULL. Batches of up to 40.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authorizeCronOrAdmin } from "../_shared/cronAuth.ts";
import { embedText, toPgVector } from "../_shared/embeddings.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const auth = await authorizeCronOrAdmin(req, corsHeaders);
  if (auth instanceof Response) return auth;

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const lovableKey = Deno.env.get("LOVABLE_API_KEY")!;

  const { data: rows, error } = await supabase
    .from("posts")
    .select("id, title, content")
    .is("embedding", null)
    .limit(40);
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let processed = 0;
  for (const r of rows || []) {
    const stripped = String(r.content || "").replace(/<[^>]+>/g, " ").slice(0, 6000);
    const text = `${r.title || ""}\n${stripped}`.trim();
    if (!text) continue;
    const vec = await embedText(text, lovableKey);
    if (!vec) continue;
    const { error: updErr } = await supabase
      .from("posts")
      .update({ embedding: toPgVector(vec) })
      .eq("id", r.id);
    if (updErr) {
      console.warn("update embedding failed", r.id, updErr.message);
      continue;
    }
    processed++;
  }

  const { count: remaining } = await supabase
    .from("posts")
    .select("id", { count: "exact", head: true })
    .is("embedding", null);

  return new Response(JSON.stringify({ processed, remaining: remaining ?? null }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
