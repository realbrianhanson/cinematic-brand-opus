// Tuesday 14:00 UTC: send this ISO week's newsletter to confirmed subscribers.
//
// Two-phase flow:
//   1. Monday's compose-weekly-newsletter-preview inserted a newsletter_sends
//      row with status='preview' and stored subject/intro/post_blurbs/post_ids.
//   2. This job loads that row:
//        - status='cancelled' → skip (admin vetoed the week)
//        - status='preview'   → send stored content, mark status='sent'
//        - status='sent'      → idempotency skip
//        - no row             → compose fresh so the newsletter never silently
//                                dies (fallback path).
//
// The composition helpers live in _shared/newsletter-compose.ts so the Monday
// preview and this Tuesday send always render identical HTML.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";
import { authorizeCronOrAdmin } from "../_shared/cronAuth.ts";
import {
  buildHtml,
  composeFromPosts,
  fetchRecentPosts,
  isoWeekKey,
  loadVoiceBlock,
  type Composed,
  type PostRow,
} from "../_shared/newsletter-compose.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
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

  // 1. Load this week's row.
  const { data: row } = await admin
    .from("newsletter_sends")
    .select("id, status, subject, intro, post_blurbs, post_ids")
    .eq("week_key", weekKey)
    .maybeSingle();

  if (row?.status === "cancelled") {
    return json(200, { ok: true, skipped: "cancelled by admin", week_key: weekKey });
  }
  if (row?.status === "sent") {
    return json(200, { ok: true, skipped: "already sent this week", week_key: weekKey });
  }

  // 2. Resolve posts + composed content.
  let posts: PostRow[] = [];
  let composed: Composed;

  if (row && row.status === "preview") {
    // Send exactly what the admin saw in the preview.
    if (Array.isArray(row.post_ids) && row.post_ids.length > 0) {
      const { data } = await admin
        .from("posts")
        .select("id, title, slug, excerpt, tldr, quality_score")
        .in("id", row.post_ids as string[]);
      posts = (data || []) as PostRow[];
      // Preserve the preview's post order.
      const order = new Map((row.post_ids as string[]).map((id, i) => [id, i]));
      posts.sort((a, b) => (order.get(a.id) ?? 99) - (order.get(b.id) ?? 99));
    }
    composed = {
      subject: row.subject || "",
      intro: row.intro || "",
      post_blurbs: Array.isArray(row.post_blurbs) ? (row.post_blurbs as any) : [],
    };
  } else {
    // Fallback: no preview row exists (compose failed on Monday) — compose fresh.
    posts = await fetchRecentPosts(admin);
    if (posts.length === 0) {
      return json(200, { ok: true, skipped: "no posts this week", week_key: weekKey });
    }
    const lovableKey = Deno.env.get("LOVABLE_API_KEY") || "";
    const voiceBlock = await loadVoiceBlock(admin);
    composed = await composeFromPosts(lovableKey, voiceBlock, posts);
  }

  if (posts.length === 0) {
    return json(200, { ok: true, skipped: "no posts resolved", week_key: weekKey });
  }

  // 3. Recipients
  const { data: subs } = await admin
    .from("newsletter_subscribers")
    .select("id, email, confirm_token")
    .eq("status", "confirmed");
  const recipients = (subs || []) as { id: string; email: string; confirm_token: string }[];
  if (recipients.length === 0) {
    return json(200, { ok: true, skipped: "no confirmed subscribers", week_key: weekKey });
  }

  // 4. Send config
  const { data: settings } = await admin
    .from("site_settings")
    .select("newsletter_from_address, newsletter_reply_to, newsletter_postal_address")
    .limit(1)
    .maybeSingle();
  const fromAddr =
    settings?.newsletter_from_address || "Brian Hanson <brian@m.brianhanson.com>";
  const replyTo = settings?.newsletter_reply_to || null;
  const postal = settings?.newsletter_postal_address || null;

  // 5. Ensure a newsletter_sends row exists in 'preview' state before we start
  // sending. (Fallback path may not have created one yet.)
  const upsertPayload = {
    week_key: weekKey,
    subject: composed.subject,
    intro: composed.intro,
    post_blurbs: composed.post_blurbs,
    post_ids: posts.map((p) => p.id),
    recipient_count: recipients.length,
    sent_count: 0,
    status: "preview" as const,
  };
  if (row?.id) {
    await admin.from("newsletter_sends").update(upsertPayload).eq("id", row.id);
  } else {
    const { error } = await admin.from("newsletter_sends").insert(upsertPayload);
    if (error) return json(500, { error: `insert failed: ${error.message}` });
  }

  // 6. Send in chunks of 100.
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
        console.error(`Resend batch failed [${res.status}]: ${await res.text()}`);
      }
    } catch (e) {
      console.error("Resend batch threw:", e);
    }

    if (i + chunkSize < recipients.length) {
      await new Promise((r) => setTimeout(r, 600));
    }
  }

  await admin
    .from("newsletter_sends")
    .update({ sent_count: sent, recipient_count: recipients.length, status: "sent" })
    .eq("week_key", weekKey);

  return json(200, {
    ok: true,
    week_key: weekKey,
    subject: composed.subject,
    recipients: recipients.length,
    sent,
    used_preview: row?.status === "preview",
  });
});
