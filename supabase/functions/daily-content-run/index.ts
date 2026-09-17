// Autonomous pipeline: poll-sources → cluster-opportunities → drain proposed queue
// (drafting each independently). Runs on a cron every ~30 min. Also invokable manually.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authorizeCronOrAdmin } from "../_shared/cronAuth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const MAX_DRAFTS_PER_RUN = 3;
const MAX_ATTEMPTS = 3;

async function invoke(fn: string, body: any = {}): Promise<any> {
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
    let data: any; try { data = JSON.parse(text); } catch { data = { raw: text }; }
    return { status: res.status, data };
  } catch (e: any) {
    return { status: 0, data: { error: e.message } };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const auth = await authorizeCronOrAdmin(req, corsHeaders);
  if (auth instanceof Response) return auth;

  const body = await req.json().catch(() => ({} as any));
  const skipPoll = !!body?.skip_poll;
  const skipCluster = !!body?.skip_cluster;
  const maxDrafts = Math.min(body?.max_drafts ?? MAX_DRAFTS_PER_RUN, 20);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const log: any = { started_at: new Date().toISOString(), steps: {} };

  // 1. Poll all active sources
  if (!skipPoll) {
    const poll = await invoke("poll-sources");
    log.steps.poll = { status: poll.status, ...poll.data };
  }

  // 2. Cluster + propose opportunities from the new items
  if (!skipCluster) {
    const cluster = await invoke("cluster-opportunities");
    log.steps.cluster = { status: cluster.status, ...cluster.data };
  }

  // 3. Atomic claim. The DB reserves opportunities, releases stale claims and
  //    enforces the remaining daily budget in one statement, so overlapping runs
  //    can never select the same rows or exceed the cap between read and write.
  const { data: settingsRow, error: settingsErr } = await supabase
    .from("site_settings_private")
    .select("auto_publish_daily_cap")
    .limit(1)
    .maybeSingle();
  if (settingsErr) {
    return new Response(
      JSON.stringify({ error: "settings unavailable", detail: settingsErr.message }),
      { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
  const capRaw = Number(settingsRow?.auto_publish_daily_cap);
  // Fail closed: an unreadable cap means no drafting on this run.
  const dailyCap = Number.isFinite(capRaw) && capRaw >= 0 ? capRaw : 0;

  const { data: queue, error: claimErr } = await supabase.rpc(
    "content_claim_opportunities",
    {
      _max: maxDrafts,
      _daily_cap: dailyCap,
      _max_attempts: MAX_ATTEMPTS,
      _stale_seconds: 600,
    },
  );
  if (claimErr) {
    return new Response(
      JSON.stringify({ error: "claim failed", detail: claimErr.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
  if (!queue || queue.length === 0) {
    log.steps.drafts = [];
    log.skipped_reason = "no claimable opportunities within the daily budget";
    log.finished_at = new Date().toISOString();
    return new Response(JSON.stringify({ ok: true, drafted: 0, log }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  log.steps.drafts = [];
  for (const opp of queue as Array<{ id: string; attempts: number }>) {
    const draft = await invoke("draft-from-opportunity", { opportunity_id: opp.id });
    const entry: any = { opportunity_id: opp.id, status: draft.status, ...draft.data };
    if (draft.status >= 200 && draft.status < 300 && draft.data?.post_id) {
      const postId = draft.data.post_id;
      try {
        const fc = await invoke("fact-check", { post_id: postId });
        entry.fact_check_status = fc.status;
        // If fact-check produced contradicted or many-unverified results, run
        // one remediation pass on THIS fresh draft, then re-check. Never runs
        // twice: fact_check.remediated=true blocks re-entry.
        const fcData = fc?.data || {};
        const needsRemediation =
          (fcData.contradicted_count ?? 0) > 0 || (fcData.unverified_count ?? 0) >= 3;
        if (needsRemediation) {
          const rem = await invoke("remediate-post-facts", { post_id: postId });
          entry.remediation = { status: rem.status, ...rem.data };
        }
      } catch (e: any) {
        entry.fact_check_status = 0;
      }
      try {
        const gate = await invoke("auto-publish-gate", { post_id: postId });
        entry.auto_publish = { status: gate.status, ...gate.data };
      } catch (e: any) {
        entry.auto_publish = { status: 0, error: e?.message };
      }
    }
    log.steps.drafts.push(entry);
    // If it failed non-terminally (server error), leave for next cron pass.
    if (draft.status >= 500) {
      await supabase.from("content_opportunities").update({
        last_error: (draft.data?.error || draft.data?.raw || "unknown error").toString().slice(0, 500),
      }).eq("id", opp.id);
    }
  }

  log.finished_at = new Date().toISOString();
  return new Response(JSON.stringify({ ok: true, drafted: log.steps.drafts.length, log }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
