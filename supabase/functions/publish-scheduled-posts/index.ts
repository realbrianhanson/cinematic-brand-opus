import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authorizeCronOrAdmin } from "../_shared/cronAuth.ts";
import {
  evaluateGate,
  gateErrorReason,
  holdReasonText,
  loadGateSettings,
  nextHoldUpdate,
  publishTimeAction,
  type GateFailure,
  type GateSettings,
} from "../_shared/publishGate.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

type DuePost = {
  id: string;
  status: string;
  quality_score: number | null;
  lint_flags: unknown;
  fact_check: unknown;
  opportunity_id: string | null;
  publish_override: boolean | null;
  auto_scheduled_at: string | null;
  schedule_checked_at: string | null;
  held_reason: string | null;
  held_at: string | null;
};

type Held = { id: string; held_reason: string; failures: string[] };

/**
 * Records why a due post was not published. Never silent: the reason lands on
 * the post (posts.held_reason / held_at) for the Articles list, editor and
 * Overview. Unchanged reasons are not rewritten, so re-checks every cron run
 * do not bump updated_at under an open editor.
 */
async function recordHold(
  supabase: any,
  post: DuePost,
  reasons: GateFailure[],
  now: string,
): Promise<Held> {
  const reason = holdReasonText(reasons);
  const update = nextHoldUpdate(post, reason, now);
  if (update) {
    const { error } = await supabase
      .from("posts")
      .update(update)
      .eq("id", post.id)
      .eq("status", "scheduled");
    if (error)
      console.error("recording hold failed", post.id, error.message, reason);
  }
  return {
    id: post.id,
    held_reason: reason,
    failures: reasons.map((r) => r.message),
  };
}

async function gateAtPublishTime(
  supabase: any,
  post: DuePost,
  settings: GateSettings | null,
  settingsError: string | null,
): Promise<GateFailure[]> {
  if (!settings) return [gateErrorReason(settingsError ?? "settings missing")];
  try {
    const gate = await evaluateGate(supabase, post as any, settings, {
      // Scheduled posts already consumed budget when they were scheduled.
      ignoreDailyCap: true,
    });
    return gate.reasons;
  } catch (e) {
    return [gateErrorReason((e as Error).message)];
  }
}

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
        "id, status, quality_score, lint_flags, fact_check, opportunity_id, publish_override, auto_scheduled_at, schedule_checked_at, held_reason, held_at",
      )
      .eq("status", "scheduled")
      .lte("scheduled_at", now);

    if (fetchError) throw fetchError;

    if (!posts || posts.length === 0) {
      return json({
        published: 0,
        ids: [],
        held: [],
        failed: [],
        message: "No posts to publish",
      });
    }

    // Only posts that need a gate check read settings; a settings failure
    // holds those posts (with the reason recorded) instead of failing the run.
    let settings: GateSettings | null = null;
    let settingsError: string | null = null;
    const due = posts as DuePost[];
    if (due.some((p) => publishTimeAction(p) === "gate")) {
      try {
        settings = await loadGateSettings(supabase);
      } catch (e) {
        settingsError = (e as Error).message;
      }
    }

    const published: string[] = [];
    const held: Held[] = [];
    const failed: Array<{ id: string; error: string }> = [];

    for (const post of due) {
      if (publishTimeAction(post) === "gate") {
        const reasons = await gateAtPublishTime(
          supabase,
          post,
          settings,
          settingsError,
        );
        if (reasons.length > 0) {
          held.push(await recordHold(supabase, post, reasons, now));
          continue;
        }
      }

      // The posts trigger also clears held_reason/held_at on publish; setting
      // them here keeps the row consistent even if the trigger is missing.
      const { data: updated, error: updateError } = await supabase
        .from("posts")
        .update({
          status: "published",
          published_at: now,
          held_reason: null,
          held_at: null,
        })
        .eq("id", post.id)
        .eq("status", "scheduled")
        .select("id");

      if (updateError) {
        failed.push({ id: post.id, error: updateError.message });
        continue;
      }
      // Lost a race (unscheduled, deleted or published elsewhere): not ours.
      if (!updated || updated.length === 0) continue;
      published.push(post.id);

      if (post.opportunity_id) {
        const { error: oppErr } = await supabase
          .from("content_opportunities")
          .update({ status: "published" })
          .eq("id", post.opportunity_id)
          .in("status", ["queued", "approved"]);
        if (oppErr)
          console.error(
            "opportunity status update failed",
            post.opportunity_id,
            oppErr.message,
          );
      }
    }

    console.log(
      `Scheduled publish run: ${published.length} published, ${held.length} held, ${failed.length} failed`,
      held.length ? JSON.stringify(held) : "",
    );

    return json(
      {
        published: published.length,
        ids: published,
        held,
        failed,
      },
      failed.length > 0 ? 207 : 200,
    );
  } catch (err) {
    console.error("Error publishing scheduled posts:", err);
    return json({ error: (err as Error).message }, 500);
  }
});
