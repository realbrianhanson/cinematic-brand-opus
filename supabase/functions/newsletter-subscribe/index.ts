import { readBoundedJson } from "../_shared/boundedJson.ts";
// Public double-opt-in subscribe endpoint.
//
// Safety properties:
//  - All brand/URL/sender values come from validated site_settings. Nothing is
//    hardcoded, so the theme is portable across PushTen client sites.
//  - Fails closed: when sender / reply-to / site URL / RESEND_API_KEY are not
//    configured we return a truthful "unavailable" response BEFORE touching the
//    subscribers table. We never claim success without sending.
//  - Durable atomic throttling in Postgres (per email + per IP) plus a DB-side
//    cooldown, so repeat requests cannot spam confirmation emails.
//  - Suppressed recipients (bounced / complained) are never reactivated here.
//  - Concurrent requests for the same address are serialized by the DB function.

import {
  createClient,
  type SupabaseClient,
} from "https://esm.sh/@supabase/supabase-js@2.97.0";
import { authorizeCronOrAdmin } from "../_shared/cronAuth.ts";
import {
  buildConfirmationEmail,
  isValidEmail,
  type NewsletterConfig,
  resolveNewsletterConfig,
  type SubscribeState,
  subscribeResponseFor,
} from "../_shared/newsletterConfig.ts";
import { providerErrorDetail } from "../_shared/newsletterDelivery.ts";
import {
  type PendingRow,
  RESEND_COOLDOWN_SECONDS,
  resendPendingConfirmations,
  type ResendPort,
  type SendOutcome,
} from "./resendPending.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const EMAIL_LIMIT = 3; // confirmation requests per address...
const EMAIL_WINDOW_SECONDS = 24 * 60 * 60; // ...per 24h
const IP_LIMIT = 8; // requests per IP...
const IP_WINDOW_SECONDS = 60 * 60; // ...per hour

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function hashed(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest))
    .slice(0, 16)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for") ?? "";
  const first = fwd.split(",")[0]?.trim();
  return first || req.headers.get("cf-connecting-ip") || "unknown";
}

