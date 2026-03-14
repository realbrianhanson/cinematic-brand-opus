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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  // Auth: verify caller is admin
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }
  const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
  const anonClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: claims, error: claimsErr } = await anonClient.auth.getClaims(authHeader.replace("Bearer ", ""));
  if (claimsErr || !claims?.claims?.sub) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const { title, content, excerpt, enhance, missing_criteria } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: 'API key not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const systemPrompt = enhance
      ? `You are an SEO and AEO/GEO optimization expert. The user has a blog post that needs improvement. Based on the missing criteria provided, generate or improve the fields needed. Return valid JSON only with these optional fields:
- "tldr": A concise TL;DR summary (20-60 words)
- "key_takeaways": Array of 3-5 actionable bullet points
- "faq_items": Array of objects with "question" and "answer" fields (2-4 items)
- "excerpt": A compelling 1-2 sentence excerpt
- "meta_title": SEO title under 60 characters
- "meta_description": SEO description under 160 characters  
- "keywords": Comma-separated keyword string
- "enhanced_content": If content needs more words, question-format headings, or lists, return the improved HTML content. Preserve existing content and add to it.
Only include fields that need improvement based on the missing criteria.`
      : `You are an SEO and AEO/GEO optimization expert. Given a blog post title, content, and excerpt, generate optimized fields. Return valid JSON only with ALL of these fields:
- "tldr": A concise TL;DR summary (20-60 words)
- "key_takeaways": Array of 3-5 actionable bullet points  
- "faq_items": Array of 2-4 objects with "question" and "answer" fields
- "excerpt": A compelling 1-2 sentence excerpt
- "meta_title": SEO title under 60 characters with main keyword
- "meta_description": SEO description under 160 characters
- "keywords": Comma-separated keyword string (5-8 keywords)`;

    const userMessage = enhance
      ? `Title: ${title || 'Untitled'}\n\nContent: ${(content || '').slice(0, 4000)}\n\nExcerpt: ${excerpt || 'None'}\n\nMissing criteria to fix:\n${(missing_criteria || []).map((c: string) => `- ${c}`).join('\n')}`
      : `Title: ${title || 'Untitled'}\n\nContent: ${(content || '').slice(0, 4000)}\n\nExcerpt: ${excerpt || 'None'}`;

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        temperature: 0.7,
        max_tokens: 2000,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('AI API error:', errText);
      return new Response(JSON.stringify({ error: 'AI generation failed' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const aiData = await response.json();
    const raw = aiData.choices?.[0]?.message?.content || '';

    // Extract JSON from response (handle markdown code blocks)
    const jsonMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, raw];
    const jsonStr = (jsonMatch[1] || raw).trim();

    let result;
    try {
      result = JSON.parse(jsonStr);
    } catch {
      console.error('Failed to parse AI response:', jsonStr);
      return new Response(JSON.stringify({ error: 'Failed to parse AI response' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Edge function error:', err);
    return new Response(JSON.stringify({ error: err.message || 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
