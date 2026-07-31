import { createFileRoute } from "@tanstack/react-router";

const BASE = "https://brianhanson.com/newsletter";

export const Route = createFileRoute("/api/public/newsletter/confirm")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const token = new URL(request.url).searchParams.get("token");
        if (!token) return Response.redirect(`${BASE}/invalid`, 302);

        const { supabaseAdmin } = await import(
          "@/integrations/supabase/client.server"
        );
        const { data: row } = await supabaseAdmin
          .from("newsletter_subscribers")
          .select("id, status")
          .eq("confirm_token", token)
          .maybeSingle();

        if (!row) return Response.redirect(`${BASE}/invalid`, 302);

        if (row.status === "pending") {
          await supabaseAdmin
            .from("newsletter_subscribers")
            .update({ status: "confirmed", confirmed_at: new Date().toISOString() })
            .eq("id", row.id);
        }
        return Response.redirect(`${BASE}/confirmed`, 302);
      },
    },
  },
});
