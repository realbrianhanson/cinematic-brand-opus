// Pillar page generator. Builds a comprehensive "AI training for {niche}" pillar
// using Perplexity + Firecrawl research, voice refinement, and the shared quality gate.
// Reuses the same research pipeline as generate-content.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";
import {
  loadVoiceConfig,
  formatVoiceBlock,
  refineWithVoice,
  scoreContent,
  composeTitle,
  writeMetaDescription,
} from "../_shared/voice.ts";
import { MAIN_MODEL as AI_MODEL } from "../_shared/models.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const AI_GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
const PERPLEXITY_API = "https://api.perplexity.ai/chat/completions";
const FIRECRAWL_API = "https://api.firecrawl.dev/v1";

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/['']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

function extractJson(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  return (fenced ? fenced[1] : raw).trim();
}

function esc(s: unknown): string {
  if (s === null || s === undefined) return "";
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Convert refined content_json into HTML for storage in pillar_pages.content
function contentJsonToHtml(cj: any, niche: any, currentYear: number): string {
  const parts: string[] = [];
  if (cj.intro) {
    parts.push(`<div class="answer-block"><p><strong>The short version:</strong> ${esc(cj.intro)}</p></div>`);
  }
  if (cj.fastest_wins && Array.isArray(cj.fastest_wins) && cj.fastest_wins.length) {
    parts.push(`<h2>The fastest wins</h2><ul>`);
    for (const w of cj.fastest_wins) {
      const label = w?.title || w?.name || "";
      const desc = w?.description || w?.detail || "";
      parts.push(`<li>${label ? `<strong>${esc(label)}:</strong> ` : ""}${esc(desc)}</li>`);
    }
    parts.push(`</ul>`);
  }
  if (Array.isArray(cj.sections)) {
    for (const s of cj.sections) {
      const heading = s?.title || s?.heading || "";
      if (heading) parts.push(`<h2>${esc(heading)}</h2>`);
      if (s?.description) parts.push(`<p>${esc(s.description)}</p>`);
      const items: any[] = s?.items || s?.tools || s?.steps || [];
      if (items.length) {
        parts.push(`<ul>`);
        for (const it of items) {
          const label = it?.name || it?.tool_name || it?.title || it?.step || "";
          const desc = it?.description || it?.detail || it?.explanation || (typeof it === "string" ? it : "");
          parts.push(`<li>${label ? `<strong>${esc(label)}:</strong> ` : ""}${esc(desc)}</li>`);
        }
        parts.push(`</ul>`);
      }
    }
  }
  if (Array.isArray(cj.roadmap_30_day) && cj.roadmap_30_day.length) {
    parts.push(`<h2>A 30-day implementation roadmap</h2><ol>`);
    for (const step of cj.roadmap_30_day) {
      const label = step?.week || step?.day || step?.phase || step?.title || "";
      const desc = step?.description || step?.detail || "";
      parts.push(`<li>${label ? `<strong>${esc(label)}:</strong> ` : ""}${esc(desc)}</li>`);
    }
    parts.push(`</ol>`);
  }
  if (cj.costs_and_roi) {
    parts.push(`<h2>Costs and ROI expectations</h2><p>${esc(cj.costs_and_roi)}</p>`);
  }
  if (Array.isArray(cj.common_mistakes) && cj.common_mistakes.length) {
    parts.push(`<h2>Common mistakes</h2><ul>`);
    for (const m of cj.common_mistakes) {
      const label = m?.mistake || m?.title || "";
      const desc = m?.fix || m?.description || "";
      parts.push(`<li>${label ? `<strong>${esc(label)}:</strong> ` : ""}${esc(desc)}</li>`);
    }
    parts.push(`</ul>`);
  }
  if (cj?.expert_callout?.quote) {
    parts.push(
      `<aside class="expert-callout" style="border-left:3px solid #D4AF55;background:#fbf6e8;padding:1rem 1.25rem;margin:1.5rem 0"><p style="font-size:.75rem;letter-spacing:.15em;text-transform:uppercase;color:#8a6a1a;margin:0 0 .5rem">From the trenches</p><p style="font-style:italic;margin:0">${esc(cj.expert_callout.quote)}</p></aside>`,
    );
  }
  if (Array.isArray(cj.frequently_asked_questions) && cj.frequently_asked_questions.length) {
    parts.push(`<h2>Frequently asked questions</h2>`);
    for (const f of cj.frequently_asked_questions) {
      if (f?.question) {
        parts.push(`<h3>${esc(f.question)}</h3><p>${esc(f.answer || "")}</p>`);
      }
    }
  }
  if (cj.closing_note) {
    parts.push(`<p>${esc(cj.closing_note)}</p>`);
  }
  return parts.join("\n");
}

async function fetchSerp(headTerm: string): Promise<{ top_titles: string[]; paa: string[] } | null> {
  const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY");
  if (!FIRECRAWL_API_KEY) return null;
  try {
    const resp = await fetch(`${FIRECRAWL_API}/search`, {
      method: "POST",
      headers: { Authorization: `Bearer ${FIRECRAWL_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query: headTerm, limit: 10 }),
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    const results = data.data || [];
    const top_titles = results
      .slice(0, 10)
      .map((r: any) => String(r.title || "").trim())
      .filter(Boolean);
    const paaRaw = data.paa || data.peopleAlsoAsk || data.relatedQuestions || data.related_questions || [];
    const paa: string[] = Array.isArray(paaRaw)
      ? paaRaw
          .map((q: any) => (typeof q === "string" ? q : q?.question || q?.text || ""))
          .filter(Boolean)
          .slice(0, 10)
      : [];
    return { top_titles, paa };
  } catch {
    return null;
  }
}

async function researchPillar(
  targetKeyword: string,
  nicheName: string,
  currentYear: number,
): Promise<{ context: string; sources: { url: string; title?: string }[] }> {
  const PERPLEXITY_API_KEY = Deno.env.get("PERPLEXITY_API_KEY");
  const parts: string[] = [];
  const sources: { url: string; title?: string }[] = [];
  if (PERPLEXITY_API_KEY) {
    try {
      const query = `Provide a comprehensive ${currentYear} guide on "${targetKeyword}". Cover: where AI fits in ${nicheName} operations, marketing, sales, and customer service; current AI tool categories with specific product names actually used by ${nicheName} today (pricing where known); typical costs; realistic ROI expectations; common implementation mistakes; and a practical 30-day rollout. Only include tools and companies still active in ${currentYear}. Be specific, quantitative where possible, and cite sources.`;
      const resp = await fetch(PERPLEXITY_API, {
        method: "POST",
        headers: { Authorization: `Bearer ${PERPLEXITY_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "sonar-pro",
          messages: [
            {
              role: "system",
              content: `You are a research assistant specializing in current AI adoption. Return factual, verified information from ${currentYear} only. Include specific tool names, pricing, and dates.`,
            },
            { role: "user", content: query },
          ],
          search_recency_filter: "week",
        }),
      });
      if (resp.ok) {
        const data = await resp.json();
        const content = data.choices?.[0]?.message?.content || "";
        const citations = data.citations || [];
        if (content) parts.push(`LIVE RESEARCH (${currentYear}):\n${content}`);
        for (const c of citations.slice(0, 8)) {
          if (typeof c === "string" && c.startsWith("http")) sources.push({ url: c });
          else if (c && typeof c === "object" && typeof c.url === "string")
            sources.push({ url: c.url, title: c.title });
        }
      }
    } catch (e: any) {
      console.warn("Perplexity error:", e.message);
    }
  }
  const seen = new Set<string>();
  const dedupedSources = sources
    .filter((s) => {
      if (!s.url || seen.has(s.url)) return false;
      seen.add(s.url);
      return true;
    })
    .slice(0, 8);
  const context = parts.length
    ? `\n\n═══ VERIFIED REAL-TIME RESEARCH DATA (${currentYear}) ═══\n${parts.join("\n\n")}\n═══ END OF RESEARCH ═══`
    : "";
  return { context, sources: dedupedSources };
}

