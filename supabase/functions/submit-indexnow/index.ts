import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authorizeCronOrAdmin } from "../_shared/cronAuth.ts";
import { indexNowReceipt, validateIndexNowUrls } from "../_shared/indexnow.ts";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret, x-supabase-client-platform, x-supabase-client-runtime",
};
const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
Deno.serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return reply({ error: "POST required" }, 405);
  const auth = await authorizeCronOrAdmin(req, corsHeaders);
  if (auth instanceof Response) return auth;
  try {
    const db = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const body = await req.json();
    const { data: settings, error: settingsError } = await db
      .from("site_settings")
      .select("site_url")
      .limit(1)
      .maybeSingle();
    if (settingsError) throw settingsError;
    if (!settings?.site_url)
      return reply(
        { error: "Configure your site URL before submitting." },
        409,
      );
    const site = new URL(settings.site_url);
    if (!["https:", "http:"].includes(site.protocol))
      throw new Error("Invalid site URL");
    const key = Deno.env.get("INDEXNOW_KEY");
    if (!key || !/^[a-zA-Z0-9-]{8,128}$/.test(key))
      return reply(
        {
          error:
            "IndexNow is not configured. Add a valid key and host its verification file before submitting.",
          indexnow_status: "no_key",
          submitted_count: 0,
        },
        409,
      );
    const pageIds = new Map<string, string>();
    let urls: string[] = [];
    if (body.all_unsubmitted === true) {
      // Pagination avoids silently dropping URLs after the default 1,000-row limit.
      for (const kind of [
        "posts",
        "generated_pages",
        "pillar_pages",
      ] as const) {
        for (let offset = 0; ; offset += 1000) {
          const { data, error } = await db
            .from(kind)
            .select(
              kind === "generated_pages"
                ? "id,slug,content_schemas(slug)"
                : "id,slug",
            )
            .eq("status", "published")
            .order("id")
            .range(offset, offset + 999);
          if (error) throw error;
          for (const item of data ?? []) {
            const row = item as unknown as {
              id: string;
              slug: string;
              content_schemas?: { slug: string };
            };
            const path =
              kind === "posts"
                ? `/blog/${row.slug}`
                : kind === "pillar_pages"
                  ? `/guides/${row.slug}`
                  : row.content_schemas?.slug
                    ? `/resources/${row.content_schemas.slug}/${row.slug}`
                    : null;
            if (!path) continue;
            const url = `${site.origin}${path}`;
            urls.push(url);
            // The foreign key references generated_pages only, never posts/pillars.
            if (kind === "generated_pages") pageIds.set(url, row.id);
          }
          if ((data?.length ?? 0) < 1000) break;
        }
      }
      const received = new Set<string>();
      for (let offset = 0; ; offset += 1000) {
        const { data, error } = await db
          .from("indexing_log")
          .select("page_url")
          .eq("status", "indexnow_submitted")
          .order("id")
          .range(offset, offset + 999);
        if (error) throw error;
        for (const row of data ?? []) received.add(row.page_url);
        if ((data?.length ?? 0) < 1000) break;
      }
      urls = urls.filter((url) => !received.has(url));
    } else if (Array.isArray(body.urls))
      urls = validateIndexNowUrls(body.urls, site.origin);
    else return reply({ error: "Provide urls or all_unsubmitted." }, 400);
    urls = [...new Set(urls)];
    if (!urls.length)
      return reply({
        indexnow_status: "no_urls",
        submitted_count: 0,
        pending_count: 0,
        failed_count: 0,
      });
    let submitted = 0,
      pending = 0,
      failed = 0;
    for (let offset = 0; offset < urls.length; offset += 10000) {
      const batch = urls.slice(offset, offset + 10000);
      let status = "error",
        detail: string | null = null;
      try {
        const response = await fetch("https://api.indexnow.org/IndexNow", {
          method: "POST",
          signal: AbortSignal.timeout(20000),
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            host: site.host,
            key,
            keyLocation: `${site.origin}/${key}.txt`,
            urlList: batch,
          }),
        });
        await response.text();
        status = indexNowReceipt(response.status);
        if (status === "error")
          detail = `IndexNow returned HTTP ${response.status}`;
      } catch {
        detail = "No confirmed provider response. Retry is available.";
      }
      if (status === "indexnow_submitted") submitted += batch.length;
      else if (status === "indexnow_pending") pending += batch.length;
      else failed += batch.length;
      for (let start = 0; start < batch.length; start += 100) {
        const { error } = await db.from("indexing_log").insert(
          batch.slice(start, start + 100).map((url) => ({
            page_id: pageIds.get(url) ?? null,
            page_url: url,
            status,
            method: "indexnow",
            error_message: detail,
            submitted_at: new Date().toISOString(),
          })),
        );
        if (error)
          throw new Error(
            "Provider request finished, but its receipt could not be saved. Check the provider before retrying.",
          );
      }
    }
    return reply({
      submitted_count: submitted,
      pending_count: pending,
      failed_count: failed,
      indexnow_status: failed ? "partial" : pending ? "pending" : "ok",
    });
  } catch (error) {
    console.error("submit-indexnow", error);
    return reply(
      { error: error instanceof Error ? error.message : "Submission failed" },
      500,
    );
  }
});
