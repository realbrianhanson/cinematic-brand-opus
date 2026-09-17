import { createFileRoute } from "@tanstack/react-router";
import { normalizeSiteUrl } from "@/lib/newsletterConfig";

export const Route = createFileRoute("/api/public/newsletter/confirm")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { supabaseAdmin } = await import(
          "@/integrations/supabase/client.server"
        );

        const { data: settings } = await supabaseAdmin
          .from("site_settings")
          .select("site_url")
          .limit(1)
          .maybeSingle();

        const siteUrl = normalizeSiteUrl(settings?.site_url);
        if (!siteUrl) {
          return new Response("Newsletter is not configured.", { status: 503 });
        }
        const base = `${siteUrl}/newsletter`;

        const token = new URL(request.url).searchParams.get("token");
        if (!token) return Response.redirect(`${base}/invalid`, 302);

        const { data: row } = await supabaseAdmin
          .from("newsletter_subscribers")
          .select("id, status")
          .eq("confirm_token", token)
          .maybeSingle();

        if (!row) return Response.redirect(`${base}/invalid`, 302);

        if (row.status === "pending") {
          await supabaseAdmin
            .from("newsletter_subscribers")
            .update({ status: "confirmed", confirmed_at: new Date().toISOString() })
            .eq("id", row.id);
          return Response.redirect(`${base}/confirmed`, 302);
        }

        if (row.status === "confirmed") {
          return Response.redirect(`${base}/confirmed`, 302);
        }

        // unsubscribed / bounced / complained are never reactivated here.
        return Response.redirect(`${base}/invalid`, 302);
      },
    },
  },
});
