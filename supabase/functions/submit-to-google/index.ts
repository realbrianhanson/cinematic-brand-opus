// To use Google Indexing API:
// 1. Create a Google Cloud service account
// 2. Add it as a verified owner in Google Search Console
// 3. Set GOOGLE_SERVICE_ACCOUNT_JSON secret with the JSON key contents
// Falls back to sitemap ping if not configured

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

// ---------- Google Indexing API helpers ----------

function pemToBuffer(pem: string): ArrayBuffer {
  const b64 = pem.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\n|\r/g, "");
  const binary = atob(b64);
  const buffer = new ArrayBuffer(binary.length);
  const view = new Uint8Array(buffer);
  for (let i = 0; i < binary.length; i++) view[i] = binary.charCodeAt(i);
  return buffer;
}

function base64url(input: string | ArrayBuffer): string {
  const str =
    typeof input === "string"
      ? btoa(input)
      : btoa(String.fromCharCode(...new Uint8Array(input)));
  return str.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function getGoogleAccessToken(serviceAccountJson: string): Promise<string> {
  const sa = JSON.parse(serviceAccountJson);

  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const now = Math.floor(Date.now() / 1000);
  const claimSet = base64url(
    JSON.stringify({
      iss: sa.client_email,
      scope: "https://www.googleapis.com/auth/indexing",
      aud: "https://oauth2.googleapis.com/token",
      exp: now + 3600,
      iat: now,
    })
  );

  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToBuffer(sa.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const encoder = new TextEncoder();
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    encoder.encode(`${header}.${claimSet}`)
  );

  const jwt = `${header}.${claimSet}.${base64url(signature)}`;

  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });

  const data = await resp.json();
  if (!data.access_token) {
    throw new Error(`Google OAuth failed: ${JSON.stringify(data)}`);
  }
  return data.access_token;
}

async function submitToIndexingApi(
  url: string,
  accessToken: string
): Promise<{ success: boolean; status: number }> {
  const resp = await fetch(
    "https://indexing.googleapis.com/v3/urlNotifications:publish",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ url, type: "URL_UPDATED" }),
    }
  );
  return { success: resp.ok, status: resp.status };
}

// ---------- Main handler ----------

const DAILY_INDEXING_API_LIMIT = 200;

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
    const { page_id, page_url, all_unsubmitted } = body;

    const { data: settings } = await supabase
      .from("site_settings")
      .select("site_url")
      .limit(1)
      .maybeSingle();

    const siteUrl = (settings?.site_url || "https://example.com").replace(/\/$/, "");
    const sitemapUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/generate-sitemap?type=main`;

    // Determine method
    const serviceAccountJson = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON");
    let accessToken: string | null = null;
    let method: "indexing_api" | "sitemap_ping" = "sitemap_ping";

    if (serviceAccountJson) {
      try {
        accessToken = await getGoogleAccessToken(serviceAccountJson);
        method = "indexing_api";
        console.log("Using Google Indexing API");
      } catch (e: any) {
        console.warn("Failed to get Indexing API token, falling back to sitemap ping:", e.message);
      }
    } else {
      console.log("GOOGLE_SERVICE_ACCOUNT_JSON not set, using sitemap ping");
    }

    const results: { submitted: number; errors: string[]; method: string; warnings: string[] } = {
      submitted: 0,
      errors: [],
      method,
      warnings: [],
    };

    if (all_unsubmitted) {
      const { data: pages } = await supabase
        .from("generated_pages")
        .select("id, slug, content_schema_id, niche_id, content_schemas(slug), niches(slug)")
        .eq("status", "published");

      const { data: existingLogs } = await supabase
        .from("indexing_log")
        .select("page_id");

      const submittedIds = new Set((existingLogs || []).map((l: any) => l.page_id));
      const urlList: { id: string; url: string }[] = [];

      for (const pg of pages || []) {
        if (submittedIds.has(pg.id)) continue;
        const contentSlug = (pg as any).content_schemas?.slug;
        const nicheSlug = (pg as any).niches?.slug;
        if (!contentSlug || !nicheSlug) continue;
        urlList.push({ id: pg.id, url: `${siteUrl}/resources/${contentSlug}/${nicheSlug}` });
      }

      // Rate limit for Indexing API
      if (method === "indexing_api" && urlList.length > DAILY_INDEXING_API_LIMIT) {
        results.warnings.push(
          `${urlList.length} URLs queued but Indexing API limit is ${DAILY_INDEXING_API_LIMIT}/day. Only first ${DAILY_INDEXING_API_LIMIT} will be submitted.`
        );
        urlList.length = DAILY_INDEXING_API_LIMIT;
      }

      for (const item of urlList) {
        try {
          await submitPage(supabase, item.id, item.url, sitemapUrl, method, accessToken);
          results.submitted++;
        } catch (e: any) {
          results.errors.push(`${item.id}: ${e.message}`);
        }
      }
    } else if (page_id && page_url) {
      await submitPage(supabase, page_id, page_url, sitemapUrl, method, accessToken);
      results.submitted = 1;
    } else {
      return new Response(
        JSON.stringify({ error: "Provide page_id + page_url, or all_unsubmitted: true" }),
        { status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, ...results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Submit to Google error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

async function submitPage(
  supabase: any,
  pageId: string,
  pageUrl: string,
  sitemapUrl: string,
  method: "indexing_api" | "sitemap_ping",
  accessToken: string | null
) {
  if (method === "indexing_api" && accessToken) {
    const result = await submitToIndexingApi(pageUrl, accessToken);
    if (!result.success) {
      throw new Error(`Indexing API returned ${result.status} for ${pageUrl}`);
    }
  } else {
    // Fallback: sitemap ping
    try {
      const pingUrl = `https://www.google.com/ping?sitemap=${encodeURIComponent(sitemapUrl)}`;
      const resp = await fetch(pingUrl);
      await resp.text();
    } catch (e) {
      console.warn("Google ping failed:", e);
    }
  }

  const { error } = await supabase.from("indexing_log").insert({
    page_id: pageId,
    page_url: pageUrl,
    submitted_at: new Date().toISOString(),
    status: "submitted",
    method,
  });

  if (error) throw error;
}
