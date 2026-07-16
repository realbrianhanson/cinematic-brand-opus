import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  loadVoiceConfig,
  formatVoiceBlock,
  critiqueAndRevise,
  mechanicalFixViolations,
  lintJson,
  scorePost,
} from "../_shared/voice.ts";
import { MAIN_MODEL } from "../_shared/models.ts";
import { linkifyEventMentions } from "../_shared/eventLink.ts";
import { generateFeaturedImage } from "../_shared/featuredImage.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};




Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const anonClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );
  const {
    data: { user },
    error: userErr,
  } = await anonClient.auth.getUser();
  if (userErr || !user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
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
    const { topic, additional_context } = await req.json();
    if (!topic || typeof topic !== "string" || topic.trim().length < 3) {
      return new Response(
        JSON.stringify({ error: "Please provide a topic (3+ characters)." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ error: "LOVABLE_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Service-role client for storage uploads
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Step 1: Research via Perplexity (if available)
    let researchContext = "";
    const PERPLEXITY_API_KEY = Deno.env.get("PERPLEXITY_API_KEY");
    if (PERPLEXITY_API_KEY) {
      try {
        console.log("Researching topic via Perplexity:", topic);
        const researchRes = await fetch("https://api.perplexity.ai/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${PERPLEXITY_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "sonar-pro",
            messages: [
              { role: "system", content: "You are a research assistant. Provide comprehensive, factual, up-to-date information about the given topic. Include statistics, expert opinions, recent developments, and practical insights. Focus on accuracy and depth." },
              { role: "user", content: `Research the following topic thoroughly for a blog article: "${topic}". ${additional_context ? `Additional context: ${additional_context}` : ""}\n\nProvide key facts, statistics, expert quotes, recent trends, and actionable insights.` },
            ],
            search_recency_filter: "month",
          }),
        });

        if (researchRes.ok) {
          const researchData = await researchRes.json();
          researchContext = researchData.choices?.[0]?.message?.content || "";
          const citations = researchData.citations || [];
          if (citations.length > 0) {
            researchContext += `\n\nSources:\n${citations.slice(0, 5).map((c: string) => `- ${c}`).join("\n")}`;
          }
          console.log("Research completed, length:", researchContext.length);
        } else {
          console.warn("Perplexity research failed:", researchRes.status, await researchRes.text());
        }
      } catch (e) {
        console.warn("Perplexity research error:", e);
      }
    } else {
      console.log("No PERPLEXITY_API_KEY — skipping research phase");
    }

    // Load per-site voice config
    const voice = await loadVoiceConfig(supabaseAdmin);
    const voiceBlock = formatVoiceBlock(voice);

    // Step 2: Generate the full blog post via Lovable AI
    const systemPrompt = `You are a blog writer and SEO specialist. Write a comprehensive, well-structured blog post.

${voiceBlock}

Requirements:
- Use question-format H2 and H3 headings where appropriate (great for AEO/GEO)
- Include bulleted or numbered lists for actionable content
- Target 1200-2000 words
- Include specific examples, data points, and expert insights from the research
- Structure with clear sections using H2 headings
- Use short paragraphs (1-3 sentences max)

Return valid JSON ONLY with these fields:
{
  "title": "Engaging, SEO-optimized title (under 60 chars ideally)",
  "content": "Full HTML blog post content with proper heading tags, lists, paragraphs",
  "excerpt": "Compelling 1-2 sentence excerpt/summary",
  "tldr": "TL;DR summary in 20-60 words",
  "key_takeaways": ["takeaway 1", "takeaway 2", "takeaway 3", "takeaway 4", "takeaway 5"],
  "faq_items": [{"question": "Q1?", "answer": "A1"}, {"question": "Q2?", "answer": "A2"}, {"question": "Q3?", "answer": "A3"}],
  "meta_title": "SEO meta title under 60 characters",
  "meta_description": "SEO meta description under 160 characters",
  "keywords": "keyword1, keyword2, keyword3, keyword4, keyword5",
  "featured_image_alt": "Descriptive alt text for the featured image, 6-14 words, includes the article topic, no 'image of' or 'picture of' prefix"
}`;

    const userMessage = researchContext
      ? `Write a comprehensive blog post about: "${topic}"${additional_context ? `\n\nAdditional guidance: ${additional_context}` : ""}\n\nUse the following research to inform the article with accurate, up-to-date information:\n\n${researchContext.slice(0, 6000)}`
      : `Write a comprehensive blog post about: "${topic}"${additional_context ? `\n\nAdditional guidance: ${additional_context}` : ""}`;

    console.log("Generating blog post via Lovable AI...");
    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
      },
      body: JSON.stringify({
        model: MAIN_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
        temperature: 0.8,
        max_tokens: 32000,
      }),
    });

    if (!aiResponse.ok) {
      const status = aiResponse.status;
      const errText = await aiResponse.text();
      console.error("AI gateway error:", status, errText);
      if (status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please wait a moment and try again." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add funds in Settings > Workspace > Usage." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "AI generation failed" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiResponse.json();

    // Check for truncation
    const finishReason = aiData.choices?.[0]?.finish_reason;
    if (finishReason === "length" || finishReason === "max_tokens") {
      console.error("AI response truncated (finish_reason:", finishReason, ")");
      return new Response(JSON.stringify({ error: "AI response was truncated. Please try a shorter topic." }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const raw = aiData.choices?.[0]?.message?.content || "";

    // Robust JSON extraction
    let result;
    try {
      let cleaned = raw
        .replace(/^```json\s*/im, "")
        .replace(/^```\s*/im, "")
        .replace(/```\s*$/im, "")
        .trim();

      if (!cleaned.startsWith("{")) {
        const start = cleaned.indexOf("{");
        const end = cleaned.lastIndexOf("}");
        if (start !== -1 && end > start) {
          cleaned = cleaned.slice(start, end + 1);
        }
      }

      result = JSON.parse(cleaned);
    } catch {
      console.error("Failed to parse AI response:", raw.slice(0, 500));
      return new Response(JSON.stringify({ error: "Failed to parse AI response. Please try again." }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Critique + revise pass — enforce voice, cut filler, ground in research.
    // Then lint + mechanical fix any residual violations.
    let lintFlags: any[] = [];
    try {
      const revised = await critiqueAndRevise({
        apiKey: LOVABLE_API_KEY,
        model: MAIN_MODEL,
        voiceBlock,
        researchContext,
        draftJson: result,
        schemaHint: "blog post fields (title, content HTML, excerpt, tldr, key_takeaways, faq_items, meta_title, meta_description, keywords)",
        maxTokens: 16000,
      });
      if (!revised.error) {
        result = { ...result, ...revised.revised };
      } else {
        console.warn("Revise pass:", revised.error);
      }

      const violations = lintJson(result, voice.banned_phrases);
      if (violations.length > 0) {
        const fixed = await mechanicalFixViolations({
          apiKey: LOVABLE_API_KEY,
          model: MAIN_MODEL,
          draftJson: result,
          violations,
          bannedPhrases: voice.banned_phrases,
          schemaHint: "blog post fields (same schema, keep JSON structure)",
        });
        if (!fixed.error) {
          result = { ...result, ...fixed.revised };
        } else {
          console.warn("Mechanical fix:", fixed.error);
        }
        lintFlags = lintJson(result, voice.banned_phrases);
      }
      if (lintFlags.length) {
        console.warn(`${lintFlags.length} lint violations remain in blog post "${result.title}"`);
      }
    } catch (e: any) {
      console.error("Refine pipeline threw:", e.message);
    }

    // Auto-link mentions of the free 3-day virtual training to the tracked CTA URL.
    try {
      const { data: ctaSettings } = await supabaseAdmin
        .from("site_settings")
        .select("cta_url")
        .limit(1)
        .maybeSingle();
      if (result.content) result.content = linkifyEventMentions(result.content, ctaSettings?.cta_url);
      if (result.excerpt) result.excerpt = linkifyEventMentions(result.excerpt, ctaSettings?.cta_url, { maxLinks: 1 });
    } catch (e: any) {
      console.warn("linkifyEventMentions failed:", e?.message);
    }

    // Compute quality score for the finalized post
    const { score: qualityScore, issues: qualityIssues } = scorePost({
      title: result.title,
      content: result.content,
      faq_items: result.faq_items,
      key_takeaways: result.key_takeaways,
      tldr: result.tldr,
      excerpt: result.excerpt,
    });
    result.quality_score = qualityScore;
    result.lint_flags = lintFlags;
    if (qualityIssues.length) console.log(`Blog quality: ${qualityScore}/100 —`, qualityIssues);

    // Step 3: Generate featured image via Nano Banana 2
    const featuredImageUrl = await generateFeaturedImage(
      result.title || topic,
      result.excerpt || result.meta_description || topic,
      LOVABLE_API_KEY,
      supabaseAdmin,
    );
    if (featuredImageUrl) {
      result.featured_image = featuredImageUrl;
    }

    console.log("Blog post generated successfully:", result.title);
    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Edge function error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
