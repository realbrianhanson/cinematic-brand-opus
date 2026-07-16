// Auto-publish gate: decides whether a pipeline draft should be auto-scheduled
// for the publish-scheduled-posts cron to pick up, or left in the approval queue.
// Never publishes directly.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authorizeCronOrAdmin } from "../_shared/cronAuth.ts";

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

  // a. Load site settings
  const { data: settings } = await supabase
    .from("site_settings")
    .select("auto_publish_enabled, auto_publish_daily_cap, auto_publish_min_quality")
    .limit(1)
    .maybeSingle();

  const enabled = settings?.auto_publish_enabled ?? true;
  const dailyCap = settings?.auto_publish_daily_cap ?? 8;
  const minQuality = settings?.auto_publish_min_quality ?? 85;

  if (!enabled) {
    return new Response(
      JSON.stringify({ ok: true, decision: "skipped", reason: "auto-publish disabled" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // b. Load the post
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

  // c. Gate evaluation
  const failures: string[] = [];
  if (typeof post.quality_score !== "number" || post.quality_score < minQuality) {
    failures.push(`quality_score ${post.quality_score ?? "null"} below ${minQuality}`);
  }
  const lintFlags = post.lint_flags;
  if (Array.isArray(lintFlags) ? lintFlags.length > 0 : lintFlags != null) {
    failures.push("lint_flags present");
  }
  const fc: any = post.fact_check;
  if (!fc || !Array.isArray(fc.claims) || fc.claims.length < 2) {
    failures.push("fact_check missing or insufficient claims");
  } else {
    const bad = (fc.unverified_count ?? 0) + (fc.contradicted_count ?? 0);
    if (bad !== 0) failures.push(`${bad} unverified/contradicted claims`);
  }

  // d. Daily cap
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count: recentCount } = await supabase
    .from("posts")
    .select("id", { count: "exact", head: true })
    .not("opportunity_id", "is", null)
    .in("status", ["scheduled", "published"])
    .gt("updated_at", dayAgo);
  if ((recentCount ?? 0) >= dailyCap) {
    failures.push("daily cap reached");
  }

  if (failures.length > 0) {
    return new Response(
      JSON.stringify({ ok: true, decision: "queued", reasons: failures }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // f. Compute drip slot
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
