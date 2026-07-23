// Monday 14:00 UTC: compose next Tuesday's newsletter and email a preview
// ONLY to the admin report email. The preview is stored in newsletter_sends
// with status='preview'; the Tuesday send job will use it verbatim unless an
// admin cancels or regenerates it in the meantime.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";
import { authorizeCronOrAdmin } from "../_shared/cronAuth.ts";
import {
  buildHtml,
  composeFromPosts,
  fetchRecentPosts,
  isoWeekKey,
  loadVoiceBlock,
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

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Use next Tuesday's ISO week key (Monday and its following Tuesday share the
  // same ISO week, so today's key is correct).
  const weekKey = isoWeekKey(new Date());

  const posts = await fetchRecentPosts(admin);
  if (posts.length === 0) {
    return json(200, { ok: true, skipped: "no posts this week", week_key: weekKey });
  }

  const lovableKey = Deno.env.get("LOVABLE_API_KEY") || "";
  const voiceBlock = await loadVoiceBlock(admin);
  const composed = await composeFromPosts(lovableKey, voiceBlock, posts);

  // Upsert preview row (Regenerate re-runs this same function).
  const { data: existing } = await admin
    .from("newsletter_sends")
    .select("id, status")
    .eq("week_key", weekKey)
    .maybeSingle();

  if (existing?.status === "sent") {
    return json(200, { ok: true, skipped: "already sent this week", week_key: weekKey });
  }

  const payload = {
    week_key: weekKey,
    subject: composed.subject,
    intro: composed.intro,
    post_blurbs: composed.post_blurbs,
    post_ids: posts.map((p) => p.id),
    recipient_count: 0,
    sent_count: 0,
    status: "preview" as const,
  };

  if (existing?.id) {
    const { error } = await admin
      .from("newsletter_sends")
      .update(payload)
      .eq("id", existing.id);
    if (error) return json(500, { error: `update failed: ${error.message}` });
  } else {
    const { error } = await admin.from("newsletter_sends").insert(payload);
    if (error) return json(500, { error: `insert failed: ${error.message}` });
  }

  // Email the preview to the admin report email (site_settings_private).
  const { data: privateSettings } = await admin
    .from("site_settings_private")
    .select("report_email")
    .limit(1)
    .maybeSingle();
  const adminEmail = (privateSettings?.report_email || "").trim();

  const { data: pubSettings } = await admin
    .from("site_settings")
    .select("newsletter_from_address, newsletter_reply_to, newsletter_postal_address")
    .limit(1)
    .maybeSingle();
  const fromAddr =
    pubSettings?.newsletter_from_address || "Brian Hanson <brian@m.brianhanson.com>";
  const replyTo = pubSettings?.newsletter_reply_to || null;
  const postal = pubSettings?.newsletter_postal_address || null;

  const html = buildHtml(composed, posts as PostRow[], null, postal);
  const resendKey = Deno.env.get("RESEND_API_KEY");
  let previewSent = false;

  if (resendKey && adminEmail) {
    const body: Record<string, unknown> = {
      from: fromAddr,
      to: [adminEmail],
      subject: `[PREVIEW — sends Tuesday] ${composed.subject}`,
      html,
    };
    if (replyTo) body.reply_to = replyTo;
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      previewSent = res.ok;
      if (!res.ok) console.error(`Preview send failed [${res.status}]: ${await res.text()}`);
    } catch (e) {
      console.error("Preview send threw:", e);
    }
  }

  return json(200, {
    ok: true,
    week_key: weekKey,
    subject: composed.subject,
    preview_email_sent: previewSent,
    admin_email_configured: Boolean(adminEmail),
    posts: posts.length,
  });
});
