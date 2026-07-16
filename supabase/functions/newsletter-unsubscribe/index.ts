import { createClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";

const REDIRECT = "https://brianhanson.com/newsletter/unsubscribed";

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  if (token) {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: row } = await admin
      .from("newsletter_subscribers")
      .select("id")
      .eq("confirm_token", token)
      .maybeSingle();
    if (row) {
      await admin
        .from("newsletter_subscribers")
        .update({
          status: "unsubscribed",
          unsubscribed_at: new Date().toISOString(),
        })
        .eq("id", row.id);
    }
  }
  return Response.redirect(REDIRECT, 302);
});
