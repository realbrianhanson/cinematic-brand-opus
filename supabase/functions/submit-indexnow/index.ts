import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authorizeCronOrAdmin } from "../_shared/cronAuth.ts";
import {
  checkIndexNowKeyFile,
  INDEXNOW_RECEIVED_STATUSES,
  indexNowEarlyExitRow,
  indexNowKeyLocation,
  indexNowReceipt,
  indexNowSiteOrigin,
  resolveIndexNowKey,
  validateIndexNowUrls,
} from "../_shared/indexnow.ts";

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

type Db = ReturnType<typeof createClient>;
type Settings = { site_url?: string | null; indexnow_key?: string | null };

// Reads the stored key; tolerates a database that has not applied the
// 20260923151000 migration yet (the env secret is then the only key source).
async function readSettings(db: Db): Promise<Settings | null> {
  const withKey = await db
    .from("site_settings")
    .select("site_url,indexnow_key")
    .order("id")
    .limit(1)
    .maybeSingle();
  if (!withKey.error) return withKey.data as Settings | null;
  if (withKey.error.code !== "42703") throw withKey.error;
  const plain = await db
    .from("site_settings")
    .select("site_url")
    .order("id")
    .limit(1)
    .maybeSingle();
  if (plain.error) throw plain.error;
  return plain.data as Settings | null;
}

// Every early exit leaves an indexing_log row, because the daily cron discards
// the HTTP response and the admin card reads its status from this table.
async function logEarlyExit(
  db: Db,
  origin: string | null,
  message: string,
  at: string,
) {
  const { error } = await db
    .from("indexing_log")
    .insert(indexNowEarlyExitRow(origin, message, at));
  if (error) console.error("submit-indexnow: could not log early exit", error);
}

async function collectUnsubmitted(db: Db, origin: string) {
  const pageIds = new Map<string, string>();
  const urls: string[] = [];
  // Pagination avoids silently dropping URLs after the default 1,000-row limit.
  for (const kind of ["posts", "generated_pages", "pillar_pages"] as const) {
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
        const url = `${origin}${path}`;
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
      .eq("method", "indexnow")
      .in("status", [...INDEXNOW_RECEIVED_STATUSES])
      .order("id")
      .range(offset, offset + 999);
    if (error) throw error;
    for (const row of data ?? []) received.add(row.page_url);
    if ((data?.length ?? 0) < 1000) break;
  }
  return { urls: urls.filter((url) => !received.has(url)), pageIds };
}

async function submitBatches(
  db: Db,
  site: { origin: string; host: string },
  key: string,
  urls: string[],
  pageIds: Map<string, string>,
  at: string,
) {
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
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify({
          host: site.host,
          key,
          keyLocation: indexNowKeyLocation(site.origin, key),
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
          // One timestamp per run lets the admin card count the last run.
          submitted_at: at,
        })),
      );
      if (error)
        throw new Error(
          "Provider request finished, but its receipt could not be saved. Check the provider before retrying.",
        );
    }
  }
  return { submitted, pending, failed };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return reply({ error: "POST required" }, 405);
  const auth = await authorizeCronOrAdmin(req, corsHeaders);
  if (auth instanceof Response) return auth;

  const db = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const at = new Date().toISOString();
  let origin: string | null = null;
  let statusOnly = false;
  const stop = async (indexnowStatus: string, message: string) => {
    await logEarlyExit(db, origin, message, at);
    return reply(
      {
        error: message,
        indexnow_status: indexnowStatus,
        submitted_count: 0,
        pending_count: 0,
        failed_count: 0,
      },
      409,
    );
  };

  try {
    const body = (await req.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;
    if (!body || typeof body !== "object")
      return reply({ error: "Send a JSON body." }, 400);
    statusOnly = body.status === true;

    const settings = await readSettings(db);
    const site = indexNowSiteOrigin(settings?.site_url);
    const { key, source } = resolveIndexNowKey(
      settings?.indexnow_key,
      Deno.env.get("INDEXNOW_KEY"),
    );

    // Read-only setup check for the admin card: never submits or logs.
    if (statusOnly) {
      if ("problem" in site)
        return reply({
          key_present: !!key,
          key_source: source,
          key_location: null,
          key_file_ok: false,
          key_file_detail: site.problem,
        });
      const location = key ? indexNowKeyLocation(site.origin, key) : null;
      const check =
        key && location
          ? await checkIndexNowKeyFile(fetch, location, key)
          : { ok: false as const, detail: "No IndexNow key is stored." };
      return reply({
        key_present: !!key,
        key_source: source,
        key_location: location,
        key_file_ok: check.ok,
        key_file_detail: check.ok ? null : check.detail,
      });
    }

    if ("problem" in site) return await stop("config_error", site.problem);
    origin = site.origin;
    if (!key)
      return await stop(
        "no_key",
        "No IndexNow key is stored. Apply the latest database migration, then retry.",
      );
    const keyFile = await checkIndexNowKeyFile(
      fetch,
      indexNowKeyLocation(site.origin, key),
      key,
    );
    if (!keyFile.ok)
      return await stop(
        "key_file_unreachable",
        `${keyFile.detail} IndexNow would reject the submission, so nothing was sent.`,
      );

    let urls: string[];
    let pageIds = new Map<string, string>();
    if (body.all_unsubmitted === true) {
      ({ urls, pageIds } = await collectUnsubmitted(db, site.origin));
    } else if (Array.isArray(body.urls)) {
      try {
        urls = validateIndexNowUrls(body.urls, site.origin);
      } catch (error) {
        return reply(
          {
            error: error instanceof Error ? error.message : "Invalid URLs.",
          },
          400,
        );
      }
    } else return reply({ error: "Provide urls or all_unsubmitted." }, 400);
    urls = [...new Set(urls)];
    if (!urls.length)
      return reply({
        indexnow_status: "no_urls",
        submitted_count: 0,
        pending_count: 0,
        failed_count: 0,
      });

    const { submitted, pending, failed } = await submitBatches(
      db,
      site,
      key,
      urls,
      pageIds,
      at,
    );
    return reply({
      submitted_count: submitted,
      pending_count: pending,
      failed_count: failed,
      indexnow_status: failed ? "partial" : pending ? "pending" : "ok",
    });
  } catch (error) {
    console.error("submit-indexnow", error);
    const message =
      error instanceof Error ? error.message : "Submission failed";
    if (!statusOnly)
      await logEarlyExit(db, origin, `Submission failed: ${message}`, at);
    return reply({ error: message, indexnow_status: "error" }, 500);
  }
});
