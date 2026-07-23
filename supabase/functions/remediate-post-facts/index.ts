// Admin-triggered fact remediation for a single post. Runs the remediation
// helper (rewrite content to drop contradicted claims + attribute unverified
// ones) then re-runs fact-check exactly once, using fact_check.remediated as
// the idempotency guard.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authorizeCronOrAdmin } from "../_shared/cronAuth.ts";
import { MAIN_MODEL } from "../_shared/models.ts";
import { loadVoiceConfig, formatVoiceBlock } from "../_shared/voice.ts";
import { remediatePostFacts } from "../_shared/factRemediation.ts";

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
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const apiKey = Deno.env.get("LOVABLE_API_KEY")!;
  const voice = await loadVoiceConfig(supabase);
  const voiceBlock = formatVoiceBlock(voice);

  const result = await remediatePostFacts({
    supabase, apiKey, model: MAIN_MODEL, postId: post_id, voice, voiceBlock,
  });
  if (!result.ok) {
    return new Response(JSON.stringify({ ok: false, reason: result.reason }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (!result.changed) {
    return new Response(JSON.stringify({ ok: true, changed: false, reason: result.reason }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Re-run fact-check exactly once (fact_check.remediated=true blocks a second pass)
  try {
    const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/fact-check`;
    const fcRes = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        "x-cron-secret": Deno.env.get("CRON_INVOCATION_SECRET") || "",
      },
      body: JSON.stringify({ post_id }),
    });
    const fcData = await fcRes.json().catch(() => ({}));
    return new Response(JSON.stringify({ ok: true, changed: true, fact_check: fcData }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: true, changed: true, fact_check_error: e?.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
