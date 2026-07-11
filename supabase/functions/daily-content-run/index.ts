// Daily orchestrator: poll-sources → cluster-opportunities → draft-from-opportunity.
// Runs the whole pipeline in one invocation. Cron-safe.
import { authorizeCronOrAdmin } from "../_shared/cronAuth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

async function invoke(fn: string, body: any = {}): Promise<any> {
  const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/${fn}`;
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
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const auth = await authorizeCronOrAdmin(req, corsHeaders);
  if (auth instanceof Response) return auth;

  const log: any = { started_at: new Date().toISOString(), steps: {} };

  const poll = await invoke("poll-sources");
  log.steps.poll = { status: poll.status, ...poll.data };

  const cluster = await invoke("cluster-opportunities");
  log.steps.cluster = { status: cluster.status, ...cluster.data };

  const opportunities: any[] = cluster.data?.opportunities || [];
  log.steps.drafts = [];
  for (const opp of opportunities.slice(0, 2)) {
    const draft = await invoke("draft-from-opportunity", { opportunity_id: opp.id });
    log.steps.drafts.push({ opportunity_id: opp.id, status: draft.status, ...draft.data });
  }

  log.finished_at = new Date().toISOString();
  return new Response(JSON.stringify({ ok: true, log }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
