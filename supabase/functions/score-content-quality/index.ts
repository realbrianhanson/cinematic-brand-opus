import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

function scoreContent(contentJson: any, title: string): { score: number; issues: string[] } {
  const issues: string[] = [];
  let score = 100;

  // 1. Intro check
  const intro = contentJson?.intro || "";
  if (!intro) { score -= 20; issues.push("Missing intro"); }
  else if (intro.split(/[.!?]+/).filter(Boolean).length < 2) { score -= 10; issues.push("Intro too short (< 2 sentences)"); }

  // 2. Sections check
  const sections = contentJson?.sections || contentJson?.categories || [];
  if (!Array.isArray(sections) || sections.length === 0) { score -= 25; issues.push("No content sections"); }
  else {
    for (const section of sections) {
      const items = section.items || section.tools || section.steps || section.checklist_items || [];
      if (Array.isArray(items) && items.length < 3) {
        score -= 5;
        issues.push(`Section "${section.title || section.heading || "unknown"}" has fewer than 3 items`);
      }
    }
  }

  // 3. FAQs check
  const faqs = contentJson?.frequently_asked_questions || contentJson?.faq_items || [];
  if (!Array.isArray(faqs) || faqs.length < 3) { score -= 15; issues.push("Fewer than 3 FAQ items"); }

  // 4. Generic/placeholder content
  const jsonStr = JSON.stringify(contentJson).toLowerCase();
  const genericPhrases = ["lorem ipsum", "placeholder", "todo", "tbd", "insert here", "example.com"];
  for (const phrase of genericPhrases) {
    if (jsonStr.includes(phrase)) { score -= 10; issues.push(`Contains generic placeholder: "${phrase}"`); }
  }

  // 5. Title freshness
  if (!/20\d{2}/.test(title)) { score -= 5; issues.push("Title missing year for freshness"); }

  // 6. Pro tips
  const tips = contentJson?.pro_tips || [];
  if (!Array.isArray(tips) || tips.length === 0) { score -= 5; issues.push("No pro tips"); }

  // 7. Word count
  const strings: string[] = [];
  function extract(obj: any) {
    if (typeof obj === "string") strings.push(obj);
    else if (Array.isArray(obj)) obj.forEach(extract);
    else if (obj && typeof obj === "object") Object.values(obj).forEach(extract);
  }
  extract(contentJson);
  const wordCount = strings.join(" ").split(/\s+/).filter(Boolean).length;
  if (wordCount < 300) { score -= 15; issues.push(`Content too thin: ${wordCount} words (minimum 300)`); }

  return { score: Math.max(0, score), issues };
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

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const { page_id } = await req.json();
    if (!page_id) {
      return new Response(JSON.stringify({ error: "page_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: page, error } = await supabase
      .from("generated_pages")
      .select("id, title, content_json, status")
      .eq("id", page_id)
      .single();

    if (error || !page) {
      return new Response(JSON.stringify({ error: "Page not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { score, issues } = scoreContent(page.content_json, page.title);

    await supabase
      .from("generated_pages")
      .update({ quality_score: score })
      .eq("id", page_id);

    return new Response(JSON.stringify({ page_id, score, issues, publishable: score >= 60 }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
