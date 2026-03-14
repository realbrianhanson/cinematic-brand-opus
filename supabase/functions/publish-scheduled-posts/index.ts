import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: getCorsHeaders(req) });
  }

  // Auth: verify caller is admin
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: claims, error: claimsErr } = await anonClient.auth.getClaims(authHeader.replace("Bearer ", ""));
  if (claimsErr || !claims?.claims?.sub) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }

  try {
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const now = new Date().toISOString();

    // Find all posts that are scheduled and whose scheduled_at has passed
    const { data: posts, error: fetchError } = await supabase
      .from("posts")
      .select("id, title, scheduled_at")
      .eq("status", "scheduled")
      .lte("scheduled_at", now);

    if (fetchError) throw fetchError;

    if (!posts || posts.length === 0) {
      return new Response(JSON.stringify({ published: 0, message: "No posts to publish" }), {
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const ids = posts.map((p) => p.id);

    const { error: updateError } = await supabase
      .from("posts")
      .update({ status: "published", updated_at: now })
      .in("id", ids);

    if (updateError) throw updateError;

    console.log(`Published ${ids.length} scheduled post(s):`, ids);

    return new Response(
      JSON.stringify({ published: ids.length, ids }),
      { headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("Error publishing scheduled posts:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }
});
