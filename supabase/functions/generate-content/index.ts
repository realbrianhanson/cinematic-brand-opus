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
import { MAIN_MODEL as AI_MODEL, ANGLE_MODEL, IMAGE_MODEL } from "../_shared/models.ts";
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

// ─── Firecrawl SERP fetch: top-10 titles + PAA ───

interface SerpSnapshot {
  head_term: string;
  top_titles: string[];
  paa_questions: string[];
  fetched_at: string;
}

async function fetchSerpSnapshot(headTerm: string): Promise<SerpSnapshot | null> {
  const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY");
  if (!FIRECRAWL_API_KEY) return null;
  try {
    const resp = await fetch(`${FIRECRAWL_API}/search`, {
      method: "POST",
      headers: { Authorization: `Bearer ${FIRECRAWL_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query: headTerm, limit: 10 }),
    });
    if (!resp.ok) {
      console.warn("Firecrawl SERP failed:", resp.status);
      return null;
    }
    const data = await resp.json();
    // Firecrawl v1 /search returns { data: [{ title, url, description }], relatedQuestions?: [...] }
    const results = data.data || data.web || [];
    const top_titles = results.slice(0, 10).map((r: any) => String(r.title || "").trim()).filter(Boolean);
    const paaRaw = data.paa || data.peopleAlsoAsk || data.relatedQuestions || data.related_questions || [];
    const paa_questions: string[] = Array.isArray(paaRaw)
      ? paaRaw.map((q: any) => (typeof q === "string" ? q : q?.question || q?.text || "")).filter(Boolean).slice(0, 10)
      : [];
    return { head_term: headTerm, top_titles, paa_questions, fetched_at: new Date().toISOString() };
  } catch (e: any) {
    console.warn("Firecrawl SERP error:", e.message);
    return null;
  }
}

async function appendSerpToJob(supabase: any, jobId: string, snapshot: SerpSnapshot) {
  try {
    const { data: cur } = await supabase.from("generation_jobs").select("serp_snapshot").eq("id", jobId).maybeSingle();
    const arr = Array.isArray(cur?.serp_snapshot) ? cur.serp_snapshot : [];
    arr.push(snapshot);
    await supabase.from("generation_jobs").update({ serp_snapshot: arr }).eq("id", jobId);
  } catch (_) {}
}

// ─── Generate unique content angles via AI ───

async function generateUniqueAngles(
  nicheName: string,
  schemaName: string,
  count: number,
  existingTitles: string[],
  audience: string,
  apiKey: string,
  serp: SerpSnapshot | null = null,
): Promise<{ angle: string; keyword: string }[]> {
  const existingList = existingTitles.length > 0
    ? `\n\nEXISTING CONTENT ON THIS SITE (DO NOT REPEAT ANY OF THESE TOPICS):\n${existingTitles.map((t, i) => `${i + 1}. ${t}`).join("\n")}`
    : "";

  const serpBlock = serp && (serp.top_titles.length || serp.paa_questions.length)
    ? `\n\nGOOGLE SERP FOR "${serp.head_term}" (avoid duplicating these framings — go for gaps and long-tail):
TOP 10 RESULTS:
${serp.top_titles.map((t, i) => `${i + 1}. ${t}`).join("\n") || "(none)"}
PEOPLE ALSO ASK:
${serp.paa_questions.map((q) => `- ${q}`).join("\n") || "(none)"}

ANGLE RULES:
- Prefer angles and long-tail framings NOT already covered by the top 10 titles above.
- Do NOT reuse the framing of any existing top-10 title (same subject + same modifier + same year).
- Target under-covered subtopics, audience segments, or use-cases implied by PAA questions when possible.`
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
${existingList}${serpBlock}

Return a JSON array of objects with "angle" (the subtopic title phrase, 3-8 words) and "keyword" (the target SEO keyword, lowercase). Example:
[{"angle": "AI Sales Automation Tools", "keyword": "ai sales automation tools for business"}]

Return ONLY the JSON array. No other text.`;

  try {
    const resp = await fetch(AI_GATEWAY, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: ANGLE_MODEL,
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
  const workQueue: { niche_id: string; schema_id: string; angle: string; keyword: string; paa: string[] }[] = [];

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

      // SERP snapshot once per (niche, schema) combo — feed into angle generation and audit log.
      const headTerm = `best ${schema.name.toLowerCase()} for ${niche.name.toLowerCase()}`;
      const serp = await fetchSerpSnapshot(headTerm);
      if (serp) {
        await appendSerpToJob(supabase, job_id, serp);
      }

      const angles = await generateUniqueAngles(
        niche.name, schema.name, count_per_combination,
        existingTitles, ctx.audience || "general", apiKey, serp,
      );

      const paa = serp?.paa_questions || [];
      for (const { angle, keyword } of angles) {
        workQueue.push({ niche_id: niche.id, schema_id: schema.id, angle, keyword, paa });
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
  // Provisional working title used only inside the AI prompt to anchor the topic.
  // The real title (and slug) are composed AFTER generation from the actual item count.
  const workingTitle = `${item.angle} for ${niche.name} (${currentYear})`;

  console.log(`[${current_index + 1}/${work_queue.length}] Generating: ${workingTitle}`);

  // Research phase
  const { context: researchContext, hasResearch, sources } = await researchTopic(item.angle, niche.name, ctx.audience || "general", currentYear);

  // Load voice config (per-site, from site_settings)
  const voice = await loadVoiceConfig(supabase);
  const voiceBlock = formatVoiceBlock(voice);

  // Fetch up to 10 published siblings + the niche's pillar for in-body contextual links
  const [{ data: siblingLinks }, { data: pillarLink }] = await Promise.all([
    supabase
      .from("generated_pages")
      .select("title, slug, content_schemas(slug)")
      .eq("niche_id", niche.id)
      .eq("status", "published")
      .order("published_at", { ascending: false, nullsFirst: false })
      .limit(10),
    supabase
      .from("pillar_pages")
      .select("title, slug")
      .eq("niche_id", niche.id)
      .eq("status", "published")
      .maybeSingle(),
  ]);
  const internalLinkOptions: { title: string; url: string }[] = [];
  for (const s of (siblingLinks ?? []) as any[]) {
    const sSlug = s.content_schemas?.slug;
    if (sSlug && s.slug) internalLinkOptions.push({ title: s.title, url: `/resources/${sSlug}/${s.slug}` });
  }
  if (pillarLink) internalLinkOptions.push({ title: pillarLink.title, url: `/guides/${pillarLink.slug}` });

  // Expert POV (per-niche override, otherwise site-wide default from admin-only
  // site_settings_private). Used ONLY to seed the "From the trenches" callout —
  // the model may not invent experiences.
  const { data: privateSettings } = await supabase
    .from("site_settings_private").select("default_expert_pov").limit(1).maybeSingle();
  const expertPov: string =
    (typeof niche.expert_pov === "string" && niche.expert_pov.trim())
      ? niche.expert_pov.trim()
      : (typeof privateSettings?.default_expert_pov === "string" ? privateSettings.default_expert_pov.trim() : "");

  const paa: string[] = Array.isArray(item.paa) ? item.paa : [];

  // AI generation
  const systemMessage = `You are a structured content engine. Return ONLY valid JSON matching the exact schema provided. No markdown fences, no explanations, no preamble. Every field is required. Follow all constraints exactly.

${voiceBlock}`;
  const userMessage = buildUserMessage(niche, schema, ctx, workingTitle, item.angle, currentYear, researchContext, hasResearch, internalLinkOptions, paa, expertPov);

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
      console.warn(`Refine pass warnings:`, refined.errors.join(" | "));
    }
    if (lintFlags.length) {
      console.warn(`${lintFlags.length} lint violations remain (stored as lint_flags)`);
    }
  } catch (e: any) {
    console.error(`Refine pass threw:`, e.message);
  }

  // Attach citations to content_json for the frontend + crawler renderer.
  if (sources.length) {
    contentJson.sources = sources;
  }

  // ─── Compose final title from ACTUAL item count (not the estimate) ───
  const actualCount = countContentItems(contentJson);
  const overridePatterns: string[] = Array.isArray((schema as any).title_patterns)
    ? (schema as any).title_patterns
    : [];
  const title = composePageTitle({
    schemaSlug: schema.slug,
    angle: item.angle,
    niche: niche.name,
    audience: ctx.audience || "creators",
    year: currentYear,
    actualCount,
    overridePatterns,
  });

  // Make slug unique by suffixing if needed.
  let pageSlug = slugify(title);
  {
    let suffix = 1;
    let candidate = pageSlug;
    while (true) {
      const { data: existingSlug } = await supabase
        .from("generated_pages").select("id").eq("slug", candidate).limit(1);
      if (!existingSlug || existingSlug.length === 0) break;
      suffix += 1;
      candidate = `${pageSlug}-${suffix}`;
      if (suffix > 20) break;
    }
    pageSlug = candidate;
  }

  // Ensure title in content_json matches
  contentJson.title = title;

  // Validate expert_callout — must be a subset of expertPov (defensive check;
  // the critique pass verifies the callout only contains claims from the POV text).
  if (contentJson.expert_callout) {
    if (!expertPov) {
      delete contentJson.expert_callout;
    } else {
      const quote = String(contentJson.expert_callout?.quote || "").trim();
      if (!quote) {
        delete contentJson.expert_callout;
      } else {
        // Cheap grounding check: every content word in the quote (>=5 chars) should
        // appear somewhere in the POV text (case-insensitive). If <60% match, drop.
        const povLower = expertPov.toLowerCase();
        const words = quote.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 5);
        const hit = words.filter((w) => povLower.includes(w)).length;
        const ratio = words.length ? hit / words.length : 0;
        if (ratio < 0.4) {
          console.warn(`Dropping ungrounded expert_callout (grounding ratio ${ratio.toFixed(2)})`);
          delete contentJson.expert_callout;
        }
      }
    }
  }

  // Auto-score the final content
  const { score: qualityScore, issues: qualityIssues } = scoreContent(contentJson, title);
  if (qualityIssues.length) {
    console.log(`Quality score for "${title}": ${qualityScore}/100 — issues:`, qualityIssues);
  }

  // In-body editorial image — gated behind site_settings.image_generation_enabled.
  // Only generate for pages that pass the quality gate (score >= 75), to avoid burning
  // image credits on drafts that won't publish.
  const imageEnabled = siteSettings?.image_generation_enabled !== false;
  if (imageEnabled && qualityScore >= 75) {
    try {
      const heroPrompt = `Create a professional, 16:9 editorial photograph or illustration for a resource page titled "${title}". Theme: ${item.angle} for ${niche.name}. Style: cinematic lighting, rich colors, modern editorial photography, no text overlays, no watermarks, no logos. High quality.`;
      const imgRes = await fetch(AI_GATEWAY, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: IMAGE_MODEL,
          messages: [{ role: "user", content: heroPrompt }],
          modalities: ["image", "text"],
        }),
      });
      if (imgRes.ok) {
        const imgData = await imgRes.json();
        const imageUrl = imgData.choices?.[0]?.message?.images?.[0]?.image_url?.url;
        const m = typeof imageUrl === "string" && imageUrl.match(/^data:image\/(\w+);base64,(.+)$/);
        if (m) {
          const ext = m[1] === "jpeg" ? "jpg" : m[1];
          const raw = atob(m[2]);
          const bytes = new Uint8Array(raw.length);
          for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
          const filePath = `pseo/${pageSlug}-${Date.now()}.${ext}`;
          const { error: upErr } = await supabase.storage.from("blog-images").upload(filePath, bytes, { contentType: `image/${m[1]}`, upsert: false });
          if (!upErr) {
            const { data: urlData } = supabase.storage.from("blog-images").getPublicUrl(filePath);
            contentJson.hero_image = urlData.publicUrl;
            contentJson.hero_image_alt = `Editorial illustration for ${item.angle} for ${niche.name}`;
          }
        }
      }
    } catch (e: any) {
      console.warn("Hero image generation skipped:", e.message);
    }
  }

  // Build SEO meta — title via composeTitle (never mid-word cut), description AI-written
  const siteName = siteSettings?.publisher_name || siteSettings?.site_name || "";
  const metaTitle = composeTitle(title, siteName);
  const fallbackDesc = `${item.angle} for ${niche.name}: ${actualCount || "a curated set of"} options, verified against ${currentYear} sources.`;
  const metaDesc = await writeMetaDescription({
    apiKey, model: AI_MODEL, voice, contentJson,
    primaryKeyword: item.keyword, angle: item.angle, niche: niche.name,
    fallback: fallbackDesc,
  });
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

    // Auto-generate OG image after quality gate. Fire-and-forget with service role auth.
    if (qualityScore >= 75) {
      fetch(`${supabaseUrl}/functions/v1/generate-og-image`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceRoleKey}` },
        body: JSON.stringify({ page_id: savedPage.id }),
      }).catch((e) => console.warn("OG image auto-gen failed:", e.message));
    }
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

function buildUserMessage(
  niche: any, schema: any, ctx: Record<string, any>, title: string, angle: string,
  currentYear: number, researchContext: string = "", hasResearch: boolean = true,
  internalLinkOptions: { title: string; url: string }[] = [],
  paaQuestions: string[] = [],
  expertPov: string = "",
): string {
  const researchConstraints = hasResearch
    ? `- CRITICAL: ONLY use tools, platforms, and companies that are EXPLICITLY mentioned in the VERIFIED REAL-TIME RESEARCH DATA above. Do NOT supplement with your own knowledge or training data.
- If the research data doesn't provide enough items to fill a section, use FEWER items rather than inventing tools from your training data. Quality over quantity.
- Every tool/platform you mention MUST appear in the research data above. If it's not in the research, do NOT include it.`
    : `- ⚠️ No real-time research was available for this topic. Be EXTREMELY conservative.
- ONLY mention tools and platforms you are 100% certain still exist and are actively maintained in ${currentYear}.
- Prefer fewer, verified items over a full list of potentially outdated ones. It is better to have 5 verified items than 15 questionable ones.
- When in doubt about whether a tool still exists or is still relevant, LEAVE IT OUT.`;

  const blocklist = `- NEVER mention these known defunct/outdated/irrelevant tools: Air.ai, Jasper, Copy.ai, Writesonic, Rytr, Article Forge, WordAI, Kafkai, or any tool you are not 100% certain is actively operating in ${currentYear}. If ANY of these appear in research data, they may be included ONLY if the research explicitly confirms they are active in ${currentYear}.`;

  const linkBlock = internalLinkOptions.length > 0 ? `
INTERNAL LINK OPTIONS (existing published pages on this same site — reference where genuinely relevant):
${internalLinkOptions.map((l) => `- [${l.title}](${l.url})`).join("\n")}

INTERNAL LINK RULES:
- Where an item's description would ALREADY naturally reference a topic covered by one of the pages above, embed a markdown link in the description using the exact format [Anchor Text](/relative-url) — never fabricate URLs.
- Aim for 2–3 total internal links across the whole page, embedded inline in item descriptions, section content, or the intro.
- ZERO links is acceptable when nothing above is a natural fit. Do NOT force a link into an unrelated sentence.
- Never place a link in the title, faq questions, or section headings — only inside prose descriptions.
- Do not link to a URL not listed above.` : "";

  const paaBlock = paaQuestions.length > 0 ? `
PEOPLE ALSO ASK (real Google PAA questions for this topic):
${paaQuestions.map((q, i) => `${i + 1}. ${q}`).join("\n")}

FAQ RULES:
- The frequently_asked_questions array MUST contain 3–5 items that answer these PAA questions FIRST (light rephrasing is allowed to match voice, but the underlying question must be the same). Fill the remaining slots (up to 5 total) with your own genuinely useful questions.
- Answers must be specific, factual, and grounded in the research data.
- Do NOT reword answers into "It depends" filler.` : `
FAQ RULES:
- Generate a frequently_asked_questions array with exactly 5 items, each with question and answer fields.`;

  const povBlock = expertPov ? `
FIRST-PERSON EXPERT POV (from the site owner — this is the ONLY source of first-person experience):
"""
${expertPov}
"""
POV RULES:
- Add exactly one field on the content_json root called "expert_callout" with { "quote": string }. The quote is a 2–4 sentence first-person perspective callout drawn ONLY from the POV text above (paraphrasing is fine).
- The quote MUST NOT invent experiences, numbers, clients, or dates that don't appear in the POV text above.
- If nothing in the POV text can be honestly said about "${angle}", OMIT the expert_callout field entirely rather than fabricating.` : "";

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
${linkBlock}
${paaBlock}
${povBlock}

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

WORKING TITLE (for internal reference — the final title will be composed post-generation, DO NOT pre-invent an item count):
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
  const workingTitle = `${angle} for ${niche.name} (${currentYear})`;

  const { context: researchContext, hasResearch } = await researchTopic(angle, niche.name, ctx.audience || "general", currentYear);

  const systemMessage = "You are a structured content engine. Return ONLY valid JSON matching the exact schema provided. No markdown fences, no explanations, no preamble. Every field is required. Follow all constraints exactly.";
  const userMessage = buildUserMessage(niche, schema, ctx, workingTitle, angle, currentYear, researchContext, hasResearch);

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

  const actualCount = contentJson ? countContentItems(contentJson) : 0;
  const title = composePageTitle({
    schemaSlug: schema.slug,
    angle,
    niche: niche.name,
    audience: ctx.audience || "creators",
    year: currentYear,
    actualCount,
  });
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
