// Reads 'new' source_items, clusters near-duplicates via embedding cosine,
// asks Gemini to propose 1-2 Brian-aligned angles, saves as content_opportunities.
//
// Cost controls:
// - The LLM is called only when a source item arrived since the newest item an
//   earlier run already showed it ({ force: true } overrides for manual runs).
// - Items shown but not picked are marked 'considered' and never re-sent.
// - A gateway 402 returns HTTP 402 with stopped_reason 'ai_credits_exhausted'
//   so daily-content-run stops the whole run.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authorizeCronOrAdmin } from "../_shared/cronAuth.ts";
import { cosineSim } from "../_shared/embeddings.ts";
import { MAIN_MODEL } from "../_shared/models.ts";
import { creditsExhaustedBody } from "../draft-from-opportunity/preflight.ts";
import {
  CONSIDERED_STATUS,
  hasItemsFetchedSince,
  unpickedItemIds,
} from "./selection.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const CLUSTER_THRESHOLD = 0.82;

interface SourceItem {
  id: string;
  fetched_at: string | null;
  url: string;
  title: string | null;
  raw_excerpt: string | null;
  topic_lane: string | null;
  published_at: string | null;
  embedding: number[] | null;
  engagement_score: number | null;
}

function parseVec(v: any): number[] | null {
  if (Array.isArray(v)) return v;
  if (typeof v === "string" && v.startsWith("[")) {
    try {
      return JSON.parse(v);
    } catch {
      return null;
    }
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });
  const auth = await authorizeCronOrAdmin(req, corsHeaders);
  if (auth instanceof Response) return auth;

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const lovableKey = Deno.env.get("LOVABLE_API_KEY")!;
  const body = await req.json().catch(() => ({}));
  const force = body?.force === true;

  // Pull unused items from last 72h
  const cutoff = new Date(Date.now() - 72 * 3600 * 1000).toISOString();
  const { data: itemsRaw, error } = await supabase
    .from("source_items")
    .select(
      "id, url, title, raw_excerpt, topic_lane, published_at, fetched_at, embedding, engagement_score",
    )
    .eq("pipeline_status", "new")
    .gte("published_at", cutoff)
    .not("published_at", "is", null)
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(60);
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: corsHeaders,
    });
  }

  const items: SourceItem[] = (itemsRaw || []).map((r: any) => ({
    ...r,
    embedding: parseVec(r.embedding),
  }));
  if (items.length === 0) {
    return new Response(
      JSON.stringify({ ok: true, clusters: 0, message: "no fresh items" }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  // Skip the LLM when nothing arrived since an earlier run last showed it
  // candidates: it would only re-rank the same leftovers.
  const { data: lastSeenRows, error: lastSeenError } = await supabase
    .from("source_items")
    .select("fetched_at")
    .in("pipeline_status", ["used", CONSIDERED_STATUS])
    .order("fetched_at", { ascending: false })
    .limit(1);
  if (lastSeenError) {
    return new Response(
      JSON.stringify({
        error: `clustering history unavailable: ${lastSeenError.message}`,
      }),
      {
        status: 503,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
  const lastSeenAt = lastSeenRows?.[0]?.fetched_at ?? null;
  if (!force && !hasItemsFetchedSince(items, lastSeenAt)) {
    return new Response(
      JSON.stringify({
        ok: true,
        clusters: 0,
        created: 0,
        skipped: "no new source items since the last clustering run",
        pending_items: items.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // Cluster by cosine >= threshold; each item joins the first cluster it matches.
  const clusters: SourceItem[][] = [];
  for (const it of items) {
    if (!it.embedding) {
      clusters.push([it]);
      continue;
    }
    let placed = false;
    for (const c of clusters) {
      const rep = c[0];
      if (
        rep.embedding &&
        cosineSim(it.embedding, rep.embedding) >= CLUSTER_THRESHOLD
      ) {
        c.push(it);
        placed = true;
        break;
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
  const existingTitles = (existingPosts || [])
    .map((p: any) => p.title)
    .filter(Boolean);

  // Rank clusters by (size + recency + lane weight)
  const laneWeights: Record<string, number> = {
    ai_tools: 1.1,
    smb_marketing: 1.2,
    ai_training: 1.0,
    industry: 1.0,
  };
  const scored = clusters
    .map((c) => {
      const size = c.length;
      const newestTs = Math.max(
        ...c.map((i) =>
          i.published_at ? new Date(i.published_at).getTime() : 0,
        ),
      );
      const ageHours = newestTs ? (Date.now() - newestTs) / 3600_000 : 96;
      const recencyBoost = Math.max(0, 72 - ageHours) / 72; // 0..1
      const lane = c[0].topic_lane || "ai_tools";
      const weight = laneWeights[lane] || 1.0;
      const eng = Math.max(...c.map((i) => i.engagement_score || 0));
      const engBoost = Math.min(1, Math.log10(1 + eng) / 3);
      return {
        cluster: c,
        score: (size * 2 + recencyBoost * 3 + engBoost * 2) * weight,
        lane,
        ageHours,
      };
    })
    .sort((a, b) => b.score - a.score);

  // Take top 12 candidates → ask the LLM to pick up to 8 the author would write about
  const top = scored.slice(0, 12);
  const candidatePayload = top.map((s, i) => ({
    idx: i,
    topic_lane: s.lane,
    items: s.cluster.slice(0, 4).map((it) => ({
      title: it.title,
      url: it.url,
      excerpt: it.raw_excerpt?.slice(0, 300),
      engagement: it.engagement_score ?? 0,
    })),
  }));

  const { data: editorialIdentity, error: identityError } = await supabase
    .from("site_settings")
    .select("author_name,author_bio,site_name")
    .limit(1)
    .maybeSingle();
  if (identityError || !editorialIdentity?.author_name)
    return new Response(
      JSON.stringify({
        error: "Configure the site author before generating content",
      }),
      { status: 503, headers: corsHeaders },
    );
  const authorName = editorialIdentity.author_name;
  const authorContext =
    editorialIdentity.author_bio || editorialIdentity.site_name || "";

  const systemPrompt = `You are ${authorName}'s editorial strategist.

Author background and audience: ${authorContext}. Use only these supplied claims. Never invent credentials or personal experiences.

You will receive candidate news clusters from the last 72 hours. Pick UP TO 8 that the author should write about. REJECT clusters that:
- Duplicate a title the author has already covered in the last 60 posts
- Are pure model-release recaps with no relevance to the configured audience
- Are speculation/opinion pieces without concrete news
- Are older than ~3 days with no new development
Higher engagement means real people care about this topic right now; weight it accordingly.

For each chosen cluster, return:
- angle: the specific take the author would bring (1 sentence)
- target_keyword: the search phrase to rank for
- rationale: why this fits the configured audience (1 sentence)
- gap_reason: what's missing from what's already out there
- reader_question: one specific question this article answers
- search_intent: the reader task, not an invented search-volume estimate
- format: one of "news_analysis" | "how_to" | "comparison" | "worked_example" | "opinion" | "roundup"
Prefer a portfolio near 60% useful evergreen workflows, 25% comparisons or documented examples, 15% news analysis when the evidence supports it. This is editorial guidance, not a quota: choose fewer articles when evidence is weak. A news source may inspire an evergreen guide only when the actual workflow can be substantiated. Reject a superficial analogy between unrelated news and business outcomes. Avoid 'Stop...' headline formulas. If an existing article answers the same question, skip a new post; recommend updating it in the rationale instead.

Return JSON ONLY: { "picks": [{ idx, angle, target_keyword, rationale, gap_reason, reader_question, search_intent, format }] }
If none qualify, return { "picks": [] }.`;

  const userMsg = `Recent posts (avoid duplicating):\n${existingTitles
    .slice(0, 40)
    .map((t) => `- ${t}`)
    .join(
      "\n",
    )}\n\nCandidate clusters:\n${JSON.stringify(candidatePayload, null, 2)}`;

  const aiRes = await fetch(
    "https://ai.gateway.lovable.dev/v1/chat/completions",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${lovableKey}`,
      },
      body: JSON.stringify({
        model: MAIN_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMsg },
        ],
        temperature: 0.4,
      }),
    },
  );

  if (!aiRes.ok) {
    const t = await aiRes.text();
    console.error("cluster picks LLM failed", aiRes.status, t);
    if (aiRes.status === 402) {
      // Stop signal: candidates stay 'new' for the run after credits return.
      return new Response(JSON.stringify(creditsExhaustedBody(t)), {
        status: 402,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ error: "LLM failed", details: t }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const aiData = await aiRes.json();
  let raw = aiData?.choices?.[0]?.message?.content || "";
  raw = raw
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  const s = raw.indexOf("{"),
    e = raw.lastIndexOf("}");
  if (s !== -1 && e > s) raw = raw.slice(s, e + 1);
  let picks: any = { picks: [] };
  let picksParsed = false;
  try {
    picks = JSON.parse(raw);
    picksParsed = Array.isArray(picks?.picks);
  } catch {
    console.warn("bad pick JSON", raw.slice(0, 300));
  }

  const created: any[] = [];
  const pickedIdx = new Set<number>();
  for (const pick of picksParsed ? picks.picks : []) {
    const cluster = top[pick.idx]?.cluster;
    if (!cluster) continue;
    pickedIdx.add(pick.idx);
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
        brief: {
          format: pick.format,
          reader_question: pick.reader_question,
          search_intent: pick.search_intent,
          sources: cluster.map((c) => ({ url: c.url, title: c.title })),
        },
        status: "proposed",
      })
      .select()
      .single();
    if (oppErr) {
      console.warn("opp insert failed", oppErr.message);
      continue;
    }
    created.push(oppRow);
    // Mark used
    await supabase
      .from("source_items")
      .update({ pipeline_status: "used" })
      .in("id", ids);
  }

  // Retire what the LLM saw but did not choose, so the next run does not pay
  // to show it the same candidates again. Only after a readable answer: a
  // garbled response leaves them 'new' for another look.
  let retired = 0;
  if (picksParsed) {
    const unpicked = unpickedItemIds(
      top.map((t) => t.cluster),
      pickedIdx,
    );
    if (unpicked.length) {
      const { error: retireError } = await supabase
        .from("source_items")
        .update({ pipeline_status: CONSIDERED_STATUS })
        .in("id", unpicked)
        .eq("pipeline_status", "new");
      if (retireError)
        console.error("marking unpicked items failed", retireError.message);
      else retired = unpicked.length;
    }
  }

  return new Response(
    JSON.stringify({
      ok: true,
      clusters: clusters.length,
      considered: top.length,
      retired,
      created: created.length,
      opportunities: created,
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
