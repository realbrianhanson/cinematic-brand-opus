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

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";
import { authorizeCronOrAdmin } from "../_shared/cronAuth.ts";
import {
  buildConfirmationEmail,
  isValidEmail,
  type NewsletterConfig,
  resolveNewsletterConfig,
  type SubscribeState,
  subscribeResponseFor,
} from "../_shared/newsletterConfig.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MAX_BODY_BYTES = 2048;
const EMAIL_LIMIT = 3; // confirmation requests per address...
const EMAIL_WINDOW_SECONDS = 24 * 60 * 60; // ...per 24h
const IP_LIMIT = 8; // requests per IP...
const IP_WINDOW_SECONDS = 60 * 60; // ...per hour
const RESEND_COOLDOWN_SECONDS = 15 * 60; // min gap between confirmations

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function readBoundedJson(req: Request): Promise<Record<string, unknown> | null> {
  const raw = await req.text();
  if (raw.length === 0 || raw.length > MAX_BODY_BYTES) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
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
  admin: ReturnType<typeof createClient>,
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
): Promise<{ ok: boolean; error?: string }> {
  const { subject, html } = buildConfirmationEmail(config, token);
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
      // Same address + same token must never produce two emails.
      "Idempotency-Key": `nl-confirm-${token}`,
    },
    body: JSON.stringify({
      from: config.fromAddress,
      to: [email],
      reply_to: config.replyTo,
      subject,
      html,
    }),
  });
  if (!res.ok) return { ok: false, error: `Resend ${res.status}: ${await res.text()}` };
  return { ok: true };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { ok: false, error: "Method not allowed" });

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
    const { data: pending } = await admin
      .from("newsletter_subscribers")
      .select("email, confirm_token")
      .eq("status", "pending")
      .limit(50);
    let sent = 0;
    let failed = 0;
    for (const p of pending ?? []) {
      const r = await sendConfirmation(resolved.config, p.email, p.confirm_token);
      if (r.ok) {
        sent++;
        await admin
          .from("newsletter_subscribers")
          .update({ last_confirmation_sent_at: new Date().toISOString() })
          .eq("email", p.email);
      } else {
        failed++;
        console.error("resend_pending failed:", r.error);
      }
    }
    return json(200, { ok: true, sent, failed });
  }

  // ---- Public subscribe ----------------------------------------------------
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!isValidEmail(email)) {
    return json(400, { ok: false, state: "invalid_email" });
  }
  const source = typeof body.source === "string" ? body.source.slice(0, 64) : null;

  // Fail closed BEFORE any subscriber mutation.
  if (!resolved.ok) {
    console.error("newsletter unavailable, missing:", resolved.missing.join(", "));
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

  const { data: rows, error: rpcErr } = await admin.rpc("newsletter_public_subscribe", {
    _email: email,
    _source: source,
    _cooldown_seconds: RESEND_COOLDOWN_SECONDS,
  });
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
    console.error("newsletter confirmation send failed:", sendRes.error);
    // Allow another attempt after the provider problem is resolved.
    await admin
      .from("newsletter_subscribers")
      .update({ last_confirmation_sent_at: null })
      .eq("email", email);
    return json(502, { ok: false, state: "send_failed" });
  }

  const mapped = subscribeResponseFor("confirmation_due");
  return json(mapped.status, { ...mapped.body, site_name: config.siteName });
});
