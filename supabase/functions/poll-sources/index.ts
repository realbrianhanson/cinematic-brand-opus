// Polls all active content_sources (RSS + Perplexity daily digests),
// dedupes by url, embeds, upserts into source_items.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authorizeCronOrAdmin } from "../_shared/cronAuth.ts";
import { embedText, toPgVector } from "../_shared/embeddings.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

interface Item {
  url: string;
  title?: string;
  author?: string;
  published_at?: string;
  raw_excerpt?: string;
  image_url?: string;
}

function extractImage(block: string): string | undefined {
  // <media:content url="..."> or <media:thumbnail url="...">
  const media = block.match(/<media:(?:content|thumbnail)[^>]*url=["']([^"']+)["']/i);
  if (media) return media[1];
  // <enclosure url="..." type="image/*"/>
  const enc = block.match(/<enclosure[^>]*url=["']([^"']+)["'][^>]*type=["']image\//i);
  if (enc) return enc[1];
  // <image><url>...</url></image>
  const imgUrl = block.match(/<image[^>]*>[\s\S]*?<url>([^<]+)<\/url>/i);
  if (imgUrl) return imgUrl[1].trim();
  // <img src="..."> inside description/content
  const img = block.match(/<img[^>]*src=["']([^"']+)["']/i);
  if (img) return img[1];
  return undefined;
}


function stripTags(s: string): string {
  return s.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function extractBetween(xml: string, tag: string): string | null {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  const m = xml.match(re);
  if (!m) return null;
  return stripTags(m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")).trim();
}

function extractLink(itemXml: string): string | null {
  // Try <link>URL</link>, then <link href="URL"/>, then <guid isPermaLink="true">URL</guid>
  const linkTag = itemXml.match(/<link[^>]*>([^<]+)<\/link>/i);
  if (linkTag) return linkTag[1].trim();
  const linkHref = itemXml.match(/<link[^>]*href=["']([^"']+)["']/i);
  if (linkHref) return linkHref[1].trim();
  const guid = itemXml.match(/<guid[^>]*>([^<]+)<\/guid>/i);
  if (guid && /^https?:\/\//i.test(guid[1].trim())) return guid[1].trim();
  return null;
}

async function parseRss(xml: string): Promise<Item[]> {
  const items: Item[] = [];
  // Handle both RSS <item> and Atom <entry>
  const blocks = xml.match(/<(item|entry)[\s\S]*?<\/(item|entry)>/gi) || [];
  for (const block of blocks) {
    const url = extractLink(block);
    if (!url) continue;
    const title = extractBetween(block, "title") ?? undefined;
    const author =
      extractBetween(block, "dc:creator") ??
      extractBetween(block, "author") ??
      undefined;
    const pubRaw =
      extractBetween(block, "pubDate") ??
      extractBetween(block, "published") ??
      extractBetween(block, "updated") ??
      null;
    let published_at: string | undefined;
    if (pubRaw) {
      const d = new Date(pubRaw);
      if (!isNaN(d.getTime())) published_at = d.toISOString();
    }
    const excerpt =
      extractBetween(block, "description") ??
      extractBetween(block, "summary") ??
      extractBetween(block, "content:encoded") ??
      undefined;
    items.push({
      url,
      title,
      author,
      published_at,
      raw_excerpt: excerpt ? stripTags(excerpt).slice(0, 800) : undefined,
      image_url: extractImage(block),
    });

  }
  return items;
}

async function fetchRss(url: string): Promise<Item[]> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "BrianHansonBot/1.0 (+https://brianhanson.com)" },
    });
    if (!res.ok) {
      console.warn("RSS fetch failed", url, res.status);
      return [];
    }
    const xml = await res.text();
    return parseRss(xml);
  } catch (e) {
    console.warn("RSS fetch threw", url, e);
    return [];
  }
}

