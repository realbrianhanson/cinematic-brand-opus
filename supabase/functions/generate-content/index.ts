import { createClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";

const ALLOWED_ORIGINS = [
  "https://cinematic-brand-opus.lovable.app",
  /^https:\/\/.*--aad54f9f-2dc1-4e99-9396-88f3e07eb70c\.lovable\.app$/,
];
const getAllowedOrigin = (req: Request) => {
  const origin = req.headers.get("Origin") ?? "";
  const allowed = ALLOWED_ORIGINS.some((o) => typeof o === "string" ? o === origin : o.test(origin));
  return allowed ? origin : ALLOWED_ORIGINS[0] as string;
};
const getCorsHeaders = (req: Request) => ({
  "Access-Control-Allow-Origin": getAllowedOrigin(req),
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
});

const AI_GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
const AI_MODEL = "google/gemini-3-flash-preview";

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/['']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

function fillTemplate(
  template: string,
  vars: Record<string, string | number>
): string {
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
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
  const { data: claims, error: claimsErr } = await anonClient.auth.getClaims(authHeader.replace("Bearer ", ""));
  if (claimsErr || !claims?.claims?.sub) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
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
    const {
      niche_slugs = ["all_active"],
      content_type_slug = "all_active",
      count_per_combination = 1,
      dry_run = false,
      batch_id = crypto.randomUUID(),
    } = body;

    // 1. Fetch site_settings
    const { data: siteSettings, error: ssErr } = await supabase
      .from("site_settings")
      .select("*")
      .limit(1)
      .single();
    if (ssErr) throw new Error(`Failed to fetch site_settings: ${ssErr.message}`);

    // 2. Resolve niches
    let nichesQuery = supabase.from("niches").select("*");
    if (
      Array.isArray(niche_slugs) &&
      niche_slugs.length === 1 &&
      niche_slugs[0] === "all_active"
    ) {
      nichesQuery = nichesQuery.eq("is_active", true);
    } else {
      nichesQuery = nichesQuery.in("slug", niche_slugs);
    }
    const { data: niches, error: nErr } = await nichesQuery;
    if (nErr) throw new Error(`Failed to fetch niches: ${nErr.message}`);
    if (!niches?.length) {
      return new Response(JSON.stringify({ error: "No niches found" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3. Resolve content schemas
    let schemasQuery = supabase.from("content_schemas").select("*");
    if (content_type_slug === "all_active") {
      schemasQuery = schemasQuery.eq("is_active", true);
    } else {
      schemasQuery = schemasQuery.eq("slug", content_type_slug);
    }
    const { data: contentSchemas, error: csErr } = await schemasQuery;
    if (csErr) throw new Error(`Failed to fetch content_schemas: ${csErr.message}`);
    if (!contentSchemas?.length) {
      return new Response(JSON.stringify({ error: "No content schemas found" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Pre-fetch existing slugs and keywords for dedup
    const { data: existingSlugs } = await supabase
      .from("generated_pages")
      .select("slug");
    const slugSet = new Set((existingSlugs || []).map((r: any) => r.slug));

    const { data: existingKeywords } = await supabase
      .from("keyword_assignments")
      .select("primary_keyword");
    const kwSet = new Set(
      (existingKeywords || []).map((r: any) => r.primary_keyword)
    );

    const currentYear = new Date().getFullYear();
    const summary = {
      batch_id,
      total_attempted: 0,
      success: 0,
      failed: 0,
      skipped_duplicates: 0,
      pages: [] as { id: string; title: string; slug: string; status: string }[],
    };

    const dryRunResults: any[] = [];

    // 4. Iterate niche × content_type
    for (const niche of niches) {
      for (const schema of contentSchemas) {
        for (let i = 0; i < count_per_combination; i++) {
          summary.total_attempted++;
          const startTime = Date.now();

          const ctx = (niche.context || {}) as Record<string, any>;
          const estimatedCount =
            (schema.items_per_section || 15) * 3; // estimate 3 sections

          // 4a. Generate title
          const title = fillTemplate(schema.title_template, {
            count: estimatedCount,
            content_type: schema.name,
            niche_name: niche.name,
            year: currentYear,
          });

          // 4b. Generate slug
          const pageSlug = slugify(title);

          // 4c. Check slug duplicate
          if (slugSet.has(pageSlug)) {
            summary.skipped_duplicates++;
            await logGeneration(supabase, {
              batch_id,
              generated_page_id: null,
              status: "duplicate_skipped",
              error_message: `Slug already exists: ${pageSlug}`,
              tokens_used: 0,
              cost: 0,
              duration_ms: Date.now() - startTime,
            });
            continue;
          }

          // 4d. Check primary keyword duplicate
          const primaryKeyword = `${schema.name} for ${niche.name}`.toLowerCase();
          if (kwSet.has(primaryKeyword)) {
            summary.skipped_duplicates++;
            await logGeneration(supabase, {
              batch_id,
              generated_page_id: null,
              status: "duplicate_skipped",
              error_message: `Primary keyword already exists: ${primaryKeyword}`,
              tokens_used: 0,
              cost: 0,
              duration_ms: Date.now() - startTime,
            });
            continue;
          }

          // 4e. Build AI prompt
          const systemMessage =
            "You are a structured content engine. Return ONLY valid JSON matching the exact schema provided. No markdown fences, no explanations, no preamble. Every field is required. Follow all constraints exactly.";

          const userMessage = `NICHE CONTEXT:
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

          // 4f. Call AI
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
                if (aiResp.status === 429 || aiResp.status === 402) {
                  // Don't retry on rate limit / payment errors
                  break;
                }
                continue;
              }

              const aiData = await aiResp.json();
              tokensUsed = aiData.usage?.total_tokens || 0;
              const raw = aiData.choices?.[0]?.message?.content || "";

              // 4g. Parse response
              const jsonStr = extractJson(raw);
              contentJson = JSON.parse(jsonStr);
              aiError = null;
              break; // success
            } catch (parseErr: any) {
              aiError = `JSON parse failed: ${parseErr.message}`;
              console.error(`Attempt ${attempt + 1} failed:`, aiError);
              // retry once
            }
          }

          if (!contentJson) {
            summary.failed++;
            await logGeneration(supabase, {
              batch_id,
              generated_page_id: null,
              status: "failed",
              error_message: aiError || "Unknown error",
              tokens_used: tokensUsed,
              cost: 0,
              duration_ms: Date.now() - startTime,
            });
            await delay(1000);
            continue;
          }

          // 4i. Generate seo_meta
          const metaTitle = `${title} | ${siteSettings.publisher_name || ""}`.slice(0, 60);
          const metaDesc = schema.description_template
            ? fillTemplate(schema.description_template, {
                niche_name: niche.name,
                content_type: schema.name,
                year: currentYear,
                count: estimatedCount,
              }).slice(0, 160)
            : `Discover ${schema.name.toLowerCase()} curated for ${niche.name}. Updated ${currentYear}.`.slice(0, 160);

          const seedKeywords = Array.isArray(ctx.keywords_seed)
            ? ctx.keywords_seed
            : [];
          const seoMeta = {
            title: metaTitle,
            description: metaDesc,
            keywords: [
              ...seedKeywords,
              schema.name.toLowerCase(),
              niche.name.toLowerCase(),
            ],
            og_image: null,
          };

          // schema_markup handled by frontend StructuredData component

          // Dry run: collect without saving
          if (dry_run) {
            dryRunResults.push({
              title,
              slug: pageSlug,
              niche: niche.name,
              content_type: schema.name,
              content_json: contentJson,
              seo_meta: seoMeta,
              tokens_used: tokensUsed,
            });
            continue;
          }

          // 4k. Save to generated_pages
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
              quality_score: null,
              generation_model: AI_MODEL,
              generation_cost: 0,
            })
            .select("id, title, slug, status")
            .single();

          if (saveErr) {
            summary.failed++;
            console.error("Save error:", saveErr.message);
            await logGeneration(supabase, {
              batch_id,
              generated_page_id: null,
              status: "failed",
              error_message: `DB save: ${saveErr.message}`,
              tokens_used: tokensUsed,
              cost: 0,
              duration_ms: Date.now() - startTime,
            });
            await delay(1000);
            continue;
          }

          // Mark slug/keyword as used
          slugSet.add(pageSlug);
          kwSet.add(primaryKeyword);

          // 4l. Save keyword_assignments
          await supabase.from("keyword_assignments").insert({
            page_id: savedPage.id,
            primary_keyword: primaryKeyword,
            secondary_keywords: seedKeywords.slice(0, 5),
          });

          // 4m. Log generation
          await logGeneration(supabase, {
            batch_id,
            generated_page_id: savedPage.id,
            status: "success",
            error_message: null,
            tokens_used: tokensUsed,
            cost: 0,
            duration_ms: Date.now() - startTime,
          });

          summary.success++;
          summary.pages.push(savedPage);

          // Rate limit delay
          await delay(1000);
        }
      }
    }

    if (dry_run) {
      return new Response(
        JSON.stringify({ dry_run: true, results: dryRunResults }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify(summary), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("generate-content error:", err);
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
