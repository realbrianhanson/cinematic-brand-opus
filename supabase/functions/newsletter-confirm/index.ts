// Public confirmation endpoint. Redirect targets come from site_settings.site_url
// (never hardcoded), and suppressed / unsubscribed rows are NOT reactivated here.

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
    // Fail closed rather than redirect somewhere arbitrary.
    return new Response("Newsletter is not configured.", { status: 503 });
  }
  const base = `${siteUrl}/newsletter`;

  const token = new URL(req.url).searchParams.get("token");
  if (!token) return Response.redirect(`${base}/invalid`, 302);

  const { data: row } = await admin
    .from("newsletter_subscribers")
    .select("id, status")
    .eq("confirm_token", token)
    .maybeSingle();

  if (!row) return Response.redirect(`${base}/invalid`, 302);

  if (row.status === "pending") {
    await admin
      .from("newsletter_subscribers")
      .update({ status: "confirmed", confirmed_at: new Date().toISOString() })
      .eq("id", row.id);
    return Response.redirect(`${base}/confirmed`, 302);
  }

  if (row.status === "confirmed") {
    return Response.redirect(`${base}/confirmed`, 302);
  }

  // unsubscribed / bounced / complained: never resurrected by a stale link.
  return Response.redirect(`${base}/invalid`, 302);
});
