import { createClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";
import { authorizeCronOrAdmin } from "../_shared/cronAuth.ts";
import {
  processCallFunnelCrm,
  processGrokBotContactCrm,
} from "../_shared/callFunnelCrm.ts";
import { processCallFunnelMail } from "../_shared/callFunnelMailRuntime.ts";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, apikey, x-client-info, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
  "Cache-Control": "no-store, private",
};
// Runs every 15 minutes from pg_cron: retries owner alerts and CRM webhook
// posts, and sends the reminders. Admins can also trigger it manually.
Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { headers });
  if (request.method !== "POST")
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers,
    });
  const auth = await authorizeCronOrAdmin(request, headers);
  if (auth instanceof Response) return auth;
  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    // A CRM outage never holds up the emails.
    const grokWebhookUrl = Deno.env.get("GROK_BOT_GHL_WEBHOOK_URL");
    const [mail, crm, contacts] = await Promise.all([
      processCallFunnelMail(admin, Deno.env.get("RESEND_API_KEY")),
      processCallFunnelCrm(admin, { grokWebhookUrl }).catch(() => {
        console.error("Call funnel CRM webhook worker unavailable");
        return { configured: true, sent: 0, failed: true };
      }),
      processGrokBotContactCrm(admin, { grokWebhookUrl }).catch(() => {
        console.error("Grok Bot contact CRM webhook worker unavailable");
        return { configured: true, sent: 0, failed: true };
      }),
    ]);
    return new Response(JSON.stringify({ ...mail, crm, contacts }), { headers });
  } catch {
    console.error("Call funnel mail worker unavailable");
    return new Response(
      JSON.stringify({
        error:
          "Call funnel email is temporarily unavailable. Saved applications are unaffected.",
      }),
      { status: 503, headers },
    );
  }
});
