import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
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
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function base64ToUint8Array(base64: string): Uint8Array {
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

async function generateFeaturedImage(
  title: string,
  excerpt: string,
  apiKey: string,
  supabaseAdmin: any,
): Promise<string | null> {
  try {
    const imagePrompt = `Create a professional, visually striking blog header image for an article titled "${title}". The image should be: a modern, clean editorial-style photograph or illustration that evokes the theme of the article. Context: ${excerpt}. Style: cinematic lighting, rich colors, no text overlays, no watermarks, suitable as a 16:9 blog featured image. High quality, editorial photography style.`;

    console.log("Generating featured image via Nano Banana 2...");
    const imgRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "google/gemini-3.1-flash-image-preview",
        messages: [{ role: "user", content: imagePrompt }],
        modalities: ["image", "text"],
      }),
    });

    if (!imgRes.ok) {
      console.warn("Image generation failed:", imgRes.status, await imgRes.text());
      return null;
    }

    const imgData = await imgRes.json();
    const imageUrl = imgData.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    if (!imageUrl || !imageUrl.startsWith("data:image/")) {
      console.warn("No image returned from model");
      return null;
    }

    // Extract base64 and upload to storage
    const base64Match = imageUrl.match(/^data:image\/(\w+);base64,(.+)$/);
    if (!base64Match) return null;

    const ext = base64Match[1] === "jpeg" ? "jpg" : base64Match[1];
    const bytes = base64ToUint8Array(base64Match[2]);
    const filePath = `ai-generated/${Date.now()}.${ext}`;

    const { error: uploadErr } = await supabaseAdmin.storage
      .from("blog-images")
      .upload(filePath, bytes, { contentType: `image/${base64Match[1]}`, upsert: false });

    if (uploadErr) {
      console.warn("Image upload failed:", uploadErr.message);
      return null;
    }

    const { data: urlData } = supabaseAdmin.storage.from("blog-images").getPublicUrl(filePath);
    console.log("Featured image uploaded:", urlData.publicUrl);
    return urlData.publicUrl;
  } catch (e) {
    console.warn("Image generation error:", e);
    return null;
  }
}

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
    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
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