async function allowed(
  admin: SupabaseClient,
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<boolean> {
  const { data, error } = await admin.rpc("newsletter_rate_limit_hit", {
    _key: key,
    _limit: limit,
    _window_seconds: windowSeconds,
  });
  // Fail closed: if the limiter is unavailable we refuse rather than allow.
  if (error) {
    console.error("rate limiter failed:", error.message);
    return false;
  }
  return data === true;
}

async function sendConfirmation(
  config: NewsletterConfig,
  email: string,
  token: string,
  idempotencyKey = `nl-confirm-${token}`,
): Promise<SendOutcome> {
  const { subject, html } = buildConfirmationEmail(config, token);
  try {
    const res = await fetch("https://api.resend.com/emails", {
      signal: AbortSignal.timeout(15000),
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
        // Same address + same token (+ same claim) must never produce two emails.
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify({
        from: config.fromAddress,
        to: [email],
        reply_to: config.replyTo,
        subject,
        html,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return {
        ok: false,
        status: res.status,
        detail: providerErrorDetail(res.status, body),
      };
    }
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      status: null,
      detail:
        error instanceof Error
          ? `Provider request failed: ${error.message}`
          : "Provider request failed",
    };
  }
}

function resendPort(
  admin: SupabaseClient,
  config: NewsletterConfig,
): ResendPort {
  return {
    async listPending(limit: number) {
      const { data, error } = await admin
        .from("newsletter_subscribers")
        .select(
          "email, confirm_token, last_confirmation_sent_at, confirmation_send_count",
        )
        .eq("status", "pending")
        .order("created_at", { ascending: true })
        .limit(limit);
      if (error) throw new Error(error.message);
      return (data ?? []) as PendingRow[];
    },
    async countPending() {
      const { count, error } = await admin
        .from("newsletter_subscribers")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending");
      if (error) throw new Error(error.message);
      return count ?? 0;
    },
    // Claim before sending; concurrent public/admin retries cannot both send.
    async claim(row: PendingRow, claimIso: string) {
      let claim = admin
        .from("newsletter_subscribers")
        .update({ last_confirmation_sent_at: claimIso })
        .eq("email", row.email)
        .eq("confirm_token", row.confirm_token)
        .eq("status", "pending");
      claim = row.last_confirmation_sent_at
        ? claim.eq("last_confirmation_sent_at", row.last_confirmation_sent_at)
        : claim.is("last_confirmation_sent_at", null);
      const { data, error } = await claim.select("email").maybeSingle();
      if (error) throw new Error(error.message);
      return !!data;
    },
    async release(row: PendingRow, claimIso: string) {
      const { error } = await admin
        .from("newsletter_subscribers")
        .update({ last_confirmation_sent_at: row.last_confirmation_sent_at })
        .eq("email", row.email)
        .eq("confirm_token", row.confirm_token)
        .eq("last_confirmation_sent_at", claimIso);
      if (error) console.error("resend_pending release failed:", error.message);
    },
    async confirmSent(row: PendingRow, claimIso: string) {
      const { error } = await admin
        .from("newsletter_subscribers")
        .update({
          confirmation_send_count: (row.confirmation_send_count ?? 0) + 1,
        })
        .eq("email", row.email)
        .eq("confirm_token", row.confirm_token)
        .eq("last_confirmation_sent_at", claimIso);
      if (error) console.error("resend_pending count failed:", error.message);
    },
    send: (row: PendingRow, key: string) =>
      sendConfirmation(config, row.email, row.confirm_token, key),
    now: () => new Date(),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST")
    return json(405, { ok: false, error: "Method not allowed" });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const body = await readBoundedJson(req);
  if (!body) return json(400, { ok: false, error: "Invalid request body" });

  const { data: settingsRow } = await admin
    .from("site_settings")
    .select(
      "site_url, site_name, author_name, newsletter_from_address, newsletter_reply_to, newsletter_postal_address",
    )
    .limit(1)
    .maybeSingle();

  const resolved = resolveNewsletterConfig(
    settingsRow,
    Deno.env.get("RESEND_API_KEY"),
  );

  // ---- Admin-only: resend pending confirmations -----------------------------
  if (body.resend_pending === true) {
    const authz = await authorizeCronOrAdmin(req, corsHeaders);
    if (authz instanceof Response) return authz;
    if (!resolved.ok) {
      return json(503, {
        ok: false,
        state: "unavailable",
        missing: resolved.missing,
      });
    }
    try {
      const result = await resendPendingConfirmations(
        resendPort(admin, resolved.config),
      );
      if (result.error) console.error("resend_pending:", result.error);
      return json(result.ok ? 200 : 502, result);
    } catch (error) {
      console.error(
        "resend_pending unavailable:",
        error instanceof Error ? error.message : error,
      );
      return json(503, {
        ok: false,
        state: "unavailable",
        error: "Pending subscribers could not be read. Try again shortly.",
      });
    }
  }

  // ---- Public subscribe ----------------------------------------------------
  const email =
    typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!isValidEmail(email)) {
    return json(400, { ok: false, state: "invalid_email" });
  }
  const source =
    typeof body.source === "string" ? body.source.slice(0, 64) : null;

  // Fail closed BEFORE any subscriber mutation.
  if (!resolved.ok) {
    console.error(
      "newsletter unavailable, missing:",
      resolved.missing.join(", "),
    );
    return json(503, { ok: false, state: "unavailable" });
  }
  const config = resolved.config;

  const ipKey = `ip:${await hashed(clientIp(req))}`;
  const emailKey = `email:${await hashed(email)}`;

  if (!(await allowed(admin, ipKey, IP_LIMIT, IP_WINDOW_SECONDS))) {
    return json(429, { ok: false, state: "rate_limited" });
  }
  if (!(await allowed(admin, emailKey, EMAIL_LIMIT, EMAIL_WINDOW_SECONDS))) {
    return json(429, { ok: false, state: "rate_limited" });
  }

  const { data: rows, error: rpcErr } = await admin.rpc(
    "newsletter_public_subscribe",
    {
      _email: email,
      _source: source,
      _cooldown_seconds: RESEND_COOLDOWN_SECONDS,
    },
  );
  if (rpcErr) {
    console.error("newsletter_public_subscribe failed:", rpcErr.message);
    return json(500, { ok: false, state: "error" });
  }

  const row = Array.isArray(rows) ? rows[0] : rows;
  const state = (row?.state ?? "error") as SubscribeState;

  if (state !== "confirmation_due") {
    const mapped = subscribeResponseFor(state);
    return json(mapped.status, mapped.body);
  }

  const sendRes = await sendConfirmation(config, email, row!.token as string);
  if (!sendRes.ok) {
    console.error("newsletter confirmation send failed:", sendRes.detail);
    // Allow another attempt after the provider problem is resolved.
    await admin
      .from("newsletter_subscribers")
      .update({ last_confirmation_sent_at: null })
      .eq("email", email)
      .eq("confirm_token", row!.token as string)
      .eq("status", "pending");
    return json(502, { ok: false, state: "send_failed" });
  }

  const mapped = subscribeResponseFor("confirmation_due");
  return json(mapped.status, mapped.body);
});
