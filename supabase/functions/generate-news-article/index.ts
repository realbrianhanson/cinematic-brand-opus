// Generates a full AI-rewritten news article for a source_items row and stores
// it on the row. Idempotent: if full_content already exists and force!=true,
// returns the stored content.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import { MAIN_MODEL } from "../_shared/models.ts";
import { loadVoiceConfig, formatVoiceBlock } from "../_shared/voice.ts";
import { fetchOgImage } from "../_shared/ogImage.ts";
import { linkifyEventMentions } from "../_shared/eventLink.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY");

async function fetchSourceMarkdown(url: string): Promise<string> {
  // Prefer Firecrawl if available; fall back to plain fetch + strip.
  if (FIRECRAWL_API_KEY) {
    try {
      const r = await fetch("https://api.firecrawl.dev/v1/scrape", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${FIRECRAWL_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ url, formats: ["markdown"], onlyMainContent: true }),
      });
      if (r.ok) {
        const j = await r.json();
        const md = j?.data?.markdown || j?.markdown;
        if (md && md.length > 200) return md.slice(0, 12000);
      }
    } catch (_) { /* fall through */ }
  }
  try {
    const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 NewsRewriter/1.0" } });
    const html = await r.text();
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return text.slice(0, 12000);
  } catch {
    return "";
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const { id, force } = body as { id?: string; force?: boolean };
    if (!id) {
      return new Response(JSON.stringify({ error: "id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: item, error } = await supabase
      .from("source_items")
      .select("id, title, url, raw_excerpt, full_content, ai_title, ai_summary, image_url, topic_lane, published_at, content_sources(name)")
      .eq("id", id)
      .maybeSingle();
    if (error || !item) {
      return new Response(JSON.stringify({ error: "not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (item.full_content && !force) {
      // Even on the cached path, opportunistically backfill a missing image so
      // articles that were generated before the OG fallback shipped get a picture.
      let cachedImage = item.image_url as string | null;
      if (!cachedImage) {
        cachedImage = await fetchOgImage(item.url);
        if (cachedImage) {
          await supabase
            .from("source_items")
            .update({ image_url: cachedImage.slice(0, 1000) })
            .eq("id", item.id);
        }
      }
      return new Response(JSON.stringify({
        id: item.id,
        title: item.ai_title || item.title,
        summary: item.ai_summary || item.raw_excerpt,
        content: item.full_content,
        image_url: cachedImage,
        cached: true,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const sourceText = await fetchSourceMarkdown(item.url);
    const voice = await loadVoiceConfig(supabase);
    const voiceBlock = formatVoiceBlock(voice);

    const sourceName = (item as any).content_sources?.name || (() => {
      try { return new URL(item.url).hostname.replace(/^www\./, ""); } catch { return "the original source"; }
    })();

    const prompt = `You are rewriting a news item into an original article for a business/AI audience.

Original headline: ${item.title || "(none)"}
Original excerpt: ${item.raw_excerpt || "(none)"}
Original source: ${sourceName}
Original URL: ${item.url}

Fetched source content (may be partial):
"""
${sourceText || item.raw_excerpt || item.title || ""}
"""

Write a completely original article of 400-700 words. Do NOT copy sentences from the source.
Structure:
1. A punchy 1-sentence lede.
2. 3-5 short sections with markdown ## subheadings covering: what happened, why it matters, who is affected, what to watch next.
3. A closing "Why it matters for Jacksonville businesses" paragraph (2-3 sentences).

${voiceBlock}

Return STRICT JSON only, no prose, no code fences:
{
  "title": "A rewritten, non-clickbait headline (max 90 chars)",
  "summary": "A 1-2 sentence summary (max 240 chars)",
  "content_markdown": "The full article in markdown, using ## for subheadings and normal paragraphs."
}`;

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MAIN_MODEL,
        messages: [
          { role: "system", content: "You are a careful business news editor. Output valid JSON only." },
          { role: "user", content: prompt },
        ],
      }),
    });

    if (!aiResp.ok) {
      const t = await aiResp.text();
      return new Response(JSON.stringify({ error: "ai_failed", detail: t.slice(0, 500) }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiJson = await aiResp.json();
    let raw = aiJson?.choices?.[0]?.message?.content || "";
    raw = raw.replace(/^```(?:json)?/i, "").replace(/```$/g, "").trim();
    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch {
      const m = raw.match(/\{[\s\S]*\}/);
      parsed = m ? JSON.parse(m[0]) : {};
    }

    const title = (parsed.title || item.title || "").toString().slice(0, 200);
    const summary = (parsed.summary || item.raw_excerpt || "").toString().slice(0, 400);
    let content = (parsed.content_markdown || parsed.content || "").toString();

    // Auto-link training mentions to the tracked CTA URL.
    try {
      const { data: ctaSettings } = await supabase
        .from("site_settings").select("cta_url").limit(1).maybeSingle();
      content = linkifyEventMentions(content, ctaSettings?.cta_url);
    } catch (_) { /* non-fatal */ }

    if (!content || content.length < 200) {
      return new Response(JSON.stringify({ error: "generation_too_short" }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Backfill image if the row is missing one
    let backfilledImage: string | null = null;
    if (!item.image_url) {
      backfilledImage = await fetchOgImage(item.url);
    }

    const updatePayload: Record<string, unknown> = {
      ai_title: title,
      ai_summary: summary,
      full_content: content,
      full_content_generated_at: new Date().toISOString(),
    };
    if (backfilledImage) updatePayload.image_url = backfilledImage.slice(0, 1000);

    await supabase
      .from("source_items")
      .update(updatePayload)
      .eq("id", item.id);

    return new Response(JSON.stringify({
      id: item.id, title, summary, content, cached: false,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
