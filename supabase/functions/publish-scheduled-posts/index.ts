import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authorizeCronOrAdmin } from "../_shared/cronAuth.ts";
import { evaluateGate, loadGateSettings } from "../_shared/publishGate.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const authResult = await authorizeCronOrAdmin(req, corsHeaders);
  if (authResult instanceof Response) return authResult;

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const now = new Date().toISOString();

    const { data: posts, error: fetchError } = await supabase
      .from("posts")
      .select(
        "id, title, scheduled_at, status, quality_score, lint_flags, fact_check, opportunity_id, publish_override",
      )
      .eq("status", "scheduled")
      .lte("scheduled_at", now);

    if (fetchError) throw fetchError;

    if (!posts || posts.length === 0) {
      return new Response(JSON.stringify({ published: 0, message: "No posts to publish" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Re-check the CURRENT gate at publish time. A post may have been scheduled
    // days ago under different settings, or its quality/fact-check data may have
    // changed since. An explicit publish_override still wins.
    const settings = await loadGateSettings(supabase);

    const published: string[] = [];
    const held: Array<{ id: string; failures: string[] }> = [];
    const failed: Array<{ id: string; error: string }> = [];

    for (const post of posts) {
      if (!post.publish_override) {
        const gate = await evaluateGate(supabase, post as any, settings, {
          // Scheduled posts already consumed budget when they were scheduled.
          ignoreDailyCap: true,
        });
        if (!gate.passed) {
          held.push({ id: post.id, failures: gate.failures });
          continue;
        }
      }

      const { error: updateError } = await supabase
        .from("posts")
        .update({ status: "published", published_at: now, updated_at: now })
        .eq("id", post.id)
        .eq("status", "scheduled");

      if (updateError) {
        failed.push({ id: post.id, error: updateError.message });
        continue;
      }
      published.push(post.id);
    }

    console.log(
      `Scheduled publish run: ${published.length} published, ${held.length} held, ${failed.length} failed`,
    );

    return new Response(
      JSON.stringify({
        published: published.length,
        ids: published,
        held,
        failed,
      }),
      {
        status: failed.length > 0 ? 207 : 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (err) {
    console.error("Error publishing scheduled posts:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
