// Manual publish endpoint. Human-only (rejects cron-secret-only callers).
// Runs the same gate checks as auto-publish-gate. If they fail, either returns
// 422 with the failure list, OR publishes anyway when the caller supplies a
// non-empty override_reason (recorded on the post for audit).
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
  if (auth.mode !== "admin" || !auth.userId) {
    return new Response(JSON.stringify({ error: "manual-publish requires an admin user, not a cron secret" }), {
      status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const body = await req.json().catch(() => ({}));
  const post_id = body?.post_id;
  const rawReason = typeof body?.override_reason === "string" ? body.override_reason.trim() : "";
  if (!post_id) {
    return new Response(JSON.stringify({ error: "post_id required" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: post, error: postErr } = await supabase
    .from("posts")
    .select("id, status, quality_score, lint_flags, fact_check, opportunity_id")
    .eq("id", post_id)
    .maybeSingle();
  if (postErr || !post) {
    return new Response(JSON.stringify({ error: "post not found" }), {
      status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (post.status === "published") {
    return new Response(JSON.stringify({ ok: true, already_published: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const settings = await loadGateSettings(supabase);
  const { failures } = await evaluateGate(supabase, post as GatePost, settings, { ignoreDailyCap: true });

  const hasOverride = rawReason.length >= 10;
  if (failures.length > 0 && !hasOverride) {
    return new Response(JSON.stringify({
      ok: false, decision: "blocked", failures,
      hint: "Pass override_reason (10+ chars) to publish anyway.",
    }), {
      status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const update: any = {
    status: "published",
    published_at: new Date().toISOString(),
    scheduled_at: null,
  };
  if (failures.length > 0 && hasOverride) {
    update.publish_override = true;
    update.publish_override_reason = rawReason.slice(0, 1000);
    update.publish_override_at = new Date().toISOString();
    update.publish_override_by = auth.userId;
  }

  const { error: upErr } = await supabase.from("posts").update(update).eq("id", post_id);
  if (upErr) {
    return new Response(JSON.stringify({ error: upErr.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (post.opportunity_id) {
    await supabase.from("content_opportunities")
      .update({ status: "published" })
      .eq("id", post.opportunity_id);
  }

  return new Response(JSON.stringify({
    ok: true,
    decision: failures.length === 0 ? "published" : "published_with_override",
    failures,
  }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
