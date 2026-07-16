import { createClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";
import { authorizeCronOrAdmin } from "../_shared/cronAuth.ts";
import { MAIN_MODEL } from "../_shared/models.ts";
import { loadVoiceConfig, formatVoiceBlock } from "../_shared/voice.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const UNSUB_BASE =
  "https://pwjdotliwsulqktavyxf.supabase.co/functions/v1/newsletter-unsubscribe";
const POST_BASE = "https://brianhanson.com/blog";

interface PostRow {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  tldr: string | null;
  quality_score: number | null;
}

interface Blurb {
  slug: string;
  blurb: string;
}

interface Composed {
  subject: string;
  intro: string;
  post_blurbs: Blurb[];
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function isoWeekKey(d: Date): string {
  // ISO week: Thursday-based
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

async function compose(
  lovableKey: string,
  voiceBlock: string,
  posts: PostRow[],
): Promise<Composed> {
  const fallback = (): Composed => ({
    subject: `This week in AI: ${posts[0].title}`.slice(0, 90),
    intro:
      "A few things worth your attention this week. Practical, no fluff — pick the one that maps to what you're building right now.",
    post_blurbs: posts.map((p) => ({
      slug: p.slug,
      blurb: (p.tldr || p.excerpt || "").toString().slice(0, 280),
    })),
  });

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
    if (!res.ok) return fallback();
    const j = await res.json();
    const raw = j?.choices?.[0]?.message?.content || "";
    const parsed = safeParseJson(raw);
    if (!parsed) return fallback();

    // Ensure a blurb for every post; fall back to excerpt if missing.
    const bySlug = new Map(parsed.post_blurbs.map((b) => [b.slug, b.blurb]));
    const filled: Blurb[] = posts.map((p) => ({
      slug: p.slug,
      blurb: (bySlug.get(p.slug) || p.tldr || p.excerpt || "").toString().slice(0, 400),
    }));
    return {
      subject: parsed.subject.slice(0, 90) || fallback().subject,
      intro: parsed.intro || fallback().intro,
      post_blurbs: filled,
    };
  } catch {
    return fallback();
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildHtml(
  composed: Composed,
  posts: PostRow[],
  token: string,
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

  const unsub = `${UNSUB_BASE}?token=${token}`;

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
      <a href="${unsub}" style="color:#7a7460;text-decoration:underline;">Unsubscribe</a>
    </div>
  </div>
</body></html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  const auth = await authorizeCronOrAdmin(req, corsHeaders);
  if (auth instanceof Response) return auth;

  const resendKey = Deno.env.get("RESEND_API_KEY");
  if (!resendKey) return json(200, { ok: true, skipped: "no resend key" });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const weekKey = isoWeekKey(new Date());

  // Idempotency
  const { data: existing } = await admin
    .from("newsletter_sends")
    .select("id")
    .eq("week_key", weekKey)
    .maybeSingle();
  if (existing) return json(200, { ok: true, skipped: "already sent this week" });

  // Content
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: postsRaw } = await admin
    .from("posts")
    .select("id, title, slug, excerpt, tldr, quality_score")
    .eq("status", "published")
    .gte("created_at", since)
    .order("quality_score", { ascending: false, nullsFirst: false })
    .limit(5);
  const posts = (postsRaw || []) as PostRow[];
  if (posts.length === 0) return json(200, { ok: true, skipped: "no posts this week" });

  // Recipients
  const { data: subs } = await admin
    .from("newsletter_subscribers")
    .select("id, email, confirm_token")
    .eq("status", "confirmed");
  const recipients = (subs || []) as { id: string; email: string; confirm_token: string }[];
  if (recipients.length === 0) {
    return json(200, { ok: true, skipped: "no confirmed subscribers" });
  }

  // Site settings
  const { data: settings } = await admin
    .from("site_settings")
    .select("newsletter_from_address, newsletter_reply_to, newsletter_postal_address")
    .limit(1)
    .maybeSingle();
  const fromAddr =
    settings?.newsletter_from_address || "Brian Hanson <brian@m.brianhanson.com>";
  const replyTo = settings?.newsletter_reply_to || null;
  const postal = settings?.newsletter_postal_address || null;

  // Compose
  const lovableKey = Deno.env.get("LOVABLE_API_KEY") || "";
  const voice = await loadVoiceConfig(admin);
  const voiceBlock = formatVoiceBlock(voice);
  const composed = lovableKey
    ? await compose(lovableKey, voiceBlock, posts)
    : {
        subject: `This week in AI: ${posts[0].title}`.slice(0, 90),
        intro: "A few things worth your attention this week.",
        post_blurbs: posts.map((p) => ({
          slug: p.slug,
          blurb: (p.tldr || p.excerpt || "").toString().slice(0, 280),
        })),
      };

  // Insert send row BEFORE sending
  const { error: insertErr } = await admin.from("newsletter_sends").insert({
    week_key: weekKey,
    subject: composed.subject,
    post_ids: posts.map((p) => p.id),
    recipient_count: recipients.length,
    sent_count: 0,
  });
  if (insertErr) {
    return json(500, { error: `insert failed: ${insertErr.message}` });
  }

  // Send in chunks of 100
  let sent = 0;
  const chunkSize = 100;
  for (let i = 0; i < recipients.length; i += chunkSize) {
    const chunk = recipients.slice(i, i + chunkSize);
    const batchPayload = chunk.map((r) => {
      const html = buildHtml(composed, posts, r.confirm_token, postal);
      const p: Record<string, unknown> = {
        from: fromAddr,
        to: [r.email],
        subject: composed.subject,
        html,
      };
      if (replyTo) p.reply_to = replyTo;
      return p;
    });

    try {
      const res = await fetch("https://api.resend.com/emails/batch", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(batchPayload),
      });
      if (res.ok) {
        sent += chunk.length;
      } else {
        console.error(
          `Resend batch failed [${res.status}]: ${await res.text()}`,
        );
      }
    } catch (e) {
      console.error(`Resend batch threw:`, e);
    }

    if (i + chunkSize < recipients.length) {
      await new Promise((r) => setTimeout(r, 600));
    }
  }

  await admin
    .from("newsletter_sends")
    .update({ sent_count: sent })
    .eq("week_key", weekKey);

  return json(200, {
    ok: true,
    week_key: weekKey,
    subject: composed.subject,
    recipients: recipients.length,
    sent,
  });
});
