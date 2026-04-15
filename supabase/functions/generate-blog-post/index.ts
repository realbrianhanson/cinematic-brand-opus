import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

  try {
    const { topic, additional_context } = await req.json();
    if (!topic || typeof topic !== "string" || topic.trim().length < 3) {
      return new Response(
        JSON.stringify({ error: "Please provide a topic (3+ characters)." }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ error: "LOVABLE_API_KEY not configured" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Step 1: Research via Perplexity (if available)
    let researchContext = "";
    const PERPLEXITY_API_KEY = Deno.env.get("PERPLEXITY_API_KEY");
    if (PERPLEXITY_API_KEY) {
      try {
        console.log("Researching topic via Perplexity:", topic);
        const researchRes = await fetch(
          "https://api.perplexity.ai/chat/completions",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${PERPLEXITY_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "sonar-pro",
              messages: [
                {
                  role: "system",
                  content:
                    "You are a research assistant. Provide comprehensive, factual, up-to-date information about the given topic. Include statistics, expert opinions, recent developments, and practical insights. Focus on accuracy and depth.",
                },
                {
                  role: "user",
                  content: `Research the following topic thoroughly for a blog article: "${topic}". ${additional_context ? `Additional context: ${additional_context}` : ""}\n\nProvide key facts, statistics, expert quotes, recent trends, and actionable insights.`,
                },
              ],
              search_recency_filter: "month",
            }),
          }
        );

        if (researchRes.ok) {
          const researchData = await researchRes.json();
          researchContext =
            researchData.choices?.[0]?.message?.content || "";
          const citations = researchData.citations || [];
          if (citations.length > 0) {
            researchContext += `\n\nSources:\n${citations
              .slice(0, 5)
              .map((c: string) => `- ${c}`)
              .join("\n")}`;
          }
          console.log(
            "Research completed, length:",
            researchContext.length
          );
        } else {
          console.warn(
            "Perplexity research failed:",
            researchRes.status,
            await researchRes.text()
          );
        }
      } catch (e) {
        console.warn("Perplexity research error:", e);
      }
    } else {
      console.log("No PERPLEXITY_API_KEY — skipping research phase");
    }

    // Step 2: Generate the full blog post via Lovable AI
    const systemPrompt = `You are an expert blog writer and SEO specialist. Write a comprehensive, engaging, well-structured blog post.

Requirements:
- Write in a conversational yet authoritative tone
- Use question-format H2 and H3 headings where appropriate (great for AEO/GEO)
- Include bulleted or numbered lists for actionable content
- Target 1200-2000 words
- Make the content practical and actionable
- Include specific examples, data points, and expert insights when possible
- Structure with clear sections using H2 headings
- Use short paragraphs (2-3 sentences max)

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
  "keywords": "keyword1, keyword2, keyword3, keyword4, keyword5"
}`;

    const userMessage = researchContext
      ? `Write a comprehensive blog post about: "${topic}"${additional_context ? `\n\nAdditional guidance: ${additional_context}` : ""}\n\nUse the following research to inform the article with accurate, up-to-date information:\n\n${researchContext.slice(0, 6000)}`
      : `Write a comprehensive blog post about: "${topic}"${additional_context ? `\n\nAdditional guidance: ${additional_context}` : ""}`;

    console.log("Generating blog post via Lovable AI...");
    const aiResponse = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userMessage },
          ],
          temperature: 0.8,
          max_tokens: 16000,
        }),
      }
    );

    if (!aiResponse.ok) {
      const status = aiResponse.status;
      const errText = await aiResponse.text();
      console.error("AI gateway error:", status, errText);
      if (status === 429) {
        return new Response(
          JSON.stringify({
            error:
              "Rate limit exceeded. Please wait a moment and try again.",
          }),
          {
            status: 429,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
      if (status === 402) {
        return new Response(
          JSON.stringify({
            error:
              "AI credits exhausted. Please add funds in Settings > Workspace > Usage.",
          }),
          {
            status: 402,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
      return new Response(
        JSON.stringify({ error: "AI generation failed" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const aiData = await aiResponse.json();
    const raw = aiData.choices?.[0]?.message?.content || "";

    const jsonMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/) || [
      null,
      raw,
    ];
    const jsonStr = (jsonMatch[1] || raw).trim();

    let result;
    try {
      result = JSON.parse(jsonStr);
    } catch {
      console.error("Failed to parse AI response:", jsonStr.slice(0, 500));
      return new Response(
        JSON.stringify({ error: "Failed to parse AI response" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log("Blog post generated successfully:", result.title);
    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Edge function error:", err);
    return new Response(
      JSON.stringify({
        error: err instanceof Error ? err.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
