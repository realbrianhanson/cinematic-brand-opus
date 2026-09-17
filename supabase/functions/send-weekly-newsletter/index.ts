// Deliver a frozen weekly digest using durable, per-recipient receipts.
// An interrupted/ambiguous attempt requires review; it is never replayed blindly.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";
import { authorizeCronOrAdmin } from "../_shared/cronAuth.ts";
import {
  buildHtml,
  isoWeekKey,
  type Composed,
  type PostRow,
} from "../_shared/newsletter-compose.ts";
import { resolveNewsletterConfig } from "../_shared/newsletterConfig.ts";
import {
  deliverNewsletter,
  TOKEN_PLACEHOLDER,
  type DeliveryBatch,
} from "../_shared/newsletterDelivery.ts";

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
  try {
    const { data: settings, error: settingsError } = await admin
      .from("site_settings")
      .select(
        "site_url, site_name, author_name, newsletter_from_address, newsletter_reply_to, newsletter_postal_address",
      )
      .limit(1)
      .maybeSingle();
    if (settingsError) throw settingsError;
    const resolved = resolveNewsletterConfig(
      settings,
      Deno.env.get("RESEND_API_KEY"),
    );
    if (!resolved.ok)
      return json(503, {
        ok: false,
        state: "unavailable",
        missing: resolved.missing,
      });
    const config = resolved.config;
    if (!config.postalAddress)
      return json(503, {
        ok: false,
        state: "unavailable",
        missing: ["site_settings.newsletter_postal_address"],
      });
    const weekKey = isoWeekKey(new Date());
    const { data: existing, error: readError } = await admin
      .from("newsletter_sends")
      .select(
        "id,status,subject,intro,post_blurbs,post_ids,delivery_template,sent_count,recipient_count,updated_at",
      )
      .eq("week_key", weekKey)
      .maybeSingle();
    if (readError) throw readError;
    // A missing preview is a visible setup/run failure, not permission to compose
    // and send unseen content during a delivery retry.
    if (!existing)
      return json(409, {
        ok: false,
        state: "missing_preview",
        week_key: weekKey,
      });
    if (["sent", "cancelled", "needs_review"].includes(existing.status)) {
      return json(200, {
        ok: existing.status !== "needs_review",
        state: existing.status,
        sent: existing.sent_count,
        recipients: existing.recipient_count,
      });
    }
    let template = existing.delivery_template;
    if (!template && existing.status === "preview") {
      const composed: Composed = {
        subject: existing.subject || "",
        intro: existing.intro || "",
        post_blurbs: Array.isArray(existing.post_blurbs)
          ? (existing.post_blurbs as Composed["post_blurbs"])
          : [],
      };
      const postIds: string[] = existing.post_ids ?? [];
      if (!postIds.length || !composed.subject)
        return json(409, { ok: false, state: "incomplete_preview" });
      const { data: postRows, error } = await admin
        .from("posts")
        .select("id,title,slug,excerpt,tldr,quality_score")
        .in("id", postIds)
        .eq("status", "published");
      if (error) throw error;
      const posts = (postRows || []) as PostRow[];
      if (posts.length !== postIds.length)
        return json(409, { ok: false, state: "preview_posts_changed" });
      posts.sort((a, b) => postIds.indexOf(a.id) - postIds.indexOf(b.id));
      template = {
        from: config.fromAddress,
        reply_to: config.replyTo,
        subject: composed.subject,
        html: buildHtml(composed, posts, TOKEN_PLACEHOLDER, config),
      };
    }
    const lease = crypto.randomUUID();
    const { data: prepared, error: prepareError } = await admin.rpc(
      "newsletter_prepare_delivery",
      {
        _send_id: existing.id,
        _lease: lease,
        _template: template,
        _expected_updated_at: existing.updated_at,
      },
    );
    if (prepareError) throw prepareError;
    if (!prepared) {
      const { data: current, error } = await admin
        .from("newsletter_sends")
        .select("status,sent_count,recipient_count")
        .eq("id", existing.id)
        .single();
      if (error) throw error;
      return json(200, {
        ok: current.status !== "needs_review",
        state: current.status,
        sent: current.sent_count,
        recipients: current.recipient_count,
      });
    }
    let calls = 0;
    const result = await deliverNewsletter(existing.id, {
      async nextBatch() {
        const { data, error } = await admin.rpc(
          "newsletter_next_delivery_batch",
          { _send_id: existing.id, _lease: lease },
        );
        if (error) throw error;
        return data as DeliveryBatch | null;
      },
      async record(batch, outcome, ids, detail) {
        const { error } = await admin.rpc("newsletter_record_delivery", {
          _send_id: existing.id,
          _lease: lease,
          _attempt_id: batch.attempt_id,
          _outcome: outcome,
          _provider_ids: ids,
          _detail: detail ?? null,
        });
        if (error) throw error;
      },
      async send(payload, key) {
        if (calls++ > 0)
          await new Promise((resolve) => setTimeout(resolve, 600));
        return fetch("https://api.resend.com/emails/batch", {
          method: "POST",
          signal: AbortSignal.timeout(15000),
          headers: {
            Authorization: `Bearer ${config.apiKey}`,
            "Content-Type": "application/json",
            "Idempotency-Key": key,
          },
          body: JSON.stringify(payload),
        });
      },
    });
    const { data: totals, error: totalsError } = await admin
      .from("newsletter_sends")
      .select("sent_count,recipient_count")
      .eq("id", existing.id)
      .single();
    if (totalsError) throw totalsError;
    return json(result.state === "sent" ? 200 : 502, {
      ok: result.state === "sent",
      state: result.state,
      week_key: weekKey,
      sent: totals.sent_count,
      recipients: totals.recipient_count,
    });
  } catch (error) {
    console.error(
      "Newsletter delivery failed",
      error instanceof Error
        ? error.message
        : "Database or provider unavailable",
    );
    return json(503, {
      ok: false,
      state: "unavailable",
      error: "Delivery stopped. Inspect the delivery receipts before retrying.",
    });
  }
});
