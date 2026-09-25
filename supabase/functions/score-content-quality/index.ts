import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { applyTitleLint, scoreContent } from "../_shared/voice.ts";

/** Largest unsaved content_json accepted for a preview score. */
const MAX_PREVIEW_BYTES = 512 * 1024;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Auth: verify caller is admin
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const anonClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    {
      global: { headers: { Authorization: authHeader } },
    },
  );
  const {
    data: { user },
    error: userErr,
  } = await anonClient.auth.getUser();
  if (userErr || !user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const { data: roleRow } = await anonClient
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .eq("role", "admin")
    .maybeSingle();
  if (!roleRow) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const body = await req.json();
    const page_id = body?.page_id;
    // Optional: score unsaved editor content without storing the result.
    const preview =
      body?.content_json !== undefined
        ? { content_json: body.content_json, title: body.title }
        : null;
    if (!page_id || typeof page_id !== "string") {
      return new Response(JSON.stringify({ error: "page_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: page, error } = await supabase
      .from("generated_pages")
      .select("id, title, content_json, status, updated_at")
      .eq("id", page_id)
      .single();

    if (error || !page) {
      return new Response(JSON.stringify({ error: "Page not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (preview) {
      const content = preview.content_json;
      const title =
        typeof preview.title === "string" && preview.title.trim()
          ? preview.title
          : page.title;
      if (!content || typeof content !== "object" || Array.isArray(content)) {
        return new Response(
          JSON.stringify({ error: "content_json must be a JSON object" }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
      if (JSON.stringify(content).length > MAX_PREVIEW_BYTES) {
        return new Response(
          JSON.stringify({ error: "content_json is too large to score" }),
          {
            status: 413,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
      const { score, issues } = applyTitleLint(
        scoreContent(content, title),
        title,
      );
      return new Response(
        JSON.stringify({
          page_id,
          score,
          issues,
          publishable: score >= 75,
          persisted: false,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // The stored copy is scored and the score saved. Only this service (and
    // the generators) may write quality_score; see migration
    // 20260923152000_resources_and_guides.sql.
    const { score, issues } = applyTitleLint(
      scoreContent(page.content_json, page.title),
      page.title,
    );

    const { data: saved, error: saveErr } = await supabase
      .from("generated_pages")
      .update({ quality_score: score })
      .eq("id", page_id)
      .eq("updated_at", page.updated_at)
      .select("id")
      .maybeSingle();
    if (saveErr)
      throw new Error(`Could not save the score: ${saveErr.message}`);
    if (!saved)
      return new Response(
        JSON.stringify({
          error:
            "This page changed during the quality check. Run the check again for the latest saved content.",
          persisted: false,
        }),
        {
          status: 409,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );

    return new Response(
      JSON.stringify({
        page_id,
        score,
        issues,
        publishable: score >= 75,
        persisted: true,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