async function fetchPerplexityDigest(
  topicLane: string,
  perplexityKey: string,
): Promise<Item[]> {
  const promptByLane: Record<string, string> = {
    ai_tools:
      "List the 5 most important AI product/model launches, feature releases, or major AI-industry news items from the last 24 hours. For each: exact headline, official source URL, publisher, one-sentence factual summary. Only real news with real URLs.",
    smb_marketing:
      "List the 5 most notable news items from the last 48 hours about AI use in small-business marketing, sales, conversions, or SEO. For each: headline, source URL, publisher, one-sentence factual summary. Only real news with real URLs.",
    ai_training:
      "List the 5 most notable news items from the last 48 hours about AI training, adoption in the workforce, upskilling programs, or enterprise AI enablement. For each: headline, source URL, publisher, one-sentence factual summary. Only real news with real URLs.",
    industry:
      "List the 5 most notable news items from the last 48 hours about AI adoption in specific service industries (dentists, plumbers, roofers, contractors, med spas, real estate, law firms, local retail). For each: headline, source URL, publisher, one-sentence factual summary. Only real news with real URLs.",
  };
  const prompt = promptByLane[topicLane] || promptByLane.ai_tools;

  try {
    const res = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${perplexityKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "sonar-pro",
        messages: [
          { role: "system", content: "You surface real, verifiable news with sources. No speculation." },
          { role: "user", content: prompt },
        ],
        search_recency_filter: "day",
      }),
    });
    if (!res.ok) {
      console.warn("Perplexity digest failed", topicLane, res.status);
      return [];
    }
    const data = await res.json();
    const content: string = data?.choices?.[0]?.message?.content || "";
    const citations: string[] = data?.citations || data?.search_results?.map((s: any) => s.url) || [];

    // Extract items: match each citation URL to a nearby line for the title.
    const items: Item[] = [];
    const lines = content.split("\n").filter((l) => l.trim());
    for (const c of citations.slice(0, 5)) {
      // Find a line containing that URL or the domain
      const domain = new URL(c).hostname.replace(/^www\./, "");
      const line = lines.find((l) => l.includes(c) || l.toLowerCase().includes(domain));
      const title = line
        ? line.replace(c, "").replace(/^[-*\d.\s]+/, "").replace(/\[.*?\]/g, "").slice(0, 200).trim()
        : undefined;
      items.push({
        url: c,
        title,
        raw_excerpt: line?.slice(0, 500),
        published_at: new Date().toISOString(),
      });
    }
    return items;
  } catch (e) {
    console.warn("Perplexity digest threw", e);
    return [];
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const auth = await authorizeCronOrAdmin(req, corsHeaders);
  if (auth instanceof Response) return auth;

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const lovableKey = Deno.env.get("LOVABLE_API_KEY")!;
  const perplexityKey = Deno.env.get("PERPLEXITY_API_KEY");

  const { data: sources, error: srcErr } = await supabase
    .from("content_sources")
    .select("id, name, kind, url, topic_lane")
    .eq("active", true);
  if (srcErr) {
    return new Response(JSON.stringify({ error: srcErr.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let totalInserted = 0;
  let totalScanned = 0;
  const perSource: Record<string, number> = {};

  for (const src of sources || []) {
    let items: Item[] = [];
    if (src.kind === "rss" && src.url) {
      items = await fetchRss(src.url);
    } else if (src.kind === "perplexity_topic" && perplexityKey) {
      items = await fetchPerplexityDigest(src.topic_lane, perplexityKey);
    }
    totalScanned += items.length;

    // Filter to last 72h when we know the date; keep undated items for RSS.
    const cutoff = Date.now() - 72 * 3600 * 1000;
    const fresh = items.filter(
      (i) => !i.published_at || new Date(i.published_at).getTime() >= cutoff,
    );

    let inserted = 0;
    for (const item of fresh.slice(0, 15)) {
      // Skip if url already exists
      const { data: existing } = await supabase
        .from("source_items")
        .select("id")
        .eq("url", item.url)
        .maybeSingle();
      if (existing) continue;

      const embeddingText = [item.title, item.raw_excerpt].filter(Boolean).join(" — ");
      const vec = await embedText(embeddingText, lovableKey);

      const { error: insErr } = await supabase.from("source_items").insert({
        source_id: src.id,
        url: item.url,
        title: item.title?.slice(0, 500),
        author: item.author?.slice(0, 200),
        published_at: item.published_at,
        raw_excerpt: item.raw_excerpt,
        topic_lane: src.topic_lane,
        embedding: vec ? toPgVector(vec) : null,
        status: "new",
      });
      if (!insErr) inserted++;
      else console.warn("insert source_item failed", item.url, insErr.message);
    }
    perSource[src.name] = inserted;
    totalInserted += inserted;

    await supabase
      .from("content_sources")
      .update({ last_polled_at: new Date().toISOString() })
      .eq("id", src.id);
  }

  // Mark items older than 14 days as stale
  await supabase
    .from("source_items")
    .update({ status: "stale" })
    .eq("status", "new")
    .lt("published_at", new Date(Date.now() - 14 * 24 * 3600 * 1000).toISOString());

  return new Response(
    JSON.stringify({ ok: true, totalScanned, totalInserted, perSource }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
