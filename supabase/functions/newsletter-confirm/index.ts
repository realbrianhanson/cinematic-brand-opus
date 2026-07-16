import { createClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";

const BASE = "https://brianhanson.com/newsletter";

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  if (!token) {
    return Response.redirect(`${BASE}/invalid`, 302);
  }
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const { data: row } = await admin
    .from("newsletter_subscribers")
    .select("id, status")
    .eq("confirm_token", token)
    .maybeSingle();
  if (!row) {
    return Response.redirect(`${BASE}/invalid`, 302);
  }
  if (row.status === "pending") {
    await admin
      .from("newsletter_subscribers")
      .update({ status: "confirmed", confirmed_at: new Date().toISOString() })
      .eq("id", row.id);
  }
  return Response.redirect(`${BASE}/confirmed`, 302);
});
