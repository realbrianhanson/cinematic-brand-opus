import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGINS = [
  "https://cinematic-brand-opus.lovable.app",
  /^https:\/\/.*--aad54f9f-2dc1-4e99-9396-88f3e07eb70c\.lovable\.app$/,
];
const getAllowedOrigin = (req: Request) => {
  const origin = req.headers.get("Origin") ?? "";
  const allowed = ALLOWED_ORIGINS.some((o) => typeof o === "string" ? o === origin : o.test(origin));
  return allowed ? origin : ALLOWED_ORIGINS[0] as string;
};
const getCorsHeaders = (req: Request) => ({
  "Access-Control-Allow-Origin": getAllowedOrigin(req),
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  // Auth: verify caller is admin
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }
  const anonClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: claims, error: claimsErr } = await anonClient.auth.getClaims(authHeader.replace("Bearer ", ""));
  if (claimsErr || !claims?.claims?.sub) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body = await req.json();
    const { urls, all_unsubmitted } = body;

    // Get site settings
    const { data: settings } = await supabase
      .from("site_settings")
      .select("site_url")
      .limit(1)
      .maybeSingle();

    const siteUrl = (settings?.site_url || "https://example.com").replace(/\/$/, "");
    const host = siteUrl.replace(/^https?:\/\//, "");

    // Get IndexNow key
    const indexNowKey = Deno.env.get("INDEXNOW_KEY");

    let urlList: string[] = [];
    let pageIdMap: Record<string, string> = {}; // url -> page_id

    if (all_unsubmitted) {
      // Find published pages not yet submitted
      const { data: pages } = await supabase
        .from("generated_pages")
        .select("id, slug, content_schema_id, niche_id, content_schemas(slug), niches(slug)")
        .eq("status", "published");

      const { data: existingLogs } = await supabase
        .from("indexing_log")
        .select("page_id")
        .neq("status", "error");

      const submittedIds = new Set((existingLogs || []).map((l: any) => l.page_id));

      for (const pg of pages || []) {
        if (submittedIds.has(pg.id)) continue;
        const contentSlug = (pg as any).content_schemas?.slug;
        const nicheSlug = (pg as any).niches?.slug;
        if (!contentSlug || !nicheSlug) continue;
        const url = `${siteUrl}/resources/${contentSlug}/${nicheSlug}`;
        urlList.push(url);
        pageIdMap[url] = pg.id;
      }

      // Also check pillar pages
      const { data: pillars } = await supabase
        .from("pillar_pages")
        .select("id, slug")
        .eq("status", "published");

      const { data: pillarLogs } = await supabase
        .from("indexing_log")
        .select("page_url")
        .neq("status", "error");

      const submittedUrls = new Set((pillarLogs || []).map((l: any) => l.page_url));

      for (const pp of pillars || []) {
        const url = `${siteUrl}/guides/${pp.slug}`;
        if (submittedUrls.has(url)) continue;
        urlList.push(url);
        pageIdMap[url] = pp.id;
      }
    } else if (urls && Array.isArray(urls)) {
      urlList = urls.map((u: string) => u.startsWith("http") ? u : `${siteUrl}${u}`);
    } else {
      return new Response(
        JSON.stringify({ error: "Provide urls array or all_unsubmitted: true" }),
        { status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    if (urlList.length === 0) {
      return new Response(
        JSON.stringify({ submitted_count: 0, indexnow_status: "no_urls", google_ping_status: "skipped" }),
        { headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    // STEP 1: IndexNow (Bing, Yandex, DuckDuckGo, Naver, Seznam)
    let indexnowStatus = "skipped";
    if (indexNowKey) {
      try {
        // IndexNow supports max 10,000 URLs per request
        const batches: string[][] = [];
        for (let i = 0; i < urlList.length; i += 10000) {
          batches.push(urlList.slice(i, i + 10000));
        }

        for (const batch of batches) {
          const resp = await fetch("https://api.indexnow.org/IndexNow", {
            method: "POST",
            headers: { "Content-Type": "application/json; charset=utf-8" },
            body: JSON.stringify({
              host,
              key: indexNowKey,
              keyLocation: `${siteUrl}/${indexNowKey}.txt`,
              urlList: batch,
            }),
          });
          indexnowStatus = resp.ok ? "ok" : `error_${resp.status}`;
          console.log(`IndexNow response: ${resp.status} for ${batch.length} URLs`);
        }
      } catch (e: any) {
        console.error("IndexNow error:", e);
        indexnowStatus = `error: ${e.message}`;
      }
    } else {
      indexnowStatus = "no_key";
      console.warn("INDEXNOW_KEY not set — skipping IndexNow submission");
    }

    // STEP 2: Google Sitemap Ping
    let googlePingStatus = "skipped";
    try {
      const sitemapUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/generate-sitemap?type=main`;
      const pingUrl = `https://www.google.com/ping?sitemap=${encodeURIComponent(sitemapUrl)}`;
      const resp = await fetch(pingUrl);
      await resp.text();
      googlePingStatus = resp.ok ? "ok" : `error_${resp.status}`;
      console.log(`Google ping response: ${resp.status}`);
    } catch (e: any) {
      console.error("Google ping error:", e);
      googlePingStatus = `error: ${e.message}`;
    }

    // STEP 3: Log results
    const logEntries = urlList.map((url) => ({
      page_id: pageIdMap[url] || null,
      page_url: url,
      submitted_at: new Date().toISOString(),
      status: "submitted",
    }));

    // Insert in batches of 100
    for (let i = 0; i < logEntries.length; i += 100) {
      const batch = logEntries.slice(i, i + 100);
      const { error } = await supabase.from("indexing_log").insert(batch);
      if (error) console.error("Indexing log insert error:", error);
    }

    return new Response(
      JSON.stringify({
        submitted_count: urlList.length,
        indexnow_status: indexnowStatus,
        google_ping_status: googlePingStatus,
      }),
      { headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("submit-indexnow error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
