import { createFileRoute } from "@tanstack/react-router";

const REDIRECT = "https://brianhanson.com/newsletter/unsubscribed";

export const Route = createFileRoute("/api/public/newsletter/unsubscribe")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const token = new URL(request.url).searchParams.get("token");
        if (token) {
          const { supabaseAdmin } = await import(
            "@/integrations/supabase/client.server"
          );
          const { data: row } = await supabaseAdmin
            .from("newsletter_subscribers")
            .select("id")
            .eq("confirm_token", token)
            .maybeSingle();
          if (row) {
            await supabaseAdmin
              .from("newsletter_subscribers")
              .update({
                status: "unsubscribed",
                unsubscribed_at: new Date().toISOString(),
              })
              .eq("id", row.id);
          }
        }
        return Response.redirect(REDIRECT, 302);
      },
    },
  },
});
