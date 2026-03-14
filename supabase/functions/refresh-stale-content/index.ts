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
      status: 401, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
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
    const { page_ids, all_stale = false } = body;
    const batch_id = crypto.randomUUID();

    // Resolve pages to refresh
    let pagesToRefresh: any[] = [];
    if (all_stale) {
      const { data, error } = await supabase
        .from("generated_pages")
        .select("*, niches(id, name, slug, context), content_schemas(id, name, slug, schema_definition, title_template, description_template, items_per_section)")
        .eq("performance_trend", "needs_refresh")
        .eq("status", "published");
      if (error) throw new Error(`Query failed: ${error.message}`);
      pagesToRefresh = data || [];
    } else if (Array.isArray(page_ids) && page_ids.length > 0) {
      const { data, error } = await supabase
        .from("generated_pages")
        .select("*, niches(id, name, slug, context), content_schemas(id, name, slug, schema_definition, title_template, description_template, items_per_section)")
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

    // Fetch site settings for SEO meta
    const { data: siteSettings } = await supabase
      .from("site_settings")
      .select("*")
      .limit(1)
      .single();

    const currentYear = new Date().getFullYear();
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

      // Determine title — update year if present
      let title = page.title;
      const yearRegex = /\b(20\d{2})\b/;
      const yearMatch = title.match(yearRegex);
      const titleChanged = yearMatch && Number(yearMatch[1]) !== currentYear;
      if (titleChanged) {
        title = title.replace(yearRegex, String(currentYear));
      }

      // Build AI prompt
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

      // Update seo_meta if title changed
      let seoMeta = page.seo_meta || {};
      if (titleChanged && siteSettings) {
        seoMeta = {
          ...seoMeta,
          title: `${title} | ${siteSettings.publisher_name || ""}`.slice(0, 60),
        };
      }

      // Update the page
      const { error: updateErr } = await supabase
        .from("generated_pages")
        .update({
          title,
          content_json: contentJson,
          seo_meta: seoMeta,
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
