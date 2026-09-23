// Autonomous pipeline: poll-sources → cluster-opportunities → drain proposed queue
// (drafting each independently) → re-check earlier held drafts. Runs on a cron
// every ~30 min. Also invokable manually ("Run now").
//
// AI credits: when any AI stage reports credit exhaustion (gateway 402 or a
// wrapped "Not enough credits"), the run stops drafting, returns the claimed
// opportunities to the queue, and responds with
// { ok: false, stopped_reason: 'ai_credits_exhausted', stopped_stage, message }.
// Re-checking held drafts still runs: it uses no AI.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authorizeCronOrAdmin } from "../_shared/cronAuth.ts";
import { loadGateSettings } from "../_shared/publishGate.ts";
import {
  AI_CREDITS_EXHAUSTED,
  AI_CREDITS_MESSAGE,
  isCreditsExhausted,
  type StageResult,
} from "./credits.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const MAX_DRAFTS_PER_RUN = 3;
const MAX_ATTEMPTS = 3;
// Held drafts re-checked per run. Each check is a DB-only gate call.
const REGATE_LIMIT = 10;
const CAP_CODES = new Set(["daily_cap", "daily_cap_unavailable"]);

type Claim = { id: string; attempts: number; claim_token: string };
type Stopped = { stage: string } | null;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

