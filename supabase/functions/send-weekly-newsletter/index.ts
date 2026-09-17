// Tuesday 14:00 UTC: send this ISO week's newsletter to confirmed subscribers.
//
// Two-phase flow:
//   1. Monday's compose-weekly-newsletter-preview inserted a newsletter_sends
//      row with status='preview' and stored subject/intro/post_blurbs/post_ids.
//   2. This job atomically claims that row (preview -> sending) through
//      public.newsletter_claim_send. Only one caller can win the claim, so a
//      retry or an overlapping run can never resend the same digest. A claim
//      older than the stale window is reclaimable so a crashed run can resume.
//
// Every provider call carries a stable Idempotency-Key derived from the week
// key and the chunk index, so even a duplicated HTTP request is de-duplicated
// by Resend.
//
// Fails closed: without validated sender / reply-to / site URL / RESEND_API_KEY
// nothing is claimed and nothing is sent.

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
import {
  buildBatchIdempotencyKey,
  orderRecipients,
  resolveNewsletterConfig,
} from "../_shared/newsletterConfig.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const CHUNK_SIZE = 100;

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

  const { data: settings } = await admin
    .from("site_settings")
    .select(
      "site_url, site_name, author_name, newsletter_from_address, newsletter_reply_to, newsletter_postal_address",
    )
    .limit(1)
    .maybeSingle();

  const resolved = resolveNewsletterConfig(settings, Deno.env.get("RESEND_API_KEY"));
  if (!resolved.ok) {
    return json(503, {
      ok: false,
      state: "unavailable",
      missing: resolved.missing,
    });
  }
  const config = resolved.config;

  const weekKey = isoWeekKey(new Date());

  const { data: existing } = await admin
    .from("newsletter_sends")
    .select("id, status, subject, intro, post_blurbs, post_ids")
    .eq("week_key", weekKey)
    .maybeSingle();

  if (existing?.status === "cancelled") {
    return json(200, { ok: true, skipped: "cancelled by admin", week_key: weekKey });
  }
  if (existing?.status === "sent") {
    return json(200, { ok: true, skipped: "already sent this week", week_key: weekKey });
  }

  // Fallback: no row at all (Monday's compose never ran) — create the preview
  // row first so the claim below has something to transition.
  if (!existing) {
    const posts = await fetchRecentPosts(admin);
    if (posts.length === 0) {
      return json(200, { ok: true, skipped: "no posts this week", week_key: weekKey });
    }
    const voiceBlock = await loadVoiceBlock(admin);
    const composedFresh = await composeFromPosts(
      Deno.env.get("LOVABLE_API_KEY") || "",
      voiceBlock,
      posts,
      { siteName: config.siteName, authorName: config.authorName },
    );
    const { error } = await admin.from("newsletter_sends").insert({
      week_key: weekKey,
      subject: composedFresh.subject,
      intro: composedFresh.intro,
      post_blurbs: composedFresh.post_blurbs,
      post_ids: posts.map((p) => p.id),
      recipient_count: 0,
      sent_count: 0,
      status: "preview",
      idempotency_key: `nl-${weekKey}`,
    });
    if (error) return json(500, { error: `insert failed: ${error.message}` });
  }

  // ---- Atomic claim: only one runner proceeds past this point --------------
  const { data: claimRows, error: claimErr } = await admin.rpc("newsletter_claim_send", {
    _week_key: weekKey,
    _stale_seconds: 3600,
  });
  if (claimErr) {
    return json(500, { error: `claim failed: ${claimErr.message}` });
  }
  const claim = Array.isArray(claimRows) ? claimRows[0] : claimRows;
  if (!claim) {
    return json(200, {
      ok: true,
      skipped: "another run already claimed this week",
      week_key: weekKey,
    });
  }

  const composed: Composed = {
    subject: claim.subject || "",
    intro: claim.intro || "",
    post_blurbs: Array.isArray(claim.post_blurbs) ? (claim.post_blurbs as any) : [],
  };

  let posts: PostRow[] = [];
  const postIds = (claim.post_ids ?? []) as string[];
  if (postIds.length > 0) {
    const { data } = await admin
      .from("posts")
      .select("id, title, slug, excerpt, tldr, quality_score")
      .in("id", postIds);
    posts = (data || []) as PostRow[];
    const order = new Map(postIds.map((id, i) => [id, i]));
    posts.sort((a, b) => (order.get(a.id) ?? 99) - (order.get(b.id) ?? 99));
  }

  if (posts.length === 0 || !composed.subject) {
    await admin
      .from("newsletter_sends")
      .update({ status: "preview" })
      .eq("week_key", weekKey);
    return json(200, { ok: true, skipped: "no posts resolved", week_key: weekKey });
  }

  const { data: subs } = await admin
    .from("newsletter_subscribers")
    .select("id, email, confirm_token")
    .eq("status", "confirmed");
  const recipients = orderRecipients(
    (subs || []) as { id: string; email: string; confirm_token: string }[],
  );
  if (recipients.length === 0) {
    await admin
      .from("newsletter_sends")
      .update({ status: "sent", recipient_count: 0, sent_count: 0 })
      .eq("week_key", weekKey);
    return json(200, { ok: true, skipped: "no confirmed subscribers", week_key: weekKey });
  }

  const idemBase = claim.idempotency_key || `nl-${weekKey}`;
  let sent = 0;

  for (let i = 0; i < recipients.length; i += CHUNK_SIZE) {
    const chunkIndex = i / CHUNK_SIZE;
    const chunk = recipients.slice(i, i + CHUNK_SIZE);
    const batchPayload = chunk.map((r) => ({
      from: config.fromAddress,
      to: [r.email],
      reply_to: config.replyTo,
      subject: composed.subject,
      html: buildHtml(composed, posts, r.confirm_token, config),
    }));

    try {
      const res = await fetch("https://api.resend.com/emails/batch", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": buildBatchIdempotencyKey(idemBase, chunkIndex),
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

    if (i + CHUNK_SIZE < recipients.length) {
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
  });
});
