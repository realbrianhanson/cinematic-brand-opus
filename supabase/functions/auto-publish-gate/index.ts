// Auto-publish gate: decides whether a pipeline draft should be auto-scheduled
// for the publish-scheduled-posts cron to pick up, or left in the approval queue.
// Never publishes directly. Uses shared publishGate helper so manual-publish
// and auto-publish share identical gate logic.
//
// Every hold is recorded on the post (held_reason/held_at) in plain English,
// and returned as `held_reason` + `hold_codes` so daily-content-run and the
// "Run now" toast can say why. A later successful schedule clears it.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authorizeCronOrAdmin } from "../_shared/cronAuth.ts";
import {
  evaluateGate,
  holdReasonText,
  loadGateSettings,
  nextHoldUpdate,
  scheduleHoldReason,
  type GateFailure,
  type GatePost,
  type HoldState,
} from "../_shared/publishGate.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

async function recordHold(
  supabase: any,
  post: GatePost & HoldState,
  reasons: GateFailure[],
): Promise<string> {
  const reason = holdReasonText(reasons);
  const update = nextHoldUpdate(post, reason, new Date().toISOString());
  if (update) {
    const { error } = await supabase
      .from("posts")
      .update(update)
      .eq("id", post.id)
      .eq("status", "draft");
    if (error)
      console.error("recording hold failed", post.id, error.message, reason);
  }
  return reason;
}

function queued(reasons: GateFailure[], heldReason: string) {
  return json({
    ok: true,
    decision: "queued",
    reasons: reasons.map((r) => r.message),
    hold_codes: reasons.map((r) => r.code),
    held_reason: heldReason,
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });
  const auth = await authorizeCronOrAdmin(req, corsHeaders);
  if (auth instanceof Response) return auth;

  const { post_id } = await req.json().catch(() => ({}));
  if (!post_id || typeof post_id !== "string") {
    return json({ error: "post_id required" }, 400);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let settings;
  try {
    settings = await loadGateSettings(supabase);
  } catch (e) {
    // Fail closed: without readable settings nothing gets scheduled.
    return json(
      { error: "gate settings unavailable", detail: (e as Error).message },
      503,
    );
  }

  if (!settings.auto_publish_enabled) {
    return json({
      ok: true,
      decision: "skipped",
      reason: "auto-publish disabled",
    });
  }

  const { data: post, error: postErr } = await supabase
    .from("posts")
    .select(
      "id, status, quality_score, lint_flags, fact_check, opportunity_id, scheduled_at, held_reason, held_at",
    )
    .eq("id", post_id)
    .maybeSingle();
  if (postErr || !post) {
    return json({ error: "post not found" }, 404);
  }

  if (post.status !== "draft" || !post.opportunity_id) {
    return json({
      ok: true,
      decision: "skipped",
      reason: "not a pipeline draft",
    });
  }

  const gate = await evaluateGate(supabase, post as GatePost, settings);
  if (!gate.passed) {
    return queued(gate.reasons, await recordHold(supabase, post, gate.reasons));
  }

  // The RPC re-checks quality, fact-check and the cap under an advisory lock.
  const { data: decision, error } = await supabase.rpc(
    "content_schedule_checked",
    { _post_id: post_id },
  );
  if (error) return json({ error: error.message }, 503);

  if (decision?.decision === "scheduled") {
    if (post.held_reason) {
      const { error: clearErr } = await supabase
        .from("posts")
        .update({ held_reason: null, held_at: null })
        .eq("id", post_id)
        .eq("status", "scheduled");
      if (clearErr)
        console.error("clearing hold failed", post_id, clearErr.message);
    }
    return json({ ok: true, ...decision });
  }

  const rpcHold = scheduleHoldReason(
    decision?.reason,
    settings.auto_publish_daily_cap,
  );
  if (decision?.decision === "queued" && rpcHold) {
    const reasons = [rpcHold];
    return queued(reasons, await recordHold(supabase, post, reasons));
  }
  return json({ ok: true, ...decision });
});
