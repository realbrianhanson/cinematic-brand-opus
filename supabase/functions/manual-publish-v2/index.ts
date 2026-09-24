// Manual publish endpoint. Human-only (rejects cron-secret-only callers).
// Runs the same gate checks as auto-publish-gate, for ONE post per call.
//
// Body: { post_id, mode?: 'publish' | 'schedule' | 'check', scheduled_at?,
//         override_reason? }
// - publish  (default) publishes now.
// - schedule runs the gate when Brian schedules, then sets status 'scheduled'
//            with schedule_checked_at/by. publish-scheduled-posts publishes it
//            on time without re-gating (auto-scheduled posts are re-gated).
// - check    evaluates the gate and writes nothing (editor readiness).
// If the gate fails: 422 { decision: 'blocked', failures }, unless the caller
// passes override_reason (10+ chars). Overrides are audited in
// post_publish_overrides and on the post (publish_override_*). Bulk or
// multi-id bodies are rejected with 400.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authorizeCronOrAdmin } from "../_shared/cronAuth.ts";
import {
  evaluateGate,
  gateErrorReason,
  loadGateSettings,
  type GateFailure,
  type GatePost,
} from "../_shared/publishGate.ts";
import {
  overrideCheck,
  parsePublishRequest,
  publishDecision,
} from "./request.ts";

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

async function gateReasons(supabase: any, post: GatePost) {
  // Fail closed: if the gate cannot be evaluated, treat it as a failure so
  // publishing still requires an explicit override reason.
  try {
    const settings = await loadGateSettings(supabase);
    const result = await evaluateGate(supabase, post, settings, {
      ignoreDailyCap: true,
    });
    return result.reasons;
  } catch (e) {
    return [gateErrorReason((e as Error).message)];
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });
  const auth = await authorizeCronOrAdmin(req, corsHeaders);
  if (auth instanceof Response) return auth;
  if (auth.mode !== "admin" || !auth.userId) {
    return json(
      { error: "manual-publish requires an admin user, not a cron secret" },
      403,
    );
  }

  const body = await req.json().catch(() => null);
  const request = parsePublishRequest(body, Date.now());
  if (!request.ok) return json({ ok: false, error: request.error }, 400);
  const { postId, mode, scheduledAt, overrideReason } = request;

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: post, error: postErr } = await supabase
    .from("posts")
    .select(
      "id, status, quality_score, lint_flags, fact_check, opportunity_id, updated_at",
    )
    .eq("id", postId)
    .maybeSingle();
  if (postErr || !post)
    return json({ ok: false, error: "post not found" }, 404);

  if (post.status === "published" && mode === "publish")
    return json({
      ok: true,
      already_published: true,
      updated_at: post.updated_at,
    });
  if (post.status === "published" && mode === "schedule")
    return json(
      {
        ok: false,
        error: "This article is already live, so it can't be scheduled",
      },
      409,
    );

  const reasons: GateFailure[] = await gateReasons(supabase, post as GatePost);
  const failures = reasons.map((r) => r.message);

  if (mode === "check")
    return json({
      ok: true,
      decision: failures.length === 0 ? "ready" : "blocked",
      failures,
      reasons,
    });

  const check = overrideCheck(failures.length, overrideReason);
  if (!check.proceed) {
    return json(
      {
        ok: false,
        decision: "blocked",
        failures,
        reasons,
        ...(check.reasonError ? { reason_error: check.reasonError } : {}),
        hint: "Pass override_reason (10+ chars) to continue anyway.",
      },
      422,
    );
  }

  const nowIso = new Date().toISOString();
  if (check.override) {
    // Audit first. No audit row, no override.
    const { error: auditErr } = await supabase
      .from("post_publish_overrides")
      .insert({
        post_id: postId,
        mode,
        reason: overrideReason.slice(0, 1000),
        failures,
        overridden_by: auth.userId,
      });
    if (auditErr) {
      console.error("override audit insert failed", postId, auditErr.message);
      return json(
        { ok: false, error: "The override could not be recorded. Try again" },
        500,
      );
    }
  }

  const update: Record<string, unknown> =
    mode === "schedule"
      ? {
          status: "scheduled",
          scheduled_at: scheduledAt,
          schedule_checked_at: nowIso,
          schedule_checked_by: auth.userId,
          // Hand-scheduled: not part of the auto-publish cap or re-gating.
          auto_scheduled_at: null,
          held_reason: null,
          held_at: null,
        }
      : {
          status: "published",
          published_at: nowIso,
          scheduled_at: null,
          held_reason: null,
          held_at: null,
        };
  if (check.override) {
    update.publish_override = true;
    update.publish_override_reason = overrideReason.slice(0, 1000);
    update.publish_override_at = nowIso;
    update.publish_override_by = auth.userId;
  }

  // Only change the post if its status is still what was gated above.
  const { data: saved, error: upErr } = await supabase
    .from("posts")
    .update(update)
    .eq("id", postId)
    .eq("status", post.status)
    .select("updated_at, scheduled_at")
    .maybeSingle();
  if (upErr) return json({ ok: false, error: upErr.message }, 500);
  if (!saved)
    return json(
      {
        ok: false,
        error:
          "The article changed while this was running. Reload and try again",
      },
      409,
    );

  if (mode === "publish" && post.opportunity_id) {
    const { error: oppErr } = await supabase
      .from("content_opportunities")
      .update({ status: "published" })
      .eq("id", post.opportunity_id);
    if (oppErr) {
      console.error(
        "opportunity status update failed",
        post.opportunity_id,
        oppErr.message,
      );
    }
  }

  return json({
    ok: true,
    decision: publishDecision(mode, check.override),
    failures,
    reasons,
    updated_at: saved.updated_at,
    ...(mode === "schedule" ? { scheduled_at: saved.scheduled_at } : {}),
  });
});
