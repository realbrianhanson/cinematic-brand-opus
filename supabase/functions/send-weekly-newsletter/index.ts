// Deliver a frozen weekly digest using durable, per-recipient receipts.
// An interrupted/ambiguous attempt requires review; it is never replayed blindly.
// The stored row is the only source of truth for the reported state: a send is
// 'sent' only when every eligible recipient was accepted by the provider.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";
import { readBoundedJson } from "../_shared/boundedJson.ts";
import { authorizeCronOrAdmin } from "../_shared/cronAuth.ts";
import {
  buildHtml,
  hasContradictedClaims,
  isoWeekKey,
  type Composed,
  type PostRow,
} from "../_shared/newsletter-compose.ts";
import { resolveNewsletterConfig } from "../_shared/newsletterConfig.ts";
import {
  deliverNewsletter,
  sendOutcomeResponse,
  TOKEN_PLACEHOLDER,
  type DeliveryBatch,
} from "../_shared/newsletterDelivery.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TERMINAL = ["sent", "failed", "cancelled", "needs_review"];
const OUTCOME_COLUMNS =
  "status,sent_count,recipient_count,last_error,last_error_status";

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
  const body = (await readBoundedJson(req)) ?? {};
  // Admins may resume/retry a specific issue; cron always sends this week's.
  const requestedId =
    auth.mode === "admin" && typeof body.send_id === "string"
      ? body.send_id
      : null;
  if (requestedId !== null && !UUID_RE.test(requestedId))
    return json(400, { ok: false, error: "Invalid send_id" });
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const outcome = async (id: string, extra: Record<string, unknown> = {}) => {
    const { data, error } = await admin
      .from("newsletter_sends")
      .select(OUTCOME_COLUMNS)
      .eq("id", id)
      .single();
    if (error) throw error;
    const response = sendOutcomeResponse(data);
    return json(response.httpStatus, { ...response.body, ...extra });
  };
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
    let lookup = admin
      .from("newsletter_sends")
      .select(
        "id,week_key,status,subject,intro,post_blurbs,post_ids,delivery_template,updated_at",
      );
    lookup = requestedId
      ? lookup.eq("id", requestedId)
      : lookup.eq("week_key", weekKey);
    const { data: existing, error: readError } = await lookup.maybeSingle();
    if (readError) throw readError;
    // A missing preview is a visible setup/run failure, not permission to compose
    // and send unseen content during a delivery retry.
    if (!existing)
      return json(409, {
        ok: false,
        state: "missing_preview",
        week_key: requestedId ? null : weekKey,
      });
    if (TERMINAL.includes(existing.status)) return await outcome(existing.id);
    // send_id only continues an issue already in delivery (retry/resume); it
    // never starts an unsent preview from another week.
    if (requestedId && existing.status !== "sending")
      return json(409, {
        ok: false,
        state: existing.status,
        error: "Only an issue that is already being delivered can be resumed.",
      });
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
        .select("id,title,slug,excerpt,tldr,quality_score,fact_check")
        .in("id", postIds)
        .eq("status", "published");
      if (error) throw error;
      const rows = (postRows || []) as Array<
        PostRow & { fact_check?: unknown }
      >;
      if (rows.length !== postIds.length)
        return json(409, { ok: false, state: "preview_posts_changed" });
      // A claim contradicted after the preview was composed blocks the send.
      const flagged = rows.filter((p) => hasContradictedClaims(p.fact_check));
      if (flagged.length)
        return json(409, {
          ok: false,
          state: "preview_posts_flagged",
          error: `Regenerate the preview: ${flagged.length} post(s) now have contradicted fact-check claims.`,
        });
      const posts: PostRow[] = rows
        .map(({ fact_check: _factCheck, ...post }) => post)
        .sort((a, b) => postIds.indexOf(a.id) - postIds.indexOf(b.id));
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
    if (!prepared) return await outcome(existing.id);
    let calls = 0;
    const result = await deliverNewsletter(existing.id, {
      unsubscribeUrl: config.unsubscribeUrl,
      async nextBatch() {
        const { data, error } = await admin.rpc(
          "newsletter_next_delivery_batch",
          { _send_id: existing.id, _lease: lease },
        );
        if (error) throw error;
        return data as DeliveryBatch | null;
      },
      async record(batch, state, ids, detail, providerStatus) {
        const { error } = await admin.rpc("newsletter_record_delivery", {
          _send_id: existing.id,
          _lease: lease,
          _attempt_id: batch.attempt_id,
          _outcome: state,
          _provider_ids: ids,
          _detail: detail ?? null,
          _provider_status: providerStatus ?? null,
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
    if (result.failure)
      console.error("Newsletter delivery stopped:", result.failure.detail);
    return await outcome(existing.id, { week_key: existing.week_key });
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
