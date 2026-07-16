// Drafts a full blog post from a content_opportunity, reusing the voice/lint/scoring
// pipeline. Injects the freshest matching expert_note. Runs originality + freshness gates.
// Result is saved as a DRAFT post linked to the opportunity (opportunity.status='queued').
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authorizeCronOrAdmin } from "../_shared/cronAuth.ts";
import { embedText, cosineSim } from "../_shared/embeddings.ts";
import { MAIN_MODEL } from "../_shared/models.ts";
import {
  loadVoiceConfig,
  formatVoiceBlock,
  critiqueAndRevise,
  mechanicalFixViolations,
  lintJson,
  scorePost,
} from "../_shared/voice.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const ORIGINALITY_MAX_SIM = 0.82;
const FRESHNESS_MAX_HOURS = 96;

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const auth = await authorizeCronOrAdmin(req, corsHeaders);
  if (auth instanceof Response) return auth;

  const { opportunity_id } = await req.json().catch(() => ({}));
  if (!opportunity_id) {
    return new Response(JSON.stringify({ error: "opportunity_id required" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const lovableKey = Deno.env.get("LOVABLE_API_KEY")!;

  const { data: opp, error: oppErr } = await supabase
    .from("content_opportunities")
    .select("*")
    .eq("id", opportunity_id)
    .single();
  if (oppErr || !opp) {
    return new Response(JSON.stringify({ error: "opportunity not found" }), {
      status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (opp.status === "queued" || opp.status === "published") {
    return new Response(JSON.stringify({ error: "already drafted" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const currentAttempts = (opp.attempts ?? 0) + 1;
  await supabase.from("content_opportunities").update({
    status: "drafting",
    attempts: currentAttempts,
    last_attempt_at: new Date().toISOString(),
  }).eq("id", opportunity_id);

  const failOpp = async (reason: string, terminal: boolean) => {
    await supabase.from("content_opportunities").update({
      status: terminal ? "rejected" : "proposed",
      last_error: reason.slice(0, 500),
      reject_reason: terminal ? reason.slice(0, 500) : null,
    }).eq("id", opportunity_id);
  };
  const MAX_ATTEMPTS = 3;

  const sources = (opp.brief?.sources || []) as Array<{ url: string; title?: string }>;

  // Freshest matching expert note (last 14 days, lane match preferred)
  const { data: notes } = await supabase
    .from("expert_notes")
    .select("id, note, topic_hint")
    .eq("archived", false)
    .gte("created_at", new Date(Date.now() - 14 * 24 * 3600 * 1000).toISOString())
    .order("created_at", { ascending: false })
    .limit(20);
  const matchedNote = (notes || []).find(
    (n) => !n.topic_hint || n.topic_hint === opp.topic_lane || opp.angle.toLowerCase().includes((n.topic_hint || "").toLowerCase()),
  ) || (notes || [])[0];

  const voice = await loadVoiceConfig(supabase);
  const voiceBlock = formatVoiceBlock(voice);

  const systemPrompt = `You are Brian Hanson writing a first-person analysis post.

${voiceBlock}

Structure:
- Open with a concrete hook tied to the news (no "In today's fast-paced world" type openings).
- Explain what happened in 2-3 sentences with citations.
- Give Brian's take: what it means for small-business owners specifically.
- 3-5 practical actions the reader can take this week.
- Close with what to watch next.

Rules:
- 900-1400 words.
- First person ("I", "I'd").
- Cite sources as markdown links inside sentences, using the URLs provided.
- No generic AI-recap tone. No hedging. No em dashes.
- If Brian's Note is provided, weave it in naturally as a "From the trenches" callout paragraph.
- Every numeric claim must come from one of the provided source URLs.

Return JSON ONLY:
{
  "title": "...",
  "content": "full HTML with <h2>, <h3>, <p>, <ul>, <a href=...> etc.",
  "excerpt": "1-2 sentences",
  "tldr": "20-60 words",
  "key_takeaways": ["...", "...", "...", "...", "..."],
  "faq_items": [{"question": "...", "answer": "..."}, ... 3-5 items],
  "meta_title": "under 60 chars",
  "meta_description": "under 160 chars",
  "keywords": "kw1, kw2, kw3, kw4, kw5",
  "featured_image_alt": "6-14 words, no 'image of'"
}`;

  const briefBlock = `Angle: ${opp.angle}
Target keyword: ${opp.target_keyword}
Format: ${opp.brief?.format || "news_analysis"}
Why Brian's audience cares: ${opp.rationale}
What's missing elsewhere: ${opp.gap_reason}

Sources (use these URLs as citations):
${sources.map((s) => `- ${s.title || "(untitled)"} — ${s.url}`).join("\n")}

${matchedNote ? `Brian's Note (weave into a "From the trenches" callout):\n"${matchedNote.note}"` : "No fresh personal note. Keep the callout general but concrete."}`;

  const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${lovableKey}` },
    body: JSON.stringify({
      model: MAIN_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: briefBlock },
      ],
      temperature: 0.75,
      max_tokens: 24000,
    }),
  });
  if (!aiRes.ok) {
    const t = await aiRes.text();
    await supabase.from("content_opportunities").update({
      status: "rejected", reject_reason: `draft LLM failed: ${aiRes.status}`,
    }).eq("id", opportunity_id);
    return new Response(JSON.stringify({ error: "draft failed", details: t }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const aiData = await aiRes.json();
  let raw = aiData?.choices?.[0]?.message?.content || "";
  raw = raw.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();
  const s = raw.indexOf("{"), e = raw.lastIndexOf("}");
  if (s !== -1 && e > s) raw = raw.slice(s, e + 1);
  let draft: any;
  try { draft = JSON.parse(raw); } catch {
    await supabase.from("content_opportunities").update({
      status: "rejected", reject_reason: "unparseable draft JSON",
    }).eq("id", opportunity_id);
    return new Response(JSON.stringify({ error: "unparseable JSON" }), { status: 500, headers: corsHeaders });
  }

  // Voice critique + lint fix
  try {
    const revised = await critiqueAndRevise({
      apiKey: lovableKey, model: MAIN_MODEL, voiceBlock,
      researchContext: briefBlock, draftJson: draft,
      schemaHint: "blog post fields (title, content HTML, excerpt, tldr, key_takeaways, faq_items, meta_title, meta_description, keywords, featured_image_alt)",
      maxTokens: 16000,
    });
    if (!revised.error) draft = { ...draft, ...revised.revised };
    const violations = lintJson(draft, voice.banned_phrases);
    if (violations.length) {
      const fixed = await mechanicalFixViolations({
        apiKey: lovableKey, model: MAIN_MODEL, draftJson: draft, violations,
        bannedPhrases: voice.banned_phrases, schemaHint: "same blog post schema",
      });
      if (!fixed.error) draft = { ...draft, ...fixed.revised };
    }
  } catch (err: any) {
    console.warn("critique/lint threw", err?.message);
  }

  const lintFlags = lintJson(draft, voice.banned_phrases);
  const { score: quality_score } = scorePost({
    title: draft.title, content: draft.content, faq_items: draft.faq_items,
    key_takeaways: draft.key_takeaways, tldr: draft.tldr, excerpt: draft.excerpt,
  });

  // Originality: embed the draft, compare against source excerpts and recent posts
  const draftText = `${draft.title}\n${(draft.content || "").replace(/<[^>]+>/g, " ").slice(0, 6000)}`;
  const draftVec = await embedText(draftText, lovableKey);
  let maxSim = 0;
  if (draftVec) {
    const { data: srcRows } = await supabase
      .from("source_items")
      .select("embedding")
      .in("id", opp.source_item_ids || []);
    for (const r of srcRows || []) {
      const v = typeof r.embedding === "string" ? JSON.parse(r.embedding) : r.embedding;
      if (Array.isArray(v)) maxSim = Math.max(maxSim, cosineSim(draftVec, v));
    }
  }
  const originality_score = Math.round((1 - maxSim) * 100);

  // Freshness: hours since newest source
  const { data: srcMeta } = await supabase
    .from("source_items")
    .select("published_at")
    .in("id", opp.source_item_ids || []);
  const newest = Math.max(...(srcMeta || []).map((r) => r.published_at ? new Date(r.published_at).getTime() : 0));
  const freshness_hours = newest ? Math.round((Date.now() - newest) / 3600_000) : 999;

  // Hard gates
  if (freshness_hours > FRESHNESS_MAX_HOURS && opp.brief?.evergreen !== true) {
    await supabase.from("content_opportunities").update({
      status: "rejected",
      reject_reason: `sources too old (${freshness_hours}h > ${FRESHNESS_MAX_HOURS}h)`,
    }).eq("id", opportunity_id);
    return new Response(JSON.stringify({ error: "rejected: freshness", freshness_hours }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (maxSim > ORIGINALITY_MAX_SIM) {
    await supabase.from("content_opportunities").update({
      status: "rejected",
      reject_reason: `originality too low (max similarity ${maxSim.toFixed(2)})`,
    }).eq("id", opportunity_id);
    return new Response(JSON.stringify({ error: "rejected: originality", maxSim }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (quality_score < 75) {
    await supabase.from("content_opportunities").update({
      status: "rejected",
      reject_reason: `quality below 75 (${quality_score})`,
    }).eq("id", opportunity_id);
    return new Response(JSON.stringify({ error: "rejected: quality", quality_score }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Insert as draft post
  const baseSlug = slugify(draft.title || opp.target_keyword || "brian-post");
  let slug = baseSlug;
  const { data: slugTaken } = await supabase.from("posts").select("id").eq("slug", slug).maybeSingle();
  if (slugTaken) slug = `${baseSlug}-${Date.now().toString(36).slice(-4)}`;

  const { data: post, error: postErr } = await supabase.from("posts").insert({
    title: draft.title,
    slug,
    content: draft.content,
    excerpt: draft.excerpt,
    tldr: draft.tldr,
    key_takeaways: draft.key_takeaways,
    faq_items: draft.faq_items,
    meta_title: draft.meta_title,
    meta_description: draft.meta_description,
    keywords: draft.keywords,
    featured_image_alt: draft.featured_image_alt,
    status: "draft",
    quality_score,
    lint_flags: lintFlags,
    opportunity_id,
    source_citations: sources,
    originality_score,
    freshness_hours,
  }).select().single();

  if (postErr) {
    await supabase.from("content_opportunities").update({
      status: "rejected", reject_reason: `post insert failed: ${postErr.message}`,
    }).eq("id", opportunity_id);
    return new Response(JSON.stringify({ error: postErr.message }), { status: 500, headers: corsHeaders });
  }

  await supabase.from("content_opportunities").update({ status: "queued" }).eq("id", opportunity_id);
  if (matchedNote) {
    await supabase.from("expert_notes").update({ used_in_post_id: post.id }).eq("id", matchedNote.id);
  }

  return new Response(JSON.stringify({
    ok: true, post_id: post.id, slug, quality_score, originality_score, freshness_hours,
    used_note: !!matchedNote,
  }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
