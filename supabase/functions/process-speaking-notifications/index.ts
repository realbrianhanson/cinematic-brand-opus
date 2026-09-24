import { createClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";
import { authorizeCronOrAdmin } from "../_shared/cronAuth.ts";
import { processSpeakingNotifications } from "../_shared/speakingNotificationsRuntime.ts";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, apikey, x-client-info, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
  "Cache-Control": "no-store, private",
};
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
    return new Response(
      JSON.stringify(await processSpeakingNotifications(admin)),
      { headers },
    );
  } catch {
    console.error("Speaking notification worker unavailable");
    return new Response(
      JSON.stringify({
        error:
          "Notification processing is temporarily unavailable. Saved inquiries are unaffected.",
      }),
      { status: 503, headers },
    );
  }
});
