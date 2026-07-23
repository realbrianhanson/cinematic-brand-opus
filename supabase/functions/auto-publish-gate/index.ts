// Auto-publish gate: decides whether a pipeline draft should be auto-scheduled
// for the publish-scheduled-posts cron to pick up, or left in the approval queue.
// Never publishes directly. Uses shared publishGate helper so manual-publish
// and auto-publish share identical gate logic.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authorizeCronOrAdmin } from "../_shared/cronAuth.ts";
import { evaluateGate, loadGateSettings, type GatePost } from "../_shared/publishGate.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const auth = await authorizeCronOrAdmin(req, corsHeaders);
  if (auth instanceof Response) return auth;

  const { post_id } = await req.json().catch(() => ({}));
  if (!post_id) {
    return new Response(JSON.stringify({ error: "post_id required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const settings = await loadGateSettings(supabase);

  if (!settings.auto_publish_enabled) {
    return new Response(
      JSON.stringify({ ok: true, decision: "skipped", reason: "auto-publish disabled" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const { data: post, error: postErr } = await supabase
    .from("posts")
    .select("id, status, quality_score, lint_flags, fact_check, opportunity_id, scheduled_at")
    .eq("id", post_id)
    .maybeSingle();
  if (postErr || !post) {
    return new Response(JSON.stringify({ error: "post not found" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (post.status !== "draft" || !post.opportunity_id) {
    return new Response(
      JSON.stringify({ ok: true, decision: "skipped", reason: "not a pipeline draft" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const { passed, failures } = await evaluateGate(supabase, post as GatePost, settings);
  if (!passed) {
    return new Response(
      JSON.stringify({ ok: true, decision: "queued", reasons: failures }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // Drip slot: earliest is now+10min; otherwise 90min after latest scheduled.
  const { data: latest } = await supabase
    .from("posts")
    .select("scheduled_at")
    .eq("status", "scheduled")
    .order("scheduled_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const nowPlus10 = Date.now() + 10 * 60 * 1000;
  const latestMs = latest?.scheduled_at ? new Date(latest.scheduled_at).getTime() + 90 * 60 * 1000 : 0;
  const scheduled_at = new Date(Math.max(nowPlus10, latestMs)).toISOString();

  const { error: upErr } = await supabase
    .from("posts")
    .update({ status: "scheduled", scheduled_at })
    .eq("id", post_id);
  if (upErr) {
    return new Response(JSON.stringify({ error: upErr.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  await supabase
    .from("content_opportunities")
    .update({ status: "approved" })
    .eq("id", post.opportunity_id);

  return new Response(
    JSON.stringify({ ok: true, decision: "scheduled", scheduled_at }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
