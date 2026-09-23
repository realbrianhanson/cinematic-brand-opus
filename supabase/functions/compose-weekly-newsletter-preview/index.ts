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
import { resolveNewsletterConfig } from "../_shared/newsletterConfig.ts";
import { providerErrorDetail } from "../_shared/newsletterDelivery.ts";

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
  if (req.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });
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

  // Fail closed on incomplete email configuration before doing any work.
  const { data: pubSettings } = await admin
    .from("site_settings")
    .select(
      "site_url, site_name, author_name, newsletter_from_address, newsletter_reply_to, newsletter_postal_address",
    )
    .limit(1)
    .maybeSingle();
  const resolved = resolveNewsletterConfig(
    pubSettings,
    Deno.env.get("RESEND_API_KEY"),
  );
  if (!resolved.ok) {
    return json(503, {
      ok: false,
      state: "unavailable",
      missing: resolved.missing,
    });
  }
  const config = resolved.config;

  const { data: existing, error: existingError } = await admin
    .from("newsletter_sends")
    .select("id,status,updated_at")
    .eq("week_key", weekKey)
    .maybeSingle();
  if (existingError)
    return json(503, { error: "Cannot read this week's preview" });
  if (existing && existing.status !== "preview") {
    return json(409, {
      ok: false,
      state: existing.status,
      error: "This newsletter can no longer be regenerated.",
    });
  }

  // Posts whose fact-check marked any claim contradicted are never included.
  let posts: PostRow[];
  try {
    posts = await fetchRecentPosts(admin);
  } catch (error) {
    console.error(
      "Newsletter post read failed:",
      error instanceof Error ? error.message : error,
    );
    return json(503, {
      ok: false,
      error: "This week's posts could not be read. Try again shortly.",
    });
  }
  if (posts.length === 0) {
    return json(200, {
      ok: true,
      skipped: "no eligible posts this week",
      week_key: weekKey,
    });
  }

  const lovableKey = Deno.env.get("LOVABLE_API_KEY") || "";
  const voiceBlock = await loadVoiceBlock(admin);
  const composed = await composeFromPosts(lovableKey, voiceBlock, posts, {
    siteName: config.siteName,
    authorName: config.authorName,
  });

  const payload = {
    week_key: weekKey,
    subject: composed.subject,
    intro: composed.intro,
    post_blurbs: composed.post_blurbs,
    post_ids: posts.map((p) => p.id),
    recipient_count: 0,
    sent_count: 0,
    status: "preview" as const,
    idempotency_key: `nl-${weekKey}`,
    claimed_at: null as string | null,
  };

  if (existing?.id) {
    const { data: updated, error } = await admin
      .from("newsletter_sends")
      .update(payload)
      .eq("id", existing.id)
      .eq("status", "preview")
      .eq("updated_at", existing.updated_at)
      .select("id")
      .maybeSingle();
    if (!error && !updated)
      return json(409, {
        error:
          "Preview changed while composing. Reload to see the current version.",
      });
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

  const html = buildHtml(composed, posts, null, config);
  let previewSent = false;
  let previewError: string | null = null;

  if (adminEmail) {
    const body: Record<string, unknown> = {
      from: config.fromAddress,
      to: [adminEmail],
      reply_to: config.replyTo,
      subject: `[PREVIEW — sends Tuesday] ${composed.subject}`,
      html,
    };
    const payloadHash = Array.from(
      new Uint8Array(
        await crypto.subtle.digest(
          "SHA-256",
          new TextEncoder().encode(JSON.stringify(body)),
        ),
      ),
    )
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        signal: AbortSignal.timeout(15000),
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          "Content-Type": "application/json",
          // Identical payloads reuse a key; regenerated content gets its own key.
          "Idempotency-Key": `nl-preview-${weekKey}-${payloadHash}`,
        },
        body: JSON.stringify(body),
      });
      previewSent = res.ok;
      if (!res.ok) {
        previewError = providerErrorDetail(
          res.status,
          await res.text().catch(() => ""),
        );
        console.error("Preview send failed:", previewError);
      }
    } catch (e) {
      previewError = "Provider request failed before Resend answered.";
      console.error("Preview send threw:", e);
    }
  }

  return json(200, {
    ok: true,
    week_key: weekKey,
    subject: composed.subject,
    preview_email_sent: previewSent,
    preview_email_error: previewError,
    admin_email_configured: Boolean(adminEmail),
    posts: posts.length,
  });
});
