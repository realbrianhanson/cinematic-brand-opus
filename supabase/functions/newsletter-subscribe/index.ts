import { createClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";
import { authorizeCronOrAdmin } from "../_shared/cronAuth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CONFIRM_BASE =
  "https://pwjdotliwsulqktavyxf.supabase.co/functions/v1/newsletter-confirm";

interface SiteSettings {
  newsletter_from_address: string | null;
  newsletter_reply_to: string | null;
  newsletter_postal_address: string | null;
}

function buildEmailHtml(confirmUrl: string, postalAddress: string | null) {
  return `<!doctype html><html><body style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#0b0b12;color:#f3f3f3;margin:0;padding:32px;">
  <div style="max-width:560px;margin:0 auto;background:#12121a;padding:32px;border:1px solid rgba(255,255,255,0.08);">
    <h1 style="font-size:20px;margin:0 0 16px;color:#fff;">Confirm your subscription</h1>
    <p style="font-size:15px;line-height:1.6;color:#d8d8d8;">You (or someone with your email) asked for my weekly AI brief. Click below to confirm and I'll start sending it your way.</p>
    <p style="margin:28px 0;"><a href="${confirmUrl}" style="display:inline-block;background:linear-gradient(135deg,#D4AF55,#B8962E);color:#07070E;padding:14px 28px;text-decoration:none;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;font-size:13px;">Confirm Subscription</a></p>
    <p style="font-size:13px;color:#8a8a8a;">If you didn't request this, ignore this email.</p>
    ${postalAddress ? `<p style="font-size:11px;color:#666;margin-top:32px;border-top:1px solid rgba(255,255,255,0.06);padding-top:16px;">${postalAddress}</p>` : ""}
  </div></body></html>`;
}

async function sendConfirmationEmail(
  apiKey: string,
  settings: SiteSettings,
  email: string,
  token: string,
): Promise<{ ok: boolean; error?: string }> {
  const from = settings.newsletter_from_address ||
    "Brian Hanson <brian@m.brianhanson.com>";
  const confirmUrl = `${CONFIRM_BASE}?token=${token}`;
  const payload: Record<string, unknown> = {
    from,
    to: [email],
    subject: "Confirm your subscription to Brian Hanson's AI Brief",
    html: buildEmailHtml(confirmUrl, settings.newsletter_postal_address),
  };
  if (settings.newsletter_reply_to) {
    payload.reply_to = settings.newsletter_reply_to;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    return { ok: false, error: `Resend ${res.status}: ${await res.text()}` };
  }
  return { ok: true };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let body: { email?: string; source?: string; resend_pending?: boolean } = {};
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const resendKey = Deno.env.get("RESEND_API_KEY");

  const { data: settingsRow } = await admin
    .from("site_settings")
    .select("newsletter_from_address, newsletter_reply_to, newsletter_postal_address")
    .limit(1)
    .maybeSingle();
  const settings: SiteSettings = settingsRow ?? {
    newsletter_from_address: null,
    newsletter_reply_to: null,
    newsletter_postal_address: null,
  };

  // Admin-only: resend pending confirmations
  if (body.resend_pending === true) {
    const authz = await authorizeCronOrAdmin(req, corsHeaders);
    if (authz instanceof Response) return authz;
    if (!resendKey) {
      return new Response(
        JSON.stringify({ ok: false, error: "RESEND_API_KEY not configured" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const { data: pending } = await admin
      .from("newsletter_subscribers")
      .select("email, confirm_token")
      .eq("status", "pending")
      .limit(50);
    let sent = 0;
    let failed = 0;
    for (const p of pending ?? []) {
      const r = await sendConfirmationEmail(resendKey, settings, p.email, p.confirm_token);
      if (r.ok) sent++;
      else failed++;
    }
    return new Response(JSON.stringify({ ok: true, sent, failed }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Public subscribe
  const rawEmail = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!rawEmail || rawEmail.length > 254 || !EMAIL_RE.test(rawEmail)) {
    return new Response(JSON.stringify({ error: "Invalid email" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const source = typeof body.source === "string" ? body.source.slice(0, 64) : null;

  // Rate limit: >100 new subs in last hour
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count } = await admin
    .from("newsletter_subscribers")
    .select("id", { count: "exact", head: true })
    .gte("created_at", hourAgo);
  if ((count ?? 0) > 100) {
    return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
      status: 429,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: existing } = await admin
    .from("newsletter_subscribers")
    .select("id, status, confirm_token")
    .eq("email", rawEmail)
    .maybeSingle();

  let confirmToken: string;

  if (existing) {
    if (existing.status === "confirmed") {
      return new Response(JSON.stringify({ ok: true, state: "already_subscribed" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (existing.status === "unsubscribed") {
      confirmToken = crypto.randomUUID();
      const { error: updErr } = await admin
        .from("newsletter_subscribers")
        .update({
          status: "pending",
          confirm_token: confirmToken,
          unsubscribed_at: null,
          source: source ?? undefined,
        })
        .eq("id", existing.id);
      if (updErr) {
        return new Response(JSON.stringify({ error: updErr.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } else {
      // pending / bounced / complained — reuse or refresh token
      confirmToken = existing.confirm_token ?? crypto.randomUUID();
      if (!existing.confirm_token || existing.status !== "pending") {
        await admin
          .from("newsletter_subscribers")
          .update({ status: "pending", confirm_token: confirmToken })
          .eq("id", existing.id);
      }
    }
  } else {
    confirmToken = crypto.randomUUID();
    const { error: insErr } = await admin
      .from("newsletter_subscribers")
      .insert({
        email: rawEmail,
        status: "pending",
        confirm_token: confirmToken,
        source,
      });
    if (insErr) {
      return new Response(JSON.stringify({ error: insErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  if (!resendKey) {
    return new Response(JSON.stringify({ ok: true, state: "pending_email_setup" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const sendRes = await sendConfirmationEmail(resendKey, settings, rawEmail, confirmToken);
  if (!sendRes.ok) {
    console.error("newsletter-subscribe send failed:", sendRes.error);
    return new Response(
      JSON.stringify({ ok: false, error: "Failed to send confirmation email" }),
      { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  return new Response(JSON.stringify({ ok: true, state: "confirmation_sent" }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
