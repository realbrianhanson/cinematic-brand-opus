// Public unsubscribe endpoint. Redirect target comes from site_settings.site_url.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";
import { normalizeSiteUrl } from "../_shared/newsletterConfig.ts";

Deno.serve(async (req) => {
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: settings } = await admin
    .from("site_settings")
    .select("site_url")
    .limit(1)
    .maybeSingle();

  const siteUrl = normalizeSiteUrl(settings?.site_url);
  if (!siteUrl) {
    return new Response("Newsletter is not configured.", { status: 503 });
  }
  const base = `${siteUrl}/newsletter`;

  const token = new URL(req.url).searchParams.get("token");
  if (token) {
    const { data: row, error: readError } = await admin
      .from("newsletter_subscribers")
      .select("id, status")
      .eq("confirm_token", token)
      .maybeSingle();
    if (readError)
      return new Response("Unable to unsubscribe right now.", { status: 503 });
    // Suppressed rows keep their status; only active ones move to unsubscribed.
    if (row && (row.status === "confirmed" || row.status === "pending")) {
      const { error: updateError } = await admin
        .from("newsletter_subscribers")
        .update({
          status: "unsubscribed",
          unsubscribed_at: new Date().toISOString(),
        })
        .eq("id", row.id)
        .eq("confirm_token", token)
        .in("status", ["confirmed", "pending"]);
      if (updateError)
        return new Response("Unable to unsubscribe right now.", {
          status: 503,
        });
    }
  }
  return Response.redirect(`${base}/unsubscribed`, 302);
});
