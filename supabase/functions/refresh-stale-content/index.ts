import { createClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";
import {
  loadVoiceConfig,
  formatVoiceBlock,
  refineWithVoice,
  scoreContent,
} from "../_shared/voice.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const AI_GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
const AI_MODEL = "google/gemini-3-flash-preview";
const PERPLEXITY_API = "https://api.perplexity.ai/chat/completions";
const FIRECRAWL_API = "https://api.firecrawl.dev/v1";

function extractJson(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  return (fenced ? fenced[1] : raw).trim();
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function researchTopic(nicheName: string, schemaName: string, audience: string, currentYear: number): Promise<{ context: string; hasResearch: boolean }> {
  const PERPLEXITY_API_KEY = Deno.env.get("PERPLEXITY_API_KEY");
  const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY");
  const researchParts: string[] = [];

  if (PERPLEXITY_API_KEY) {
    try {
      const query = `What are the most actively used and well-reviewed ${schemaName.toLowerCase()} for ${nicheName} in ${currentYear}? List ONLY tools and platforms that are currently popular, actively maintained, and have recent user reviews or updates. Include specific names, pricing, and what makes each one stand out. Exclude any tools that have shut down, pivoted away from this space, or lost significant market share. Focus on what ${audience} are actually adopting right now in ${currentYear}.`;
      const resp = await fetch(PERPLEXITY_API, {
        method: "POST",
        headers: { Authorization: `Bearer ${PERPLEXITY_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "sonar-pro",
          messages: [
            { role: "system", content: `You are a research assistant specializing in current technology trends. Return ONLY factual, verified information from ${currentYear}. Never mention tools that have shut down or are no longer actively maintained. Include specific names, numbers, pricing, and dates. No fluff.` },
            { role: "user", content: query },
          ],
          search_recency_filter: "week",
        }),
      });
      if (resp.ok) {
        const data = await resp.json();
        const content = data.choices?.[0]?.message?.content || "";
        const citations = data.citations || [];
        if (content) {
          researchParts.push(`LIVE RESEARCH (sourced ${currentYear}):\n${content}`);
          if (citations.length > 0) researchParts.push(`Sources: ${citations.slice(0, 8).join(", ")}`);
        }
      } else { console.error("Perplexity failed:", resp.status); }
    } catch (e: any) { console.error("Perplexity error:", e.message); }
  }

  if (FIRECRAWL_API_KEY) {
    try {
      const searchResp = await fetch(`${FIRECRAWL_API}/search`, {
        method: "POST",
        headers: { Authorization: `Bearer ${FIRECRAWL_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ query: `best ${schemaName.toLowerCase()} ${nicheName} ${currentYear} review`, limit: 3, scrapeOptions: { formats: ["markdown"], onlyMainContent: true } }),
      });
      if (searchResp.ok) {
        const searchData = await searchResp.json();
        const results = searchData.data || [];
        if (results.length > 0) {
          const snippets = results.map((r: any) => `[${r.title || r.url}]: ${(r.markdown || "").slice(0, 600).trim()}`).join("\n\n");
          researchParts.push(`SCRAPED WEB CONTENT (${currentYear}):\n${snippets}`);
        }
      } else { console.error("Firecrawl failed:", searchResp.status); }
    } catch (e: any) { console.error("Firecrawl error:", e.message); }
  }

  if (researchParts.length === 0) {
    console.warn(`⚠️ No research data available for "${schemaName}" in "${nicheName}" — content will be conservative`);
    return { context: "", hasResearch: false };
  }
  return {
    context: `\n\n═══ VERIFIED REAL-TIME RESEARCH DATA (${currentYear}) ═══\nThe following is CURRENT, VERIFIED information from live web sources. This is your ONLY source of truth for tool/platform/company names.\nYou MUST ONLY reference tools, platforms, and companies that appear in this research data.\nDo NOT add any tools from your own training data. If a tool is not listed below, do NOT include it.\n\n${researchParts.join("\n\n")}\n\n═══ END OF RESEARCH DATA ═══`,
    hasResearch: true,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Auth: verify caller is admin
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const anonClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: userErr } = await anonClient.auth.getUser();
  if (userErr || !user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const { data: roleRow } = await anonClient
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .eq("role", "admin")
    .maybeSingle();
  if (!roleRow) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) {
    return new Response(
      JSON.stringify({ error: "LOVABLE_API_KEY not configured" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    const body = await req.json();
    const { page_ids, all_stale = false } = body;
    const batch_id = crypto.randomUUID();

    let pagesToRefresh: any[] = [];
    if (all_stale) {
      const { data, error } = await supabase
        .from("generated_pages")
        .select("*, niches!generated_pages_niche_id_fkey(id, name, slug, context), content_schemas(id, name, slug, schema_definition, title_template, description_template, items_per_section)")
        .eq("performance_trend", "needs_refresh")
        .eq("status", "published");
      if (error) throw new Error(`Query failed: ${error.message}`);
      pagesToRefresh = data || [];
    } else if (Array.isArray(page_ids) && page_ids.length > 0) {
      const { data, error } = await supabase
        .from("generated_pages")
        .select("*, niches!generated_pages_niche_id_fkey(id, name, slug, context), content_schemas(id, name, slug, schema_definition, title_template, description_template, items_per_section)")
        .in("id", page_ids);
      if (error) throw new Error(`Query failed: ${error.message}`);
      pagesToRefresh = data || [];
    } else {
      return new Response(
        JSON.stringify({ error: "Provide page_ids array or all_stale: true" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (pagesToRefresh.length === 0) {
      return new Response(
        JSON.stringify({ refreshed: 0, message: "No pages to refresh." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: siteSettings } = await supabase
      .from("site_settings")
      .select("*")
      .limit(1)
      .single();

    const currentYear = new Date().getFullYear();

    // Load per-site voice once for this batch
    const voice = await loadVoiceConfig(supabase);
    const voiceBlock = formatVoiceBlock(voice);

    const summary = {
      batch_id,
      refreshed: 0,
      failed: 0,
      pages: [] as { id: string; title: string; slug: string }[],
    };

    for (const page of pagesToRefresh) {
      const startTime = Date.now();
      const niche = page.niches;
      const schema = page.content_schemas;

      if (!niche || !schema) {
        summary.failed++;
        await logGeneration(supabase, {
          batch_id,
          generated_page_id: page.id,
          status: "failed",
          error_message: "Missing niche or schema reference",
          tokens_used: 0,
          cost: 0,
          duration_ms: Date.now() - startTime,
        });
        continue;
      }

      const ctx = (niche.context || {}) as Record<string, any>;

      let title = page.title;
      const yearRegex = /\b(20\d{2})\b/;
      const yearMatch = title.match(yearRegex);
      const titleChanged = yearMatch && Number(yearMatch[1]) !== currentYear;
      if (titleChanged) {
        title = title.replace(yearRegex, String(currentYear));
      }

      // Research phase: gather real-time data
      const { context: researchContext, hasResearch } = await researchTopic(niche.name, schema.name, ctx.audience || "general", currentYear);

      const researchConstraints = hasResearch
        ? `- CRITICAL: ONLY use tools, platforms, and companies that are EXPLICITLY mentioned in the VERIFIED REAL-TIME RESEARCH DATA above. Do NOT supplement with your own knowledge or training data.
- If the research data doesn't provide enough items to fill a section, use FEWER items rather than inventing tools from your training data.
- Every tool/platform you mention MUST appear in the research data above.`
        : `- ⚠️ No real-time research was available. Be EXTREMELY conservative.
- ONLY mention tools you are 100% certain still exist and are actively maintained in ${currentYear}.
- Prefer fewer, verified items over a full list of potentially outdated ones.`;

      const blocklist = `- NEVER mention these known defunct/outdated tools: Air.ai, Jasper, Copy.ai, Writesonic, Rytr, Article Forge, WordAI, Kafkai, or any tool you are not 100% certain is actively operating in ${currentYear}.`;

      const systemMessage = `You are a structured content engine. Return ONLY valid JSON matching the exact schema provided. No markdown fences, no explanations, no preamble. Every field is required. Follow all constraints exactly.

${voiceBlock}`;

      const userMessage = `NICHE CONTEXT:
Name: ${niche.name}
Audience: ${ctx.audience || "general"}
Pain Points: ${ctx.pain_points || "N/A"}
Monetization: ${ctx.monetization || "N/A"}
Content That Works: ${ctx.content_that_works || "N/A"}
Subtopics: ${Array.isArray(ctx.subtopics) ? ctx.subtopics.join(", ") : ctx.subtopics || "N/A"}
AI Opportunities: ${ctx.ai_opportunities || "N/A"}
${researchContext}

CONTENT SCHEMA:
${JSON.stringify(schema.schema_definition, null, 2)}

CONSTRAINTS:
- Each section MUST contain exactly ${schema.items_per_section || 15} items (or fewer if research data doesn't support that many verified items)
- Difficulty/priority enums must match the schema exactly
- All descriptions must be specific to the ${niche.name} niche
- Reference specific tools, platforms, and strategies used by ${ctx.audience || "the target audience"}
- Use the language and terminology this audience actually uses
- Pro tips must be non-obvious and actionable
- The intro field must directly answer the implied search query in 2-3 factual, self-contained sentences
- Include specific numbers, percentages, or timeframes where possible
- Do NOT produce generic content that could apply to any niche
${researchConstraints}
${blocklist}
- Generate a frequently_asked_questions array with exactly 5 items, each with question and answer fields
- This is a REFRESH of existing content — make it fresh with updated information for ${currentYear}

TITLE (pre-generated, include in output as-is):
${title}

Generate the content now. Return ONLY the JSON object.`;

      let contentJson: any = null;
      let tokensUsed = 0;
      let aiError: string | null = null;

      for (let attempt = 0; attempt < 2; attempt++) {
        const promptMessages = [
          { role: "system", content: systemMessage },
          {
            role: "user",
            content:
              attempt === 0
                ? userMessage
                : userMessage +
                  "\n\nCRITICAL: Your previous response was not valid JSON. Return ONLY a JSON object with no other text.",
          },
        ];

        try {
          const aiResp = await fetch(AI_GATEWAY, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${LOVABLE_API_KEY}`,
            },
            body: JSON.stringify({
              model: AI_MODEL,
              messages: promptMessages,
              temperature: 0.7,
              max_tokens: 8192,
            }),
          });

          if (!aiResp.ok) {
            const errText = await aiResp.text();
            aiError = `AI gateway ${aiResp.status}: ${errText}`;
            console.error(aiError);
            if (aiResp.status === 429 || aiResp.status === 402) break;
            continue;
          }

          const aiData = await aiResp.json();
          tokensUsed = aiData.usage?.total_tokens || 0;
          const raw = aiData.choices?.[0]?.message?.content || "";
          const jsonStr = extractJson(raw);
          contentJson = JSON.parse(jsonStr);
          aiError = null;
          break;
        } catch (parseErr: any) {
          aiError = `JSON parse failed: ${parseErr.message}`;
          console.error(`Attempt ${attempt + 1} failed:`, aiError);
        }
      }

      if (!contentJson) {
        summary.failed++;
        await logGeneration(supabase, {
          batch_id,
          generated_page_id: page.id,
          status: "failed",
          error_message: aiError || "Unknown error",
          tokens_used: tokensUsed,
          cost: 0,
          duration_ms: Date.now() - startTime,
        });
        await delay(1000);
        continue;
      }

      // Critique + revise pass + lint + mechanical fix
      let lintFlags: any[] = [];
      try {
        const refined = await refineWithVoice({
          apiKey: LOVABLE_API_KEY, model: AI_MODEL, voice, researchContext,
          draftJson: contentJson,
          schemaHint: `refreshed listicle content_json for ${schema.name}`,
        });
        tokensUsed += refined.tokensUsed;
        contentJson = refined.refined;
        lintFlags = refined.remainingViolations;
        if (refined.errors.length) console.warn(`Refine warnings for ${page.slug}:`, refined.errors.join(" | "));
      } catch (e: any) {
        console.error(`Refine threw for ${page.slug}:`, e.message);
      }

      // Auto-score final content
      const { score: qualityScore } = scoreContent(contentJson, title);

      let seoMeta = page.seo_meta || {};
      if (titleChanged && siteSettings) {
        const siteName = siteSettings.publisher_name || siteSettings.site_name || "";
        const fullT = siteName ? `${title} | ${siteName}` : title;
        seoMeta = { ...seoMeta, title: fullT.length <= 65 ? fullT : title };
      }

      const { error: updateErr } = await supabase
        .from("generated_pages")
        .update({
          title,
          content_json: contentJson,
          seo_meta: seoMeta,
          quality_score: qualityScore,
          lint_flags: lintFlags,
          last_refreshed: new Date().toISOString(),
          refresh_count: (page.refresh_count || 0) + 1,
          performance_trend: "stable",
        })
        .eq("id", page.id);

      if (updateErr) {
        summary.failed++;
        await logGeneration(supabase, {
          batch_id,
          generated_page_id: page.id,
          status: "failed",
          error_message: `DB update: ${updateErr.message}`,
          tokens_used: tokensUsed,
          cost: 0,
          duration_ms: Date.now() - startTime,
        });
        await delay(1000);
        continue;
      }

      await logGeneration(supabase, {
        batch_id,
        generated_page_id: page.id,
        status: "refreshed",
        error_message: null,
        tokens_used: tokensUsed,
        cost: 0,
        duration_ms: Date.now() - startTime,
      });

      summary.refreshed++;
      summary.pages.push({ id: page.id, title, slug: page.slug });

      await delay(1000);
    }

    return new Response(JSON.stringify(summary), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("refresh-stale-content error:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

async function logGeneration(
  supabase: any,
  log: {
    batch_id: string;
    generated_page_id: string | null;
    status: string;
    error_message: string | null;
    tokens_used: number;
    cost: number;
    duration_ms: number;
  }
) {
  try {
    await supabase.from("generation_logs").insert(log);
  } catch (e: any) {
    console.error("Failed to write generation log:", e.message);
  }
}
