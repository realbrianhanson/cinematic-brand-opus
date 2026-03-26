import { createClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";

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

function fillTemplate(template: string, vars: Record<string, string | number>): string {
  let result = template;
  for (const [key, val] of Object.entries(vars)) {
    result = result.replaceAll(`{{${key}}}`, String(val));
  }
  return result;
}

function extractJson(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  return (fenced ? fenced[1] : raw).trim();
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── Real-time research via Perplexity + Firecrawl ───

async function researchTopic(nicheName: string, schemaName: string, audience: string, currentYear: number): Promise<string> {
  const PERPLEXITY_API_KEY = Deno.env.get("PERPLEXITY_API_KEY");
  const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY");

  const researchParts: string[] = [];

  // Step 1: Perplexity — grounded web search for current data
  if (PERPLEXITY_API_KEY) {
    try {
      const query = `What are the best ${schemaName.toLowerCase()} for ${nicheName} in ${currentYear}? Include specific tool names, platforms, pricing, and recent developments. Focus on what ${audience} actually use right now.`;

      const resp = await fetch(PERPLEXITY_API, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${PERPLEXITY_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "sonar",
          messages: [
            { role: "system", content: "You are a research assistant. Return factual, current information with specific names, numbers, and dates. No fluff." },
            { role: "user", content: query },
          ],
          search_recency_filter: "month",
        }),
      });

      if (resp.ok) {
        const data = await resp.json();
        const content = data.choices?.[0]?.message?.content || "";
        const citations = data.citations || [];
        if (content) {
          researchParts.push(`LIVE RESEARCH (sourced ${currentYear}, grounded in web search):\n${content}`);
          if (citations.length > 0) {
            researchParts.push(`Sources: ${citations.slice(0, 5).join(", ")}`);
          }
        }
      } else {
        console.error("Perplexity research failed:", resp.status, await resp.text());
      }
    } catch (e: any) {
      console.error("Perplexity research error:", e.message);
    }
  }

  // Step 2: Firecrawl — search for recent articles on the topic
  if (FIRECRAWL_API_KEY) {
    try {
      const searchResp = await fetch(`${FIRECRAWL_API}/search`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${FIRECRAWL_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: `best ${schemaName.toLowerCase()} ${nicheName} ${currentYear}`,
          limit: 3,
          scrapeOptions: { formats: ["markdown"], onlyMainContent: true },
        }),
      });

      if (searchResp.ok) {
        const searchData = await searchResp.json();
        const results = searchData.data || [];
        if (results.length > 0) {
          const snippets = results
            .map((r: any) => {
              const markdown = r.markdown || "";
              // Take first ~500 chars of each result for context
              const snippet = markdown.slice(0, 500).trim();
              return `[${r.title || r.url}]: ${snippet}`;
            })
            .join("\n\n");
          researchParts.push(`SCRAPED WEB CONTENT (${currentYear}):\n${snippets}`);
        }
      } else {
        console.error("Firecrawl search failed:", searchResp.status, await searchResp.text());
      }
    } catch (e: any) {
      console.error("Firecrawl search error:", e.message);
    }
  }

  if (researchParts.length === 0) {
    return "";
  }

  return `\n\n─── REAL-TIME RESEARCH DATA ───\nThe following is CURRENT, VERIFIED information from live web sources. Use this data as your PRIMARY source of truth. Do NOT hallucinate tools, companies, or platforms — only reference ones mentioned in this research or ones you are 100% certain still exist in ${currentYear}.\n\n${researchParts.join("\n\n")}`;
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

  // Self-invoked background processing call
  const isBackgroundProcess = req.headers.get("x-job-process") === "true";
  if (isBackgroundProcess) {
    try {
      await handleBackgroundProcessing(req, supabase, LOVABLE_API_KEY);
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } catch (err: any) {
      console.error("Background processing error:", err);
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  // Normal request: verify user auth
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const anonClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: userErr } = await anonClient.auth.getUser();
  if (userErr || !user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
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

    // Normalize content_type_slugs (backward compat with old content_type_slug string)
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

    // For dry run, process synchronously (it's fast — only 1 page)
    if (dry_run) {
      return await handleDryRun(supabase, niches, contentSchemas, LOVABLE_API_KEY, corsHeaders);
    }

    // Calculate total combinations
    const totalCombinations = niches.length * contentSchemas.length * count_per_combination;

    // Create a job record and return immediately
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

    // Fire-and-forget: self-invoke the processing endpoint
    const processUrl = `${SUPABASE_URL}/functions/v1/generate-content`;
    fetch(processUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        "x-job-process": "true",
      },
      body: JSON.stringify({
        job_id: job.id,
        batch_id,
        niche_ids: niches.map((n: any) => n.id),
        schema_ids: contentSchemas.map((s: any) => s.id),
        count_per_combination,
      }),
    }).catch((e) => console.error("Failed to self-invoke processing:", e));

    // Return job_id immediately
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