async function generatePillarForNiche(
  supabase: any,
  niche: any,
  apiKey: string,
  supabaseUrl: string,
  serviceRoleKey: string,
): Promise<{ success: boolean; pillar_id?: string; error?: string; score?: number }> {
  const ctx = (niche.context || {}) as Record<string, any>;
  const targetKeyword: string = (ctx.target_keyword || `AI training for ${niche.name}`).toString();
  const currentYear = new Date().getFullYear();

  // Title composition: "AI Training for Dentists: The Complete 2026 Guide"
  const kwCapped = targetKeyword
    .split(" ")
    .map((w) => (w.toLowerCase() === "ai" ? "AI" : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ")
    .replace(/\bAi\b/g, "AI")
    .replace(/\bA\.i\.\b/gi, "AI");
  const displayTitle = `${kwCapped}: The Complete ${currentYear} Guide`;
  const pageSlug = slugify(kwCapped);

  // Check duplicate
  const { data: existing } = await supabase.from("pillar_pages").select("id, slug").eq("slug", pageSlug).maybeSingle();
  if (existing) return { success: false, error: `Pillar already exists at slug ${pageSlug}` };

  // Research
  const [{ context: researchContext, sources }, serp] = await Promise.all([
    researchPillar(targetKeyword, niche.name, currentYear),
    fetchSerp(targetKeyword),
  ]);
  const paa: string[] = serp?.paa ?? [];

  // Load voice
  const voice = await loadVoiceConfig(supabase);
  const voiceBlock = formatVoiceBlock(voice);

  // Site settings (for expert POV fallback)
  const { data: siteSettings } = await supabase.from("site_settings").select("*").limit(1).maybeSingle();
  const expertPov: string =
    typeof niche.expert_pov === "string" && niche.expert_pov.trim()
      ? niche.expert_pov.trim()
      : typeof siteSettings?.default_expert_pov === "string"
        ? siteSettings.default_expert_pov.trim()
        : "";

  // Child pages we'll link to at close
  const { data: childPages } = await supabase
    .from("generated_pages")
    .select("title, slug, content_schemas(slug)")
    .eq("niche_id", niche.id)
    .eq("status", "published")
    .limit(10);
  const childLinks: { title: string; url: string }[] = (childPages ?? [])
    .filter((p: any) => p.content_schemas?.slug)
    .map((p: any) => ({ title: p.title, url: `/resources/${p.content_schemas.slug}/${p.slug}` }));

  const paaBlock = paa.length
    ? `\nPEOPLE ALSO ASK (seed FAQ from these first, then add 2 more original ones):\n${paa.map((q, i) => `${i + 1}. ${q}`).join("\n")}`
    : "";

  const povBlock = expertPov
    ? `\nFIRST-PERSON EXPERT POV (site owner — the ONLY source of first-person experience):\n"""\n${expertPov}\n"""\nAdd a field "expert_callout" with { "quote": string } — a 2-4 sentence paraphrase drawn ONLY from this text. If nothing fits, OMIT the field.`
    : "";

  const systemMessage = `You are a structured content engine producing a comprehensive pillar guide. Return ONLY valid JSON. No markdown fences, no preamble.

${voiceBlock}`;

  const userMessage = `Produce a comprehensive pillar guide on "${targetKeyword}" targeting ${ctx.audience || `${niche.name} business owners`}.

TARGET KEYWORD: ${targetKeyword}
NICHE: ${niche.name}
YEAR: ${currentYear}
AUDIENCE PAIN POINTS: ${ctx.pain_points || "N/A"}
AI OPPORTUNITIES: ${ctx.ai_opportunities || "N/A"}

${researchContext}
${paaBlock}
${povBlock}

REQUIRED JSON SHAPE:
{
  "intro": "string — 2-4 sentence direct answer: what AI training means for ${niche.name} and what fastest wins look like.",
  "fastest_wins": [ { "title": "short label", "description": "1-2 sentence practical win" } ], // 3-5 items
  "sections": [
    // Include AT LEAST these four sections, each with 4-6 items:
    // 1) "Where AI fits in ${niche.name} operations" (back office, scheduling, admin)
    // 2) "AI for marketing in ${niche.name}" (content, ads, SEO, local)
    // 3) "AI for sales and conversions in ${niche.name}" (lead capture, follow-up, chat)
    // 4) "Tool categories to know" — each item is a category (name) with 2-3 specific product names from research (in description)
    { "title": "section heading", "description": "short intro (optional)", "items": [ { "name": "label", "description": "concrete, specific, cites tool names from research where relevant" } ] }
  ],
  "roadmap_30_day": [ { "week": "Week 1", "description": "concrete actions" } ], // 4 items covering weeks 1-4
  "costs_and_roi": "string — 2-4 sentences on realistic monthly cost ranges and payback windows for ${niche.name}. Use specific dollar figures from research.",
  "common_mistakes": [ { "mistake": "short label", "fix": "1-2 sentence corrective" } ], // 3-5 items
  "frequently_asked_questions": [ { "question": "…", "answer": "specific, factual, 2-4 sentences" } ], // 5-7 items, seeded from PAA above
  "closing_note": "1-2 sentences pointing readers to the site's free AI training and to the child resource pages below.",
  "expert_callout": { "quote": "optional — only if grounded in POV text above" }
}

CONSTRAINTS:
- Target 2,500+ total rendered words across all fields combined.
- Reference specific AI tools by name (from research data only — do NOT invent tools).
- Every "sections" item description should be concrete and useful, not generic.
- Never mention: Air.ai, Jasper, Copy.ai, Writesonic, Rytr, Article Forge, WordAI, Kafkai unless the research explicitly confirms them as active in ${currentYear}.
- Follow all voice rules above.

Return ONLY the JSON object.`;

  let contentJson: any = null;
  let tokensUsed = 0;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const aiResp = await fetch(AI_GATEWAY, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: AI_MODEL,
          messages: [
            { role: "system", content: systemMessage },
            {
              role: "user",
              content: attempt === 0 ? userMessage : userMessage + "\n\nCRITICAL: Return ONLY valid JSON.",
            },
          ],
          temperature: 0.7,
          max_tokens: 12000,
        }),
      });
      if (!aiResp.ok) {
        console.error("AI gateway:", aiResp.status, await aiResp.text());
        continue;
      }
      const aiData = await aiResp.json();
      tokensUsed += aiData.usage?.total_tokens || 0;
      const raw = aiData.choices?.[0]?.message?.content || "";
      contentJson = JSON.parse(extractJson(raw));
      break;
    } catch (e: any) {
      console.warn("AI parse:", e.message);
    }
  }
  if (!contentJson) return { success: false, error: "AI generation failed" };

  // Voice refine + lint
  try {
    const refined = await refineWithVoice({
      apiKey,
      model: AI_MODEL,
      voice,
      researchContext,
      draftJson: contentJson,
      schemaHint: `pillar guide content_json for "${targetKeyword}"`,
    });
    contentJson = refined.refined;
  } catch (e: any) {
    console.warn("Refine failed:", e.message);
  }

  // Score
  const { score, issues } = scoreContent(
    {
      ...contentJson,
      intro: contentJson.intro || "",
      sections: contentJson.sections || [],
      frequently_asked_questions: contentJson.frequently_asked_questions || [],
      pro_tips: contentJson.fastest_wins || [],
    },
    displayTitle,
  );
  console.log(`Pillar "${displayTitle}" score: ${score}/100. Issues:`, issues);

  // Compose meta
  const siteName = siteSettings?.publisher_name || siteSettings?.site_name || "";
  const metaTitle = composeTitle(displayTitle, siteName);
  const fallbackDesc = `${targetKeyword}: what it means, where AI fits in ${niche.name} operations, marketing, and sales, plus a 30-day rollout, costs, and common mistakes.`;
  const metaDesc = await writeMetaDescription({
    apiKey,
    model: AI_MODEL,
    voice,
    contentJson,
    primaryKeyword: targetKeyword,
    angle: displayTitle,
    niche: niche.name,
    fallback: fallbackDesc,
  }).catch(() => fallbackDesc);

  // Build HTML for storage. Append child links + sources block.
  let html = contentJsonToHtml(contentJson, niche, currentYear);
  if (childLinks.length) {
    html += `\n<h2>Resources for ${esc(niche.name)}</h2><ul>`;
    for (const l of childLinks) html += `<li><a href="${esc(l.url)}">${esc(l.title)}</a></li>`;
    html += `</ul>`;
  }
  if (sources.length) {
    html += `\n<h2>Sources</h2><ul>`;
    for (const s of sources)
      html += `<li><a href="${esc(s.url)}" rel="noopener" target="_blank">${esc(s.title || s.url)}</a></li>`;
    html += `</ul>`;
  }

  const faqs = Array.isArray(contentJson.frequently_asked_questions) ? contentJson.frequently_asked_questions : [];
  const seoMeta = {
    title: metaTitle,
    description: metaDesc,
    meta_title: metaTitle,
    meta_description: metaDesc,
    keywords: [targetKeyword, `${niche.name} ai`, "ai training"],
    og_image: null,
    faqs,
    sources,
  };

  const shouldPublish = score >= 75;

  const { data: saved, error: saveErr } = await supabase
    .from("pillar_pages")
    .insert({
      niche_id: niche.id,
      slug: pageSlug,
      title: displayTitle,
      content: html,
      seo_meta: seoMeta,
      status: shouldPublish ? "published" : "draft",
      published_at: shouldPublish ? new Date().toISOString() : null,
    })
    .select("id, slug, status")
    .single();

  if (saveErr) return { success: false, error: `DB save: ${saveErr.message}` };

  // Post-publish: silo links + og image
  if (shouldPublish) {
    fetch(`${supabaseUrl}/functions/v1/build-silo-links`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceRoleKey}` },
      body: JSON.stringify({ rebuild_all: true }),
    }).catch((e) => console.warn("silo build fail:", e.message));

    // OG image (pillar_pages og_image is stored inside seo_meta; the generate-og-image
    // function handles generated_pages/posts, so we generate a PNG ourselves via
    // invoking it with a synthetic call would fail. Keep pillar OG at site default for now.)
  }

  return { success: true, pillar_id: saved.id, score };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY)
    return new Response(JSON.stringify({ error: "LOVABLE_API_KEY missing" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  const bearer = authHeader.slice(7).trim();
  const isInternal = bearer === SUPABASE_SERVICE_ROLE_KEY;
  const anonClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  if (!isInternal) {
    const {
      data: { user },
      error: userErr,
    } = await anonClient.auth.getUser();
    if (userErr || !user)
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    const { data: roleRow } = await anonClient
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleRow)
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    const body = await req.json();
    const { niche_id, all_missing } = body as { niche_id?: string; all_missing?: boolean };

    if (all_missing) {
      const { data: niches } = await supabase.from("niches").select("*").eq("is_active", true);
      const { data: existing } = await supabase.from("pillar_pages").select("niche_id");
      const withPillar = new Set((existing ?? []).map((p: any) => p.niche_id).filter(Boolean));
      const targets = (niches ?? []).filter((n: any) => !withPillar.has(n.id));
      const results: any[] = [];
      for (const n of targets) {
        try {
          const r = await generatePillarForNiche(supabase, n, LOVABLE_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
          results.push({ niche: n.name, ...r });
        } catch (e: any) {
          results.push({ niche: n.name, success: false, error: e.message });
        }
      }
      return new Response(JSON.stringify({ success: true, results }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!niche_id)
      return new Response(JSON.stringify({ error: "Provide niche_id or all_missing:true" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

    const { data: niche } = await supabase.from("niches").select("*").eq("id", niche_id).maybeSingle();
    if (!niche)
      return new Response(JSON.stringify({ error: "Niche not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

    const result = await generatePillarForNiche(
      supabase,
      niche,
      LOVABLE_API_KEY,
      SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY,
    );
    return new Response(JSON.stringify(result), {
      status: result.success ? 200 : 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("generate-pillar error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
