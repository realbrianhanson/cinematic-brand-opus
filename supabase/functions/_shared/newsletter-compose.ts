// Shared composition + rendering for the weekly newsletter.
// Used by:
//   - compose-weekly-newsletter-preview (Monday): compose + insert preview row + email admin
//   - send-weekly-newsletter (Tuesday): load preview row + send to subscribers

import { MAIN_MODEL } from "./models.ts";
import { loadVoiceConfig, formatVoiceBlock } from "./voice.ts";

export const UNSUB_BASE =
  "https://pwjdotliwsulqktavyxf.supabase.co/functions/v1/newsletter-unsubscribe";
export const POST_BASE = "https://brianhanson.com/blog";

export interface PostRow {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  tldr: string | null;
  quality_score: number | null;
}

export interface Blurb {
  slug: string;
  blurb: string;
}

export interface Composed {
  subject: string;
  intro: string;
  post_blurbs: Blurb[];
}

export function isoWeekKey(d: Date): string {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((t.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function stripFences(s: string): string {
  return s.replace(/```json\s*/gi, "").replace(/```/g, "").trim();
}

function safeParseJson(raw: string): Composed | null {
  try {
    let s = stripFences(raw);
    const first = s.indexOf("{");
    const last = s.lastIndexOf("}");
    if (first !== -1 && last !== -1) s = s.slice(first, last + 1);
    const obj = JSON.parse(s);
    if (typeof obj?.subject !== "string" || typeof obj?.intro !== "string") return null;
    if (!Array.isArray(obj?.post_blurbs)) return null;
    return obj as Composed;
  } catch {
    return null;
  }
}

function fallbackCompose(posts: PostRow[]): Composed {
  return {
    subject: `This week in AI: ${posts[0]?.title || "your weekly brief"}`.slice(0, 90),
    intro:
      "A few things worth your attention this week. Practical, no fluff — pick the one that maps to what you're building right now.",
    post_blurbs: posts.map((p) => ({
      slug: p.slug,
      blurb: (p.tldr || p.excerpt || "").toString().slice(0, 280),
    })),
  };
}

export async function composeFromPosts(
  lovableKey: string,
  voiceBlock: string,
  posts: PostRow[],
): Promise<Composed> {
  if (!lovableKey || posts.length === 0) return fallbackCompose(posts);

  try {
    const list = posts
      .map(
        (p, i) =>
          `${i + 1}. slug: ${p.slug}\n   title: ${p.title}\n   excerpt: ${(p.tldr || p.excerpt || "").toString().slice(0, 400)}`,
      )
      .join("\n\n");

    const system = `You compose a weekly email digest for Brian Hanson's list of small-business owners exploring AI.
${voiceBlock}
Return ONLY JSON, no prose, no code fences.`;

    const user = `Compose this week's newsletter as JSON with exactly this shape:
{
  "subject": "curiosity-driven, under 55 chars, no clickbait cliches",
  "intro": "2-3 first-person sentences from Brian setting up the week's theme",
  "post_blurbs": [{"slug": "...", "blurb": "1-2 punchy sentences on why this matters to a small-business owner"}]
}

Posts to cover (use these exact slugs):

${list}`;

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": lovableKey,
      },
      body: JSON.stringify({
        model: MAIN_MODEL,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });
    if (!res.ok) return fallbackCompose(posts);
    const j = await res.json();
    const raw = j?.choices?.[0]?.message?.content || "";
    const parsed = safeParseJson(raw);
    if (!parsed) return fallbackCompose(posts);

    const bySlug = new Map(parsed.post_blurbs.map((b) => [b.slug, b.blurb]));
    const filled: Blurb[] = posts.map((p) => ({
      slug: p.slug,
      blurb: (bySlug.get(p.slug) || p.tldr || p.excerpt || "").toString().slice(0, 400),
    }));
    return {
      subject: parsed.subject.slice(0, 90) || fallbackCompose(posts).subject,
      intro: parsed.intro || fallbackCompose(posts).intro,
      post_blurbs: filled,
    };
  } catch {
    return fallbackCompose(posts);
  }
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildHtml(
  composed: Composed,
  posts: PostRow[],
  unsubscribeToken: string | null,
  postalAddress: string | null,
): string {
  const bySlug = new Map(composed.post_blurbs.map((b) => [b.slug, b.blurb]));
  const items = posts
    .map((p) => {
      const url = `${POST_BASE}/${p.slug}`;
      const blurb = escapeHtml(bySlug.get(p.slug) || p.excerpt || "");
      return `
        <div style="margin:0 0 28px;">
          <a href="${url}" style="display:block;font-size:19px;font-weight:700;color:#1a1a1a;text-decoration:none;line-height:1.35;margin-bottom:6px;">${escapeHtml(p.title)}</a>
          <p style="margin:0 0 8px;font-size:15px;line-height:1.55;color:#3a3a3a;">${blurb}</p>
          <a href="${url}" style="font-size:13px;color:#B8962E;text-decoration:none;font-weight:600;letter-spacing:0.03em;">READ →</a>
        </div>`;
    })
    .join("");

  const unsubBlock = unsubscribeToken
    ? `<a href="${UNSUB_BASE}?token=${unsubscribeToken}" style="color:#7a7460;text-decoration:underline;">Unsubscribe</a>`
    : `<span style="color:#7a7460;">(Preview — unsubscribe link is per-subscriber and will be filled in on the real send.)</span>`;

  return `<!doctype html><html><body style="margin:0;padding:0;background:#faf8f4;font-family:Georgia,'Times New Roman',serif;color:#1a1a1a;">
  <div style="max-width:600px;margin:0 auto;padding:32px 24px;">
    <div style="border-bottom:2px solid #B8962E;padding-bottom:12px;margin-bottom:24px;">
      <span style="font-size:12px;letter-spacing:0.15em;text-transform:uppercase;color:#B8962E;font-weight:700;">Brian Hanson · AI Brief</span>
    </div>
    <p style="font-size:16px;line-height:1.6;color:#1a1a1a;margin:0 0 28px;">${escapeHtml(composed.intro)}</p>
    ${items}
    <p style="font-size:15px;line-height:1.6;color:#1a1a1a;margin:32px 0 0;border-top:1px solid #e5ddc9;padding-top:20px;">Reply and tell me which one you're testing this week. I read every response.<br/><br/>— Brian</p>
    <div style="margin-top:40px;padding-top:20px;border-top:1px solid #e5ddc9;font-size:12px;line-height:1.6;color:#7a7460;">
      ${postalAddress ? `<div style="margin-bottom:10px;">${escapeHtml(postalAddress)}</div>` : ""}
      ${unsubBlock}
    </div>
  </div>
</body></html>`;
}

export async function fetchRecentPosts(admin: any): Promise<PostRow[]> {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data } = await admin
    .from("posts")
    .select("id, title, slug, excerpt, tldr, quality_score")
    .eq("status", "published")
    .gte("created_at", since)
    .order("quality_score", { ascending: false, nullsFirst: false })
    .limit(5);
  return (data || []) as PostRow[];
}

export async function loadVoiceBlock(admin: any): Promise<string> {
  const voice = await loadVoiceConfig(admin);
  return formatVoiceBlock(voice);
}
