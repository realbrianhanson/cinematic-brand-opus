import { createClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";
import {
  loadVoiceConfig,
  formatVoiceBlock,
  refineWithVoice,
  scoreContent,
  composeTitle,
  composePageTitle,
  countContentItems,
  writeMetaDescription,
  type VoiceConfig,
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

// ─── Generate unique content angles via AI ───

async function generateUniqueAngles(
  nicheName: string,
  schemaName: string,
  count: number,
  existingTitles: string[],
  audience: string,
  apiKey: string,
): Promise<{ angle: string; keyword: string }[]> {
  const existingList = existingTitles.length > 0
    ? `\n\nEXISTING CONTENT (DO NOT REPEAT ANY OF THESE TOPICS):\n${existingTitles.map((t, i) => `${i + 1}. ${t}`).join("\n")}`
    : "";

  const prompt = `You are a content strategist. Generate exactly ${count} unique subtopic angles for "${schemaName}" content in the "${nicheName}" niche, targeting ${audience}.

Each angle should be a SPECIFIC subtopic or category within the broader "${schemaName} for ${nicheName}" theme. Think of distinct subcategories, use cases, audience segments, or functional areas.

Examples of good angles for "Tool Roundups" + "AI for Business":
- "AI Sales Automation Tools"
- "AI HR & Recruiting Tools"  
- "AI Financial Planning & Accounting Tools"
- "AI Customer Service & Chatbot Tools"
- "AI Marketing Analytics Tools"

BAD angles (too generic or overlapping):
- "Best AI Tools" (too broad)
- "Top AI Software" (same as above, just reworded)
${existingList}

Return a JSON array of objects with "angle" (the subtopic title phrase, 3-8 words) and "keyword" (the target SEO keyword, lowercase). Example:
[{"angle": "AI Sales Automation Tools", "keyword": "ai sales automation tools for business"}]

Return ONLY the JSON array. No other text.`;

  try {
    const resp = await fetch(AI_GATEWAY, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          { role: "system", content: "Return ONLY valid JSON. No markdown, no explanation." },
          { role: "user", content: prompt },
        ],
        temperature: 0.9,
        max_tokens: 2048,
      }),
    });

    if (!resp.ok) {
      console.error("Angle generation failed:", resp.status);
      return generateFallbackAngles(nicheName, schemaName, count);
    }

    const data = await resp.json();
    const raw = data.choices?.[0]?.message?.content || "";
    const parsed = JSON.parse(extractJson(raw));
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed.slice(0, count).map((a: any) => ({
        angle: a.angle || a.title || `${schemaName} for ${nicheName}`,
        keyword: (a.keyword || `${a.angle} ${nicheName}`).toLowerCase(),
      }));
    }
  } catch (e: any) {
    console.error("Angle generation error:", e.message);
  }

  return generateFallbackAngles(nicheName, schemaName, count);
}

function generateFallbackAngles(nicheName: string, schemaName: string, count: number): { angle: string; keyword: string }[] {
  const suffixes = ["Essentials", "Advanced Picks", "Budget-Friendly Options", "Enterprise Solutions", "For Beginners", "Pro Recommendations", "Hidden Gems", "Top Rated", "Trending Now", "Most Popular"];
  const angles: { angle: string; keyword: string }[] = [];
  for (let i = 0; i < count; i++) {
    const suffix = suffixes[i % suffixes.length];
    const angle = `${schemaName} ${suffix} for ${nicheName}`;
    angles.push({ angle, keyword: angle.toLowerCase() });
  }
  return angles;
}

// ─── Real-time research via Perplexity + Firecrawl ───