// ─── Background processing (self-invoked) ───

async function handleBackgroundProcessing(req: Request, supabase: any, LOVABLE_API_KEY: string) {
  const { job_id, batch_id, niche_ids, schema_ids, count_per_combination } = await req.json();

  // Update job to running
  await supabase.from("generation_jobs").update({ status: "running" }).eq("id", job_id);

  // Fetch full niche + schema data
  const { data: niches } = await supabase.from("niches").select("*").in("id", niche_ids);
  const { data: contentSchemas } = await supabase.from("content_schemas").select("*").in("id", schema_ids);
  const { data: siteSettings } = await supabase.from("site_settings").select("*").limit(1).single();

  // Pre-fetch existing slugs and keywords
  const { data: existingSlugs } = await supabase.from("generated_pages").select("slug");
  const slugSet = new Set((existingSlugs || []).map((r: any) => r.slug));
  const { data: existingKeywords } = await supabase.from("keyword_assignments").select("primary_keyword");
  const kwSet = new Set((existingKeywords || []).map((r: any) => r.primary_keyword));

  const currentYear = new Date().getFullYear();
  const pages: any[] = [];
  let successCount = 0, failedCount = 0, skippedCount = 0, completedCount = 0;

  for (const niche of (niches || [])) {
    for (const schema of (contentSchemas || [])) {
      for (let i = 0; i < count_per_combination; i++) {
        const startTime = Date.now();
        const ctx = (niche.context || {}) as Record<string, any>;
        const estimatedCount = (schema.items_per_section || 15) * 3;

        const title = fillTemplate(schema.title_template, {
          count: estimatedCount,
          content_type: schema.name,
          niche_name: niche.name,
          year: currentYear,
        });

        const pageSlug = slugify(title);

        // Check duplicates
        if (slugSet.has(pageSlug)) {
          skippedCount++;
          completedCount++;
          await updateJobProgress(supabase, job_id, { completedCount, successCount, failedCount, skippedCount });
          await logGeneration(supabase, { batch_id, generated_page_id: null, status: "duplicate_skipped", error_message: `Slug exists: ${pageSlug}`, tokens_used: 0, cost: 0, duration_ms: Date.now() - startTime });
          continue;
        }

        const primaryKeyword = `${schema.name} for ${niche.name}`.toLowerCase();
        if (kwSet.has(primaryKeyword)) {
          skippedCount++;
          completedCount++;
          await updateJobProgress(supabase, job_id, { completedCount, successCount, failedCount, skippedCount });
          await logGeneration(supabase, { batch_id, generated_page_id: null, status: "duplicate_skipped", error_message: `Keyword exists: ${primaryKeyword}`, tokens_used: 0, cost: 0, duration_ms: Date.now() - startTime });
          continue;
        }

        // Build AI prompt
        const systemMessage = "You are a structured content engine. Return ONLY valid JSON matching the exact schema provided. No markdown fences, no explanations, no preamble. Every field is required. Follow all constraints exactly.";
        const userMessage = buildUserMessage(niche, schema, ctx, title, currentYear);

        // Call AI with retry
        let contentJson: any = null;
        let tokensUsed = 0;
        let aiError: string | null = null;

        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            const aiResp = await fetch(AI_GATEWAY, {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${LOVABLE_API_KEY}` },
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
          completedCount++;
          await updateJobProgress(supabase, job_id, { completedCount, successCount, failedCount, skippedCount });
          await logGeneration(supabase, { batch_id, generated_page_id: null, status: "failed", error_message: aiError || "Unknown error", tokens_used: tokensUsed, cost: 0, duration_ms: Date.now() - startTime });
          await delay(1000);
          continue;
        }

        // Build SEO meta
        const metaTitle = `${title} | ${siteSettings?.publisher_name || ""}`.slice(0, 60);
        const metaDesc = schema.description_template
          ? fillTemplate(schema.description_template, { niche_name: niche.name, content_type: schema.name, year: currentYear, count: estimatedCount }).slice(0, 160)
          : `Discover ${schema.name.toLowerCase()} curated for ${niche.name}. Updated ${currentYear}.`.slice(0, 160);
        const seedKeywords = Array.isArray(ctx.keywords_seed) ? ctx.keywords_seed : [];
        const seoMeta = { title: metaTitle, description: metaDesc, keywords: [...seedKeywords, schema.name.toLowerCase(), niche.name.toLowerCase()], og_image: null };

        // Save page
        const { data: savedPage, error: saveErr } = await supabase
          .from("generated_pages")
          .insert({ niche_id: niche.id, content_schema_id: schema.id, slug: pageSlug, title, content_json: contentJson, seo_meta: seoMeta, schema_markup: {}, status: "draft", quality_score: null, generation_model: AI_MODEL, generation_cost: 0 })
          .select("id, title, slug, status")
          .single();

        if (saveErr) {
          failedCount++;
          completedCount++;
          await updateJobProgress(supabase, job_id, { completedCount, successCount, failedCount, skippedCount });
          await logGeneration(supabase, { batch_id, generated_page_id: null, status: "failed", error_message: `DB save: ${saveErr.message}`, tokens_used: tokensUsed, cost: 0, duration_ms: Date.now() - startTime });
          await delay(1000);
          continue;
        }

        slugSet.add(pageSlug);
        kwSet.add(primaryKeyword);

        await supabase.from("keyword_assignments").insert({ page_id: savedPage.id, primary_keyword: primaryKeyword, secondary_keywords: seedKeywords.slice(0, 5) });
        await logGeneration(supabase, { batch_id, generated_page_id: savedPage.id, status: "success", error_message: null, tokens_used: tokensUsed, cost: 0, duration_ms: Date.now() - startTime });

        successCount++;
        completedCount++;
        pages.push(savedPage);
        await updateJobProgress(supabase, job_id, { completedCount, successCount, failedCount, skippedCount });

        await delay(1000);
      }
    }
  }

  // Mark job complete
  await supabase.from("generation_jobs").update({
    status: failedCount > 0 && successCount === 0 ? "failed" : "completed",
    completed_count: completedCount,
    success_count: successCount,
    failed_count: failedCount,
    skipped_count: skippedCount,
    result_summary: { pages, total_attempted: completedCount, success: successCount, failed: failedCount, skipped_duplicates: skippedCount },
  }).eq("id", job_id);
}

async function updateJobProgress(supabase: any, jobId: string, counts: { completedCount: number; successCount: number; failedCount: number; skippedCount: number }) {
  await supabase.from("generation_jobs").update({
    completed_count: counts.completedCount,
    success_count: counts.successCount,
    failed_count: counts.failedCount,
    skipped_count: counts.skippedCount,
  }).eq("id", jobId);
}

function buildUserMessage(niche: any, schema: any, ctx: Record<string, any>, title: string, currentYear: number): string {
  return `NICHE CONTEXT:
Name: ${niche.name}
Audience: ${ctx.audience || "general"}
Pain Points: ${ctx.pain_points || "N/A"}
Monetization: ${ctx.monetization || "N/A"}
Content That Works: ${ctx.content_that_works || "N/A"}
Subtopics: ${Array.isArray(ctx.subtopics) ? ctx.subtopics.join(", ") : ctx.subtopics || "N/A"}
AI Opportunities: ${ctx.ai_opportunities || "N/A"}

CONTENT SCHEMA:
${JSON.stringify(schema.schema_definition, null, 2)}

CONSTRAINTS:
- Each section MUST contain exactly ${schema.items_per_section || 15} items
- Difficulty/priority enums must match the schema exactly
- All descriptions must be specific to the ${niche.name} niche
- Reference specific tools, platforms, and strategies used by ${ctx.audience || "the target audience"}
- Use the language and terminology this audience actually uses
- Pro tips must be non-obvious and actionable
- The intro field must directly answer the implied search query in 2-3 factual, self-contained sentences
- Include specific numbers, percentages, or timeframes where possible
- Do NOT produce generic content that could apply to any niche
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
  const estimatedCount = (schema.items_per_section || 15) * 3;

  const title = fillTemplate(schema.title_template, { count: estimatedCount, content_type: schema.name, niche_name: niche.name, year: currentYear });
  const systemMessage = "You are a structured content engine. Return ONLY valid JSON matching the exact schema provided. No markdown fences, no explanations, no preamble. Every field is required. Follow all constraints exactly.";
  const userMessage = buildUserMessage(niche, schema, ctx, title, currentYear);

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

      if (!aiResp.ok) {
        const errText = await aiResp.text();
        throw new Error(`AI gateway ${aiResp.status}: ${errText}`);
      }

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
      results: [{ title, slug: slugify(title), niche: niche.name, content_type: schema.name, content_json: contentJson, tokens_used: tokensUsed }],
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
