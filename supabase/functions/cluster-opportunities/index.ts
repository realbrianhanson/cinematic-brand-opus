// Reads 'new' source_items, clusters near-duplicates via embedding cosine,
// asks Gemini to propose 1-2 Brian-aligned angles, saves as content_opportunities.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authorizeCronOrAdmin } from "../_shared/cronAuth.ts";
import { cosineSim } from "../_shared/embeddings.ts";
import { MAIN_MODEL } from "../_shared/models.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const CLUSTER_THRESHOLD = 0.82;

interface SourceItem {
  id: string;
  url: string;
  title: string | null;
  raw_excerpt: string | null;
  topic_lane: string | null;
  published_at: string | null;
  embedding: number[] | null;
}

function parseVec(v: any): number[] | null {
  if (Array.isArray(v)) return v;
  if (typeof v === "string" && v.startsWith("[")) {
    try { return JSON.parse(v); } catch { return null; }
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const auth = await authorizeCronOrAdmin(req, corsHeaders);
  if (auth instanceof Response) return auth;

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const lovableKey = Deno.env.get("LOVABLE_API_KEY")!;

  // Pull unused items from last 72h
  const cutoff = new Date(Date.now() - 72 * 3600 * 1000).toISOString();
  const { data: itemsRaw, error } = await supabase
    .from("source_items")
    .select("id, url, title, raw_excerpt, topic_lane, published_at, embedding")
    .eq("pipeline_status", "new")
    .gte("fetched_at", cutoff)
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(60);
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
  }

  const items: SourceItem[] = (itemsRaw || []).map((r: any) => ({
    ...r,
    embedding: parseVec(r.embedding),
  }));
  if (items.length === 0) {
    return new Response(JSON.stringify({ ok: true, clusters: 0, message: "no fresh items" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Cluster by cosine >= threshold; each item joins the first cluster it matches.
  const clusters: SourceItem[][] = [];
  for (const it of items) {
    if (!it.embedding) { clusters.push([it]); continue; }
    let placed = false;
    for (const c of clusters) {
      const rep = c[0];
      if (rep.embedding && cosineSim(it.embedding, rep.embedding) >= CLUSTER_THRESHOLD) {
        c.push(it); placed = true; break;
      }
    }
    if (!placed) clusters.push([it]);
  }

  // Fetch existing post titles for gap check
  const { data: existingPosts } = await supabase
    .from("posts")
    .select("title, created_at")
    .order("created_at", { ascending: false })
    .limit(80);
  const existingTitles = (existingPosts || []).map((p: any) => p.title).filter(Boolean);

  // Rank clusters by (size + recency + lane weight)
  const laneWeights: Record<string, number> = {
    ai_tools: 1.1, smb_marketing: 1.2, ai_training: 1.0, industry: 1.0,
  };
  const scored = clusters.map((c) => {
    const size = c.length;
    const newestTs = Math.max(...c.map((i) => i.published_at ? new Date(i.published_at).getTime() : 0));
    const ageHours = newestTs ? (Date.now() - newestTs) / 3600_000 : 96;
    const recencyBoost = Math.max(0, 72 - ageHours) / 72; // 0..1
    const lane = c[0].topic_lane || "ai_tools";
    const weight = laneWeights[lane] || 1.0;
    return { cluster: c, score: (size * 2 + recencyBoost * 3) * weight, lane, ageHours };
  }).sort((a, b) => b.score - a.score);

  // Take top 8 candidates → ask the LLM to pick up to 5 Brian would write about
  const top = scored.slice(0, 8);
  const candidatePayload = top.map((s, i) => ({
    idx: i,
    topic_lane: s.lane,
    items: s.cluster.slice(0, 4).map((it) => ({
      title: it.title, url: it.url, excerpt: it.raw_excerpt?.slice(0, 300),
    })),
  }));

  const systemPrompt = `You are Brian Hanson's editorial strategist.

Brian's brand: practical AI training for small-business owners (marketing, sales, conversions). Straight-talking. First-person. No jargon. Avoid corporate/generic AI news recap.

You will receive candidate news clusters from the last 72 hours. Pick UP TO 5 that Brian should write about. REJECT clusters that:
- Duplicate a title Brian has already covered in the last 60 posts
- Are pure model-release recaps with no small-business angle
- Are speculation/opinion pieces without concrete news

For each chosen cluster, return:
- angle: the specific take Brian would bring (1 sentence)
- target_keyword: the search phrase to rank for
- rationale: why this fits Brian's audience (1 sentence)
- gap_reason: what's missing from what's already out there
- format: one of "news_analysis" | "how_to" | "opinion" | "roundup"

Return JSON ONLY: { "picks": [{ idx, angle, target_keyword, rationale, gap_reason, format }] }
If none qualify, return { "picks": [] }.`;

  const userMsg = `Recent Brian posts (avoid duplicating):\n${existingTitles.slice(0, 40).map((t) => `- ${t}`).join("\n")}\n\nCandidate clusters:\n${JSON.stringify(candidatePayload, null, 2)}`;

  const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${lovableKey}` },
    body: JSON.stringify({
      model: MAIN_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMsg },
      ],
      temperature: 0.4,
    }),
  });

  if (!aiRes.ok) {
    const t = await aiRes.text();
    console.error("cluster picks LLM failed", aiRes.status, t);
    return new Response(JSON.stringify({ error: "LLM failed", details: t }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const aiData = await aiRes.json();
  let raw = aiData?.choices?.[0]?.message?.content || "";
  raw = raw.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();
  const s = raw.indexOf("{"), e = raw.lastIndexOf("}");
  if (s !== -1 && e > s) raw = raw.slice(s, e + 1);
  let picks: any = { picks: [] };
  try { picks = JSON.parse(raw); } catch { console.warn("bad pick JSON", raw.slice(0, 300)); }

  const created: any[] = [];
  for (const pick of (picks.picks || [])) {
    const cluster = top[pick.idx]?.cluster;
    if (!cluster) continue;
    const ids = cluster.map((i) => i.id);
    const { data: oppRow, error: oppErr } = await supabase
      .from("content_opportunities")
      .insert({
        source_item_ids: ids,
        angle: pick.angle,
        target_keyword: pick.target_keyword,
        topic_lane: top[pick.idx].lane,
        opportunity_score: Math.round(top[pick.idx].score * 10),
        rationale: pick.rationale,
        gap_reason: pick.gap_reason,
        brief: { format: pick.format, sources: cluster.map((c) => ({ url: c.url, title: c.title })) },
        status: "proposed",
      })
      .select()
      .single();
    if (oppErr) { console.warn("opp insert failed", oppErr.message); continue; }
    created.push(oppRow);
    // Mark used
    await supabase.from("source_items").update({ pipeline_status: "used" }).in("id", ids);
  }

  return new Response(
    JSON.stringify({ ok: true, clusters: clusters.length, considered: top.length, created: created.length, opportunities: created }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
