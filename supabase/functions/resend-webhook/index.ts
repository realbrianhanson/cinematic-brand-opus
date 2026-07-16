import { createClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";
import { Webhook } from "https://esm.sh/svix@1.24.0";

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
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
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
  let event: any;
  try {
    const wh = new Webhook(secret);
    event = wh.verify(payload, {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    });
  } catch (e) {
    console.error("svix verification failed:", (e as Error).message);
    return json(401, { error: "invalid signature" });
  }

  const type: string = event?.type || "";
  if (type !== "email.bounced" && type !== "email.complained") {
    return json(200, { ok: true, ignored: type });
  }

  const to = event?.data?.to;
  const email: string | undefined = Array.isArray(to) ? to[0] : to;
  if (!email || typeof email !== "string") {
    return json(200, { ok: true, ignored: "no recipient" });
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const nextStatus = type === "email.bounced" ? "bounced" : "complained";
  const { error } = await admin
    .from("newsletter_subscribers")
    .update({ status: nextStatus })
    .eq("email", email.toLowerCase().trim());
  if (error) {
    console.error("update failed:", error.message);
    return json(500, { error: error.message });
  }

  return json(200, { ok: true, type, email });
});
