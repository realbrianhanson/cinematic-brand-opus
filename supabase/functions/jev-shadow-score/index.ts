// Jev shadow-mode pilot. Scores recent news items and article ideas with
// TypeSafe's Jev decision model and stores what it WOULD have decided.
// It only reads pipeline tables and only writes public.jev_shadow_scores,
// so it cannot change what the pipeline drafts or publishes.
// See docs/JEV_PILOT.md.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authorizeCronOrAdmin } from "../_shared/cronAuth.ts";
import {
  buildJevRequest,
  isPilotActive,
  parseJevResponse,
  QUESTIONS_VERSION,
  type ShadowSubject,
} from "../_shared/jevShadow.ts";

// Confirm both at deploy time against the Lovable AI Gateway docs.
const JEV_ENDPOINT = "https://ai.gateway.lovable.dev/v1/systemone";
const JEV_MODEL = "typesafe/jev-latest";

const MAX_PER_RUN = 60;
const REQUEST_TIMEOUT_MS = 8000;
const LOOKBACK_HOURS = 72;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });
  const auth = await authorizeCronOrAdmin(req, corsHeaders);
  if (auth instanceof Response) return auth;

  if (!isPilotActive(new Date())) {
    return json({ skipped: "pilot ended" });
  }

  const lovableKey = Deno.env.get("LOVABLE_API_KEY");
  if (!lovableKey) return json({ error: "LOVABLE_API_KEY not set" }, 503);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const since = new Date(
    Date.now() - LOOKBACK_HOURS * 3600 * 1000,
  ).toISOString();
  const ninetyDaysAgo = new Date(
    Date.now() - 90 * 24 * 3600 * 1000,
  ).toISOString();

  const [itemsRes, oppsRes, postsRes, scoredRes] = await Promise.all([
    supabase
      .from("source_items")
      .select("id, title, raw_excerpt, topic_lane")
      .gte("fetched_at", since)
      .order("fetched_at", { ascending: false })
      .limit(400),
    supabase
      .from("content_opportunities")
      .select("id, angle, target_keyword, topic_lane, rationale")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(400),
    supabase
      .from("posts")
      .select("title")
      .eq("status", "published")
      .gte("published_at", ninetyDaysAgo)
      .order("published_at", { ascending: false })
      .limit(120),
    supabase
      .from("jev_shadow_scores")
      .select("subject_type, subject_id")
      .eq("questions_version", QUESTIONS_VERSION)
      .gte("created_at", since),
  ]);

  const readError =
    itemsRes.error || oppsRes.error || postsRes.error || scoredRes.error;
  if (readError) return json({ error: readError.message }, 500);

  const done = new Set(
    (scoredRes.data ?? []).map((r) => `${r.subject_type}:${r.subject_id}`),
  );
  const recentTitles = (postsRes.data ?? [])
    .map((p) => p.title as string)
    .filter(Boolean);

  const subjects: ShadowSubject[] = [
    ...(oppsRes.data ?? []).map((o) => ({
      type: "opportunity" as const,
      id: o.id as string,
      title: (o.angle as string) ?? "",
      targetKeyword: o.target_keyword as string | null,
      topicLane: o.topic_lane as string | null,
      rationale: o.rationale as string | null,
    })),
    ...(itemsRes.data ?? []).map((s) => ({
      type: "source_item" as const,
      id: s.id as string,
      title: (s.title as string) ?? "",
      excerpt: s.raw_excerpt as string | null,
      topicLane: s.topic_lane as string | null,
    })),
  ]
    .filter((s) => s.title && !done.has(`${s.type}:${s.id}`))
    .slice(0, MAX_PER_RUN);

  let scored = 0;
  let failed = 0;
  for (const subject of subjects) {
    const request = buildJevRequest(subject, recentTitles);
    const started = Date.now();
    let row: Record<string, unknown> = {
      subject_type: subject.type,
      subject_id: subject.id,
      model: JEV_MODEL,
      questions_version: QUESTIONS_VERSION,
    };
    try {
      const res = await fetch(JEV_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${lovableKey}`,
        },
        body: JSON.stringify({ model: JEV_MODEL, ...request }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      const text = await res.text();
      const latency = Date.now() - started;
      if (!res.ok) {
        row = {
          ...row,
          latency_ms: latency,
          error: `HTTP ${res.status}: ${text.slice(0, 500)}`,
        };
        failed++;
        // A 4xx on the very first call means the endpoint or model id is
        // wrong; stop instead of burning through the batch.
        if (scored === 0 && failed === 1 && res.status < 500) {
          await supabase.from("jev_shadow_scores").upsert(row, {
            onConflict: "subject_type,subject_id,questions_version",
          });
          return json({ error: "Jev call rejected", status: res.status }, 502);
        }
      } else {
        const body = JSON.parse(text);
        row = {
          ...row,
          ...parseJevResponse(body),
          model: typeof body?.model === "string" ? body.model : JEV_MODEL,
          raw: body,
          latency_ms: latency,
        };
        scored++;
      }
    } catch (e) {
      row = {
        ...row,
        latency_ms: Date.now() - started,
        error: e instanceof Error ? e.message.slice(0, 500) : String(e),
      };
      failed++;
    }
    const { error } = await supabase
      .from("jev_shadow_scores")
      .upsert(row, { onConflict: "subject_type,subject_id,questions_version" });
    if (error) console.error("jev_shadow_scores upsert failed", error.message);
  }

  console.log(
    `Jev shadow run: ${scored} scored, ${failed} failed, ${subjects.length} attempted`,
  );
  return json({ scored, failed, attempted: subjects.length });
});
