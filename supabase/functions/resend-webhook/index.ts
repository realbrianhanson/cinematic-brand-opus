import { createClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";
import { Webhook } from "https://esm.sh/svix@1.24.0";
import { persistVerifiedResendSuppressions } from "../_shared/transactionalEmailSuppression.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, svix-id, svix-timestamp, svix-signature",
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

  const secret = Deno.env.get("RESEND_WEBHOOK_SECRET");
  if (!secret) return json(503, { error: "webhook not configured" });

  const svixId = req.headers.get("svix-id");
  const svixTimestamp = req.headers.get("svix-timestamp");
  const svixSignature = req.headers.get("svix-signature");
  if (!svixId || !svixTimestamp || !svixSignature) {
    return json(400, { error: "missing svix headers" });
  }

  const payload = await req.text();
  let event: unknown;
  try {
    const wh = new Webhook(secret);
    event = wh.verify(payload, {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    });
  } catch {
    console.error("Resend webhook signature verification failed");
    return json(401, { error: "invalid signature" });
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const recorded = await persistVerifiedResendSuppressions(
      event,
      async ({ email, reason }) => {
        const { data, error } = await admin.rpc(
          "record_transactional_email_suppression",
          { _email: email, _reason: reason },
        );
        return !error && data === true;
      },
    );
    return json(200, { ok: true, recorded });
  } catch {
    // Non-2xx asks Resend to retry; never acknowledge a lost suppression event.
    console.error("Resend webhook suppression storage failed");
    return json(503, { error: "Suppression storage temporarily unavailable" });
  }
});