async function invoke(fn: string, body: any = {}): Promise<StageResult & any> {
  const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/${fn}`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        "x-cron-secret": Deno.env.get("CRON_INVOCATION_SECRET") || "",
      },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    let data: any;
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }
    return { status: res.status, data };
  } catch (e: any) {
    return { status: 0, data: { error: e.message } };
  }
}

/**
 * Returns a claimed opportunity to the queue without spending an attempt on
 * it. Also undoes draft-from-opportunity's terminal 'rejected' when the only
 * failure was running out of AI credits.
 */
async function releaseClaim(supabase: any, opp: Claim, drafted: boolean) {
  const { error } = await supabase
    .from("content_opportunities")
    .update({
      status: "proposed",
      claim_token: null,
      claim_started: false,
      attempts: Math.max(0, opp.attempts - 1),
      reject_reason: null,
      last_error: drafted
        ? AI_CREDITS_MESSAGE
        : "Not drafted: AI credits ran out earlier in this run",
    })
    .eq("id", opp.id)
    .eq("claim_token", opp.claim_token)
    .in("status", ["drafting", "rejected"]);
  if (error) console.error("releasing claim failed", opp.id, error.message);
}

/** Draft → fact-check → (remediate) → gate for one claimed opportunity. */
async function draftOne(
  opp: Claim,
): Promise<{ entry: any; draftStatus: number; stop: Stopped }> {
  const draft = await invoke("draft-from-opportunity", {
    opportunity_id: opp.id,
    claim_token: opp.claim_token,
  });
  const entry: any = {
    opportunity_id: opp.id,
    status: draft.status,
    ...draft.data,
  };
  const draftStatus = draft.status;
  if (isCreditsExhausted(draft))
    return { entry, draftStatus, stop: { stage: "draft" } };
  if (!(draft.status >= 200 && draft.status < 300 && draft.data?.post_id))
    return { entry, draftStatus, stop: null };

  const postId = draft.data.post_id;
  let stop: Stopped = null;
  const fc = await invoke("fact-check", { post_id: postId });
  entry.fact_check_status = fc.status;
  if (isCreditsExhausted(fc)) stop = { stage: "fact-check" };
  // If fact-check produced contradicted or many-unverified results, run one
  // remediation pass on THIS fresh draft. Never runs twice:
  // fact_check.remediated=true blocks re-entry.
  const fcData = fc?.data || {};
  const needsRemediation =
    (fcData.contradicted_count ?? 0) > 0 || (fcData.unverified_count ?? 0) >= 3;
  if (!stop && needsRemediation) {
    const rem = await invoke("remediate-post-facts", { post_id: postId });
    entry.remediation = { status: rem.status, ...rem.data };
    if (isCreditsExhausted(rem)) stop = { stage: "remediation" };
  }
  // The gate uses no AI, so a saved draft is always gated (and any hold
  // recorded) even when credits just ran out.
  const gate = await invoke("auto-publish-gate", { post_id: postId });
  entry.auto_publish = { status: gate.status, ...gate.data };
  return { entry, draftStatus, stop };
}

/**
 * Re-gates waiting pipeline drafts, freshest first, so drafts held earlier
 * (daily cap, since-fixed fact checks) are scheduled once they pass. Stops at
 * the first daily-cap hold: nothing else can be scheduled this run.
 */
async function regateHeldDrafts(supabase: any, skip: Set<string>) {
  const summary = {
    checked: 0,
    scheduled: 0,
    held: 0,
    stopped_by_cap: false,
    results: [] as Array<Record<string, unknown>>,
    error: undefined as string | undefined,
  };
  try {
    const settings = await loadGateSettings(supabase);
    if (!settings.auto_publish_enabled) return summary;
    const { data, error } = await supabase
      .from("posts")
      .select("id")
      .eq("status", "draft")
      .not("opportunity_id", "is", null)
      .gte("quality_score", settings.auto_publish_min_quality)
      .order("created_at", { ascending: false })
      .limit(REGATE_LIMIT + skip.size);
    if (error) throw error;
    const ids = (data ?? [])
      .map((p: { id: string }) => p.id)
      .filter((id: string) => !skip.has(id))
      .slice(0, REGATE_LIMIT);
    for (const postId of ids) {
      const gate = await invoke("auto-publish-gate", { post_id: postId });
      summary.checked++;
      const d = gate.data ?? {};
      summary.results.push({
        post_id: postId,
        status: gate.status,
        decision: d.decision,
        held_reason: d.held_reason,
      });
      if (d.decision === "scheduled") summary.scheduled++;
      else if (d.decision === "queued") summary.held++;
      const codes: string[] = Array.isArray(d.hold_codes) ? d.hold_codes : [];
      if (codes.some((c) => CAP_CODES.has(c))) {
        summary.stopped_by_cap = true;
        break;
      }
    }
  } catch (e) {
    summary.error = (e as Error).message;
    console.error("re-gating held drafts failed", summary.error);
  }
  return summary;
}

async function readDailyCap(supabase: any) {
  const { data, error } = await supabase
    .from("site_settings_private")
    .select("auto_publish_daily_cap")
    .limit(1)
    .maybeSingle();
  if (error) return { error: error.message as string };
  const capRaw = Number(data?.auto_publish_daily_cap);
  // Fail closed: an unreadable cap means no drafting on this run.
  return { cap: Number.isFinite(capRaw) && capRaw >= 0 ? capRaw : 0 };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });
  const auth = await authorizeCronOrAdmin(req, corsHeaders);
  if (auth instanceof Response) return auth;

  const body = await req.json().catch(() => ({}) as any);
  const skipPoll = !!body?.skip_poll;
  const skipCluster = !!body?.skip_cluster;
  const maxDrafts = Math.min(body?.max_drafts ?? MAX_DRAFTS_PER_RUN, 20);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: automationSettings, error: automationError } = await supabase
    .from("site_settings_private")
    .select("auto_publish_enabled")
    .limit(1)
    .maybeSingle();
  if (automationError)
    return json({ error: "Automation settings unavailable" }, 503);
  if (automationSettings?.auto_publish_enabled !== true)
    return json({ ok: true, skipped: "automation disabled" });

  const log: any = { started_at: new Date().toISOString(), steps: {} };
  let stopped: Stopped = null;

  // 1. Poll all active sources
  if (!skipPoll) {
    const poll = await invoke("poll-sources");
    log.steps.poll = { status: poll.status, ...poll.data };
    if (isCreditsExhausted(poll)) stopped = { stage: "poll" };
  }

  // 2. Cluster + propose opportunities from the new items
  if (!skipCluster && !stopped) {
    const cluster = await invoke("cluster-opportunities");
    log.steps.cluster = { status: cluster.status, ...cluster.data };
    if (isCreditsExhausted(cluster)) stopped = { stage: "cluster" };
  }

  // 3. Atomic claim. The DB reserves opportunities, releases stale claims and
  //    enforces the remaining daily budget in one statement, so overlapping runs
  //    can never select the same rows or exceed the cap between read and write.
  //    Skipped entirely once credits are known to be gone.
  let queue: Claim[] = [];
  if (!stopped) {
    const capResult = await readDailyCap(supabase);
    if ("error" in capResult)
      return json(
        { error: "settings unavailable", detail: capResult.error },
        503,
      );
    const { data, error: claimErr } = await supabase.rpc(
      "content_claim_opportunities",
      {
        _max: maxDrafts,
        _daily_cap: capResult.cap,
        _max_attempts: MAX_ATTEMPTS,
        _stale_seconds: 600,
      },
    );
    if (claimErr)
      return json({ error: "claim failed", detail: claimErr.message }, 500);
    queue = (data ?? []) as Claim[];
    if (queue.length === 0)
      log.skipped_reason = "no claimable opportunities within the daily budget";
  }

  // 4. Draft each claim. On credit exhaustion, stop and hand the rest back.
  log.steps.drafts = [];
  const draftedIds = new Set<string>();
  for (let i = 0; i < queue.length; i++) {
    const opp = queue[i];
    if (stopped) {
      await releaseClaim(supabase, opp, false);
      continue;
    }
    const { entry, draftStatus, stop } = await draftOne(opp);
    log.steps.drafts.push(entry);
    if (entry.post_id) draftedIds.add(entry.post_id);
    if (stop) {
      stopped = stop;
      if (stop.stage === "draft") await releaseClaim(supabase, opp, true);
      continue;
    }
    // If it failed non-terminally (server error), leave for next cron pass.
    if (draftStatus >= 500) {
      await supabase
        .from("content_opportunities")
        .update({
          last_error: (entry.error || entry.raw || "unknown error")
            .toString()
            .slice(0, 500),
        })
        .eq("id", opp.id);
    }
  }

  // 5. Re-check drafts held earlier (no AI involved).
  const regated = await regateHeldDrafts(supabase, draftedIds);
  log.steps.regate = regated;

  log.finished_at = new Date().toISOString();
  const drafted = log.steps.drafts.filter(
    (d: { post_id?: string }) => d.post_id,
  ).length;
  if (stopped) {
    console.error(`daily-content-run stopped: AI credits (${stopped.stage})`);
    return json({
      ok: false,
      stopped_reason: AI_CREDITS_EXHAUSTED,
      stopped_stage: stopped.stage,
      message: AI_CREDITS_MESSAGE,
      drafted,
      regated,
      log,
    });
  }
  return json({ ok: true, drafted, regated, log });
});