async function researchTopic(angle: string, nicheName: string, audience: string, currentYear: number): Promise<{ context: string; hasResearch: boolean; sources: { url: string; title?: string }[] }> {
  const PERPLEXITY_API_KEY = Deno.env.get("PERPLEXITY_API_KEY");
  const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY");
  const researchParts: string[] = [];
  const sources: { url: string; title?: string }[] = [];

  if (PERPLEXITY_API_KEY) {
    try {
      const query = `What are the most actively used and well-reviewed ${angle.toLowerCase()} in ${currentYear}? List ONLY tools and platforms that are currently popular, actively maintained, and have recent user reviews or updates. Include specific names, pricing, and what makes each one stand out. Exclude any tools that have shut down, pivoted away from this space, or lost significant market share. Focus on what ${audience} are actually adopting right now in ${currentYear}.`;
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
          researchParts.push(`LIVE RESEARCH (sourced ${currentYear}, grounded in web search):\n${content}`);
          if (citations.length > 0) researchParts.push(`Sources: ${citations.slice(0, 8).join(", ")}`);
        }
        for (const c of citations.slice(0, 8)) {
          if (typeof c === "string" && c.startsWith("http")) sources.push({ url: c });
          else if (c && typeof c === "object" && typeof c.url === "string") sources.push({ url: c.url, title: c.title });
        }
      } else {
        console.error("Perplexity research failed:", resp.status);
      }
    } catch (e: any) {
      console.error("Perplexity research error:", e.message);
    }
  }

  if (FIRECRAWL_API_KEY) {
    try {
      const searchResp = await fetch(`${FIRECRAWL_API}/search`, {
        method: "POST",
        headers: { Authorization: `Bearer ${FIRECRAWL_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          query: `best ${angle.toLowerCase()} ${currentYear} review`,
          limit: 3,
          scrapeOptions: { formats: ["markdown"], onlyMainContent: true },
        }),
      });
      if (searchResp.ok) {
        const searchData = await searchResp.json();
        const results = searchData.data || [];
        if (results.length > 0) {
          const snippets = results.map((r: any) => `[${r.title || r.url}]: ${(r.markdown || "").slice(0, 600).trim()}`).join("\n\n");
          researchParts.push(`SCRAPED WEB CONTENT (${currentYear}):\n${snippets}`);
          for (const r of results) {
            if (r?.url) sources.push({ url: r.url, title: r.title || undefined });
          }
        }
      } else {
        console.error("Firecrawl search failed:", searchResp.status);
      }
    } catch (e: any) {
      console.error("Firecrawl search error:", e.message);
    }
  }

  // De-dupe sources by URL, cap at 8
  const seen = new Set<string>();
  const dedupedSources = sources.filter((s) => {
    if (!s.url || seen.has(s.url)) return false;
    seen.add(s.url);
    return true;
  }).slice(0, 8);

  if (researchParts.length === 0) {
    console.warn(`⚠️ No research data available for "${angle}" in "${nicheName}" — content will be conservative`);
    return { context: "", hasResearch: false, sources: dedupedSources };
  }
  return {
    context: `\n\n═══ VERIFIED REAL-TIME RESEARCH DATA (${currentYear}) ═══\nThe following is CURRENT, VERIFIED information from live web sources. This is your ONLY source of truth for tool/platform/company names.\nYou MUST ONLY reference tools, platforms, and companies that appear in this research data.\nDo NOT add any tools from your own training data. If a tool is not listed below, do NOT include it.\n\n${researchParts.join("\n\n")}\n\n═══ END OF RESEARCH DATA ═══`,
    hasResearch: true,
    sources: dedupedSources,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
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

  // ─── AUTHENTICATION (must run BEFORE branching on any header flags) ───
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const bearer = authHeader.slice("Bearer ".length).trim();
  const isInternalInvocation = bearer === SUPABASE_SERVICE_ROLE_KEY;

  const isStepProcess = req.headers.get("x-job-step") === "true";
  const isSetupProcess = req.headers.get("x-job-setup") === "true";

  // Step/setup branches are ONLY for trusted self-invocations using the service role key.
  if ((isStepProcess || isSetupProcess) && !isInternalInvocation) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // ─── STEP PROCESSOR: handles ONE page then self-invokes for next ───
  if (isStepProcess) {
    try {
      await handleStepProcessing(req, supabase, LOVABLE_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } catch (err: any) {
      console.error("Step processing error:", err);
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  // ─── SETUP PROCESSOR: generates angles then kicks off step-by-step ───
  if (isSetupProcess) {
    try {
      await handleSetupProcessing(req, supabase, LOVABLE_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } catch (err: any) {
      console.error("Setup processing error:", err);
      try {
        const body = await req.clone().json().catch(() => ({}));
        if (body.job_id) {
          await supabase.from("generation_jobs").update({
            status: "failed",
            error_message: `Setup failed: ${err.message}`,
          }).eq("id", body.job_id);
        }
      } catch (_) {}
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  // ─── NORMAL REQUEST: verify admin user, create job, kick off setup ───
  const anonClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
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

  try {
    const body = await req.json();
    const {
      niche_slugs = ["all_active"],
      content_type_slugs,
      content_type_slug,
      count_per_combination = 1,
      dry_run = false,
      batch_id = crypto.randomUUID(),
    } = body;

    let resolvedSlugs: string[] = content_type_slugs
      ? (Array.isArray(content_type_slugs) ? content_type_slugs : [content_type_slugs])
      : (content_type_slug ? [content_type_slug] : ["all_active"]);

    // Resolve niches
    let nichesQuery = supabase.from("niches").select("*");
    if (Array.isArray(niche_slugs) && niche_slugs.length === 1 && niche_slugs[0] === "all_active") {
      nichesQuery = nichesQuery.eq("is_active", true);
    } else {
      nichesQuery = nichesQuery.in("slug", niche_slugs);
    }
    const { data: niches, error: nErr } = await nichesQuery;
    if (nErr) throw new Error(`Failed to fetch niches: ${nErr.message}`);
    if (!niches?.length) {
      return new Response(JSON.stringify({ error: "No niches found" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Resolve content schemas
    let schemasQuery = supabase.from("content_schemas").select("*");
    if (resolvedSlugs.length === 1 && resolvedSlugs[0] === "all_active") {
      schemasQuery = schemasQuery.eq("is_active", true);
    } else {
      schemasQuery = schemasQuery.in("slug", resolvedSlugs);
    }
    const { data: contentSchemas, error: csErr } = await schemasQuery;
    if (csErr) throw new Error(`Failed to fetch content_schemas: ${csErr.message}`);
    if (!contentSchemas?.length) {
      return new Response(JSON.stringify({ error: "No content schemas found" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (dry_run) {
      return await handleDryRun(supabase, niches, contentSchemas, LOVABLE_API_KEY, corsHeaders);
    }

    const totalCombinations = niches.length * contentSchemas.length * count_per_combination;

    const { data: job, error: jobErr } = await supabase
      .from("generation_jobs")
      .insert({
        batch_id,
        status: "pending",
        total_combinations: totalCombinations,
        request_payload: { niche_slugs, content_type_slugs: resolvedSlugs, count_per_combination },
      })
      .select("id")
      .single();

    if (jobErr) throw new Error(`Failed to create job: ${jobErr.message}`);

    // Fire-and-forget: kick off setup phase (generates angles, then starts step-by-step)
    const processUrl = `${SUPABASE_URL}/functions/v1/generate-content`;
    fetch(processUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        "x-job-setup": "true",
      },
      body: JSON.stringify({
        job_id: job.id,
        batch_id,
        niche_ids: niches.map((n: any) => n.id),
        schema_ids: contentSchemas.map((s: any) => s.id),
        count_per_combination,
      }),
    }).catch((e) => console.error("Failed to self-invoke setup:", e));

    return new Response(
      JSON.stringify({ job_id: job.id, batch_id, total_combinations: totalCombinations }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("generate-content error:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// ─── SETUP: generate all angles, build work queue, kick off first step ───

async function handleSetupProcessing(
  req: Request, supabase: any, apiKey: string, supabaseUrl: string, serviceRoleKey: string
) {
  const { job_id, batch_id, niche_ids, schema_ids, count_per_combination } = await req.json();

  await supabase.from("generation_jobs").update({ status: "running" }).eq("id", job_id);

  const { data: niches } = await supabase.from("niches").select("*").in("id", niche_ids);
  const { data: contentSchemas } = await supabase.from("content_schemas").select("*").in("id", schema_ids);

  // Build the full work queue: list of { niche, schema, angle, keyword } items
  const workQueue: { niche_id: string; schema_id: string; angle: string; keyword: string }[] = [];

  for (const niche of (niches || [])) {
    for (const schema of (contentSchemas || [])) {
      const ctx = (niche.context || {}) as Record<string, any>;

      // Fetch existing titles to avoid duplicates
      const { data: existingPages } = await supabase
        .from("generated_pages")
        .select("title")
        .eq("niche_id", niche.id)
        .eq("content_schema_id", schema.id);
      const existingTitles = (existingPages || []).map((p: any) => p.title);

      // Generate unique angles
      const angles = await generateUniqueAngles(
        niche.name, schema.name, count_per_combination,
        existingTitles, ctx.audience || "general", apiKey,
      );

      for (const { angle, keyword } of angles) {
        workQueue.push({ niche_id: niche.id, schema_id: schema.id, angle, keyword });
      }
    }
  }

  console.log(`Setup complete: ${workQueue.length} pages queued for job ${job_id}`);

  if (workQueue.length === 0) {
    await supabase.from("generation_jobs").update({
      status: "completed", completed_count: 0, success_count: 0, failed_count: 0, skipped_count: 0,
      result_summary: { pages: [], total_attempted: 0, success: 0, failed: 0, skipped_duplicates: 0 },
    }).eq("id", job_id);
    return;
  }

  // Kick off first step
  triggerNextStep(supabaseUrl, serviceRoleKey, {
    job_id, batch_id, work_queue: workQueue, current_index: 0,
    success_count: 0, failed_count: 0, skipped_count: 0, pages: [],
  });
}

// ─── STEP: process ONE page, then self-invoke for next ───

async function handleStepProcessing(
  req: Request, supabase: any, apiKey: string, supabaseUrl: string, serviceRoleKey: string
) {
  const {
    job_id, batch_id, work_queue, current_index,
    success_count: prevSuccess, failed_count: prevFailed,
    skipped_count: prevSkipped, pages: prevPages,
  } = await req.json();

  let successCount = prevSuccess;
  let failedCount = prevFailed;
  let skippedCount = prevSkipped;
  const pages = [...prevPages];
  const completedCount = current_index; // pages processed before this one

  const item = work_queue[current_index];
  if (!item) {
    // No more work — finalize
    await finalizeJob(supabase, job_id, pages, work_queue.length, successCount, failedCount, skippedCount);
    return;
  }

  const startTime = Date.now();

  // Fetch niche + schema details
  const { data: niche } = await supabase.from("niches").select("*").eq("id", item.niche_id).single();
  const { data: schema } = await supabase.from("content_schemas").select("*").eq("id", item.schema_id).single();
  const { data: siteSettings } = await supabase.from("site_settings").select("*").limit(1).single();

  if (!niche || !schema) {
    failedCount++;
    await updateJobProgress(supabase, job_id, completedCount + 1, successCount, failedCount, skippedCount);
    await logGeneration(supabase, { batch_id, generated_page_id: null, status: "failed", error_message: "Niche or schema not found", tokens_used: 0, cost: 0, duration_ms: Date.now() - startTime });
    triggerNextStep(supabaseUrl, serviceRoleKey, {
      job_id, batch_id, work_queue, current_index: current_index + 1,
      success_count: successCount, failed_count: failedCount, skipped_count: skippedCount, pages,
    });
    return;
  }

  const ctx = (niche.context || {}) as Record<string, any>;
  const currentYear = new Date().getFullYear();
  const estimatedCount = (schema.items_per_section || 15) * 3;
  const title = `${estimatedCount} Best ${item.angle} in ${currentYear}`;
  const pageSlug = slugify(title);

  // Check for duplicate slug
  const { data: existingSlug } = await supabase
    .from("generated_pages")
    .select("id")
    .eq("slug", pageSlug)
    .limit(1);

  if (existingSlug && existingSlug.length > 0) {
    skippedCount++;
    await updateJobProgress(supabase, job_id, completedCount + 1, successCount, failedCount, skippedCount);
    await logGeneration(supabase, { batch_id, generated_page_id: null, status: "duplicate_skipped", error_message: `Slug exists: ${pageSlug}`, tokens_used: 0, cost: 0, duration_ms: Date.now() - startTime });
    triggerNextStep(supabaseUrl, serviceRoleKey, {
      job_id, batch_id, work_queue, current_index: current_index + 1,
      success_count: successCount, failed_count: failedCount, skipped_count: skippedCount, pages,
    });
    return;
  }

  console.log(`[${current_index + 1}/${work_queue.length}] Generating: ${title}`);

  // Research phase
  const { context: researchContext, hasResearch } = await researchTopic(item.angle, niche.name, ctx.audience || "general", currentYear);

  // Load voice config (per-site, from site_settings)
  const voice = await loadVoiceConfig(supabase);
  const voiceBlock = formatVoiceBlock(voice);

  // AI generation
  const systemMessage = `You are a structured content engine. Return ONLY valid JSON matching the exact schema provided. No markdown fences, no explanations, no preamble. Every field is required. Follow all constraints exactly.

${voiceBlock}`;
  const userMessage = buildUserMessage(niche, schema, ctx, title, item.angle, currentYear, researchContext, hasResearch);

  let contentJson: any = null;
  let tokensUsed = 0;
  let aiError: string | null = null;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const aiResp = await fetch(AI_GATEWAY, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: AI_MODEL,
          messages: [
            { role: "system", content: systemMessage },
            { role: "user", content: attempt === 0 ? userMessage : userMessage + "\n\nCRITICAL: Your previous response was not valid JSON. Return ONLY a JSON object with no other text." },
          ],
          temperature: 0.7,
          max_tokens: 8192,
        }),
      });

      if (!aiResp.ok) {
        aiError = `AI gateway ${aiResp.status}: ${await aiResp.text()}`;
        if (aiResp.status === 429 || aiResp.status === 402) break;
        continue;
      }

      const aiData = await aiResp.json();
      tokensUsed = aiData.usage?.total_tokens || 0;
      const raw = aiData.choices?.[0]?.message?.content || "";
      contentJson = JSON.parse(extractJson(raw));
      aiError = null;
      break;
    } catch (parseErr: any) {
      aiError = `JSON parse failed: ${parseErr.message}`;
    }
  }

  if (!contentJson) {
    failedCount++;
    await updateJobProgress(supabase, job_id, completedCount + 1, successCount, failedCount, skippedCount);
    await logGeneration(supabase, { batch_id, generated_page_id: null, status: "failed", error_message: aiError || "Unknown error", tokens_used: tokensUsed, cost: 0, duration_ms: Date.now() - startTime });
    triggerNextStep(supabaseUrl, serviceRoleKey, {
      job_id, batch_id, work_queue, current_index: current_index + 1,
      success_count: successCount, failed_count: failedCount, skipped_count: skippedCount, pages,
    });
    return;
  }

  // Critique + revise pass (voice enforcement + filler removal + research grounding),
  // then lint + mechanical fix for any residual violations.
  let lintFlags: any[] = [];
  try {
    const refined = await refineWithVoice({
      apiKey, model: AI_MODEL, voice, researchContext,
      draftJson: contentJson,
      schemaHint: `listicle content_json for ${schema.name}`,
    });
    tokensUsed += refined.tokensUsed;
    contentJson = refined.refined;
    lintFlags = refined.remainingViolations;
    if (refined.errors.length) {
      console.warn(`Refine pass warnings for "${title}":`, refined.errors.join(" | "));
    }
    if (lintFlags.length) {
      console.warn(`${lintFlags.length} lint violations remain in "${title}" (stored as lint_flags)`);
    }
  } catch (e: any) {
    console.error(`Refine pass threw for "${title}":`, e.message);
  }

  // Auto-score the final content
  const { score: qualityScore, issues: qualityIssues } = scoreContent(contentJson, title);
  if (qualityIssues.length) {
    console.log(`Quality score for "${title}": ${qualityScore}/100 — issues:`, qualityIssues);
  }

  // Build SEO meta and save (title composed safely — never mid-word cut)
  const siteName = siteSettings?.publisher_name || siteSettings?.site_name || "";
  const fullMetaTitle = siteName ? `${title} | ${siteName}` : title;
  const metaTitle = fullMetaTitle.length <= 65 ? fullMetaTitle : title;
  const metaDesc = `Discover the best ${item.angle.toLowerCase()} curated for ${niche.name}. Updated ${currentYear} with real-time research.`.slice(0, 160);
  const seedKeywords = Array.isArray(ctx.keywords_seed) ? ctx.keywords_seed : [];
  const seoMeta = { title: metaTitle, description: metaDesc, keywords: [...seedKeywords, item.keyword, niche.name.toLowerCase()], og_image: null };

  const { data: savedPage, error: saveErr } = await supabase
    .from("generated_pages")
    .insert({
      niche_id: niche.id,
      content_schema_id: schema.id,
      slug: pageSlug,
      title,
      content_json: contentJson,
      seo_meta: seoMeta,
      schema_markup: {},
      status: "draft",
      quality_score: qualityScore,
      lint_flags: lintFlags,
      generation_model: AI_MODEL,
      generation_cost: 0,
    })
    .select("id, title, slug, status")
    .single();

  if (saveErr) {
    failedCount++;
    await updateJobProgress(supabase, job_id, completedCount + 1, successCount, failedCount, skippedCount);
    await logGeneration(supabase, { batch_id, generated_page_id: null, status: "failed", error_message: `DB save: ${saveErr.message}`, tokens_used: tokensUsed, cost: 0, duration_ms: Date.now() - startTime });
  } else {
    await supabase.from("keyword_assignments").insert({ page_id: savedPage.id, primary_keyword: item.keyword, secondary_keywords: seedKeywords.slice(0, 5) });
    await logGeneration(supabase, { batch_id, generated_page_id: savedPage.id, status: "success", error_message: null, tokens_used: tokensUsed, cost: 0, duration_ms: Date.now() - startTime });
    successCount++;
    pages.push(savedPage);
    await updateJobProgress(supabase, job_id, completedCount + 1, successCount, failedCount, skippedCount);
  }

  // Check if this was the last item
  if (current_index + 1 >= work_queue.length) {
    await finalizeJob(supabase, job_id, pages, work_queue.length, successCount, failedCount, skippedCount);
  } else {
    triggerNextStep(supabaseUrl, serviceRoleKey, {
      job_id, batch_id, work_queue, current_index: current_index + 1,
      success_count: successCount, failed_count: failedCount, skipped_count: skippedCount, pages,
    });
  }
}

// ─── Helpers ───

function triggerNextStep(supabaseUrl: string, serviceRoleKey: string, payload: any) {
  const processUrl = `${supabaseUrl}/functions/v1/generate-content`;
  fetch(processUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${serviceRoleKey}`,
      "x-job-step": "true",
    },
    body: JSON.stringify(payload),
  }).catch((e) => console.error("Failed to trigger next step:", e));
}

async function finalizeJob(supabase: any, jobId: string, pages: any[], total: number, success: number, failed: number, skipped: number) {
  await supabase.from("generation_jobs").update({
    status: failed > 0 && success === 0 ? "failed" : "completed",
    completed_count: success + failed + skipped,
    success_count: success,
    failed_count: failed,
    skipped_count: skipped,
    result_summary: { pages, total_attempted: total, success, failed, skipped_duplicates: skipped },
  }).eq("id", jobId);
  console.log(`Job ${jobId} finalized: ${success} success, ${failed} failed, ${skipped} skipped`);
}

async function updateJobProgress(supabase: any, jobId: string, completed: number, success: number, failed: number, skipped: number) {
  await supabase.from("generation_jobs").update({
    completed_count: completed,
    success_count: success,
    failed_count: failed,
    skipped_count: skipped,
  }).eq("id", jobId);
}

function buildUserMessage(niche: any, schema: any, ctx: Record<string, any>, title: string, angle: string, currentYear: number, researchContext: string = "", hasResearch: boolean = true): string {
  const researchConstraints = hasResearch
    ? `- CRITICAL: ONLY use tools, platforms, and companies that are EXPLICITLY mentioned in the VERIFIED REAL-TIME RESEARCH DATA above. Do NOT supplement with your own knowledge or training data.
- If the research data doesn't provide enough items to fill a section, use FEWER items rather than inventing tools from your training data. Quality over quantity.
- Every tool/platform you mention MUST appear in the research data above. If it's not in the research, do NOT include it.`
    : `- ⚠️ No real-time research was available for this topic. Be EXTREMELY conservative.
- ONLY mention tools and platforms you are 100% certain still exist and are actively maintained in ${currentYear}.
- Prefer fewer, verified items over a full list of potentially outdated ones. It is better to have 5 verified items than 15 questionable ones.
- When in doubt about whether a tool still exists or is still relevant, LEAVE IT OUT.`;

  const blocklist = `- NEVER mention these known defunct/outdated/irrelevant tools: Air.ai, Jasper, Copy.ai, Writesonic, Rytr, Article Forge, WordAI, Kafkai, or any tool you are not 100% certain is actively operating in ${currentYear}. If ANY of these appear in research data, they may be included ONLY if the research explicitly confirms they are active in ${currentYear}.`;

  return `NICHE CONTEXT:
Name: ${niche.name}
Audience: ${ctx.audience || "general"}
Pain Points: ${ctx.pain_points || "N/A"}
Monetization: ${ctx.monetization || "N/A"}
Content That Works: ${ctx.content_that_works || "N/A"}
Subtopics: ${Array.isArray(ctx.subtopics) ? ctx.subtopics.join(", ") : ctx.subtopics || "N/A"}
AI Opportunities: ${ctx.ai_opportunities || "N/A"}

SPECIFIC ANGLE/FOCUS: ${angle}
This page must focus SPECIFICALLY on "${angle}" — not the general "${schema.name}" topic. All items, examples, and recommendations should relate to this specific subtopic.
${researchContext}

CONTENT SCHEMA:
${JSON.stringify(schema.schema_definition, null, 2)}

CONSTRAINTS:
- Each section MUST contain exactly ${schema.items_per_section || 15} items (or fewer if research data doesn't support that many verified items)
- Difficulty/priority enums must match the schema exactly
- All descriptions must be specific to ${angle} within the ${niche.name} niche
- Reference specific tools, platforms, and strategies used by ${ctx.audience || "the target audience"}
- Use the language and terminology this audience actually uses
- Pro tips must be non-obvious and actionable
- The intro field must directly answer the implied search query in 2-3 factual, self-contained sentences
- Include specific numbers, percentages, or timeframes where possible
- Do NOT produce generic content that could apply to any niche or angle
${researchConstraints}
${blocklist}
- Generate a frequently_asked_questions array with exactly 5 items, each with question and answer fields

TITLE (pre-generated, include in output as-is):
${title}

Generate the content now. Return ONLY the JSON object.`;
}

async function handleDryRun(supabase: any, niches: any[], contentSchemas: any[], apiKey: string, corsHeaders: Record<string, string>) {
  const currentYear = new Date().getFullYear();
  const niche = niches[0];
  const schema = contentSchemas[0];
  const ctx = (niche.context || {}) as Record<string, any>;

  const { data: existingPages } = await supabase
    .from("generated_pages")
    .select("title")
    .eq("niche_id", niche.id)
    .eq("content_schema_id", schema.id);
  const existingTitles = (existingPages || []).map((p: any) => p.title);

  const angles = await generateUniqueAngles(niche.name, schema.name, 1, existingTitles, ctx.audience || "general", apiKey);
  const { angle, keyword } = angles[0];
  const estimatedCount = (schema.items_per_section || 15) * 3;
  const title = `${estimatedCount} Best ${angle} in ${currentYear}`;

  const { context: researchContext, hasResearch } = await researchTopic(angle, niche.name, ctx.audience || "general", currentYear);

  const systemMessage = "You are a structured content engine. Return ONLY valid JSON matching the exact schema provided. No markdown fences, no explanations, no preamble. Every field is required. Follow all constraints exactly.";
  const userMessage = buildUserMessage(niche, schema, ctx, title, angle, currentYear, researchContext, hasResearch);

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
            { role: "user", content: attempt === 0 ? userMessage : userMessage + "\n\nCRITICAL: Return ONLY a JSON object." },
          ],
          temperature: 0.7,
          max_tokens: 8192,
        }),
      });

      if (!aiResp.ok) throw new Error(`AI gateway ${aiResp.status}: ${await aiResp.text()}`);

      const aiData = await aiResp.json();
      tokensUsed = aiData.usage?.total_tokens || 0;
      const raw = aiData.choices?.[0]?.message?.content || "";
      contentJson = JSON.parse(extractJson(raw));
      break;
    } catch (e: any) {
      if (attempt === 1) {
        return new Response(JSON.stringify({ error: `Dry run failed: ${e.message}` }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }
  }

  return new Response(
    JSON.stringify({
      dry_run: true,
      results: [{ title, slug: slugify(title), niche: niche.name, content_type: schema.name, angle, content_json: contentJson, tokens_used: tokensUsed }],
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

async function logGeneration(supabase: any, log: { batch_id: string; generated_page_id: string | null; status: string; error_message: string | null; tokens_used: number; cost: number; duration_ms: number }) {
  try {
    await supabase.from("generation_logs").insert(log);
  } catch (e: any) {
    console.error("Failed to write generation log:", e.message);
  }
}
