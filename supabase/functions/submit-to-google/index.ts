// Google Indexing API submission. Requires:
// 1. Google Cloud service account
// 2. Service account added as a verified owner in Google Search Console
// 3. GOOGLE_SERVICE_ACCOUNT_JSON secret set with the JSON key
// When the secret is missing, this function returns a clear status —
// google.com/ping?sitemap= was retired in 2023 and can no longer be used.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function pemToBuffer(pem: string) {
  const base64 = pem.replace(/\\n/g, "").replace(/-----BEGIN PRIVATE KEY-----/, "").replace(/-----END PRIVATE KEY-----/, "");
  const binary = atob(base64);
  const buffer = new ArrayBuffer(binary.length);
  const view = new Uint8Array(buffer);
  for (let i = 0; i < binary.length; i++) {
    view[i] = binary.charCodeAt(i);
  }
  return buffer;
}

function base64url(source: ArrayBuffer) {
  // Convert the buffer to a string
  let string = String.fromCharCode.apply(null, new Uint8Array(source) as any);

  // Base64 encode the string
  let base64 = btoa(string);

  // Replace non-url compatible characters
  base64 = base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  return base64;
}

async function getGoogleAccessToken(serviceAccountJson: string): Promise<string> {
  const serviceAccount = JSON.parse(serviceAccountJson);
  const now = Math.floor(Date.now() / 1000);
  const jwtHeader = JSON.stringify({
    alg: "RS256",
    typ: "JWT"
  });

  const jwtClaimSet = JSON.stringify({
    iss: serviceAccount.client_email,
    scope: "https://www.googleapis.com/auth/indexing",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  });

  const headerBase64 = base64url(new TextEncoder().encode(jwtHeader));
  const claimBase64 = base64url(new TextEncoder().encode(jwtClaimSet));

  const data = `${headerBase64}.${claimBase64}`;

  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    pemToBuffer(serviceAccount.private_key),
    {
      name: "RSASSA-PKCS1-v1_5",
      hash: "SHA-256"
    },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    new TextEncoder().encode(data)
  );

  const signatureBase64 = base64url(signature);
  const jwt = `${data}.${signatureBase64}`;

  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`
  });

  const tokenData = await tokenResponse.json();
  if (!tokenResponse.ok) {
    throw new Error(`Token request failed: ${JSON.stringify(tokenData)}`);
  }

  return tokenData.access_token;
}

async function submitToIndexingApi(accessToken: string, pageUrl: string) {
  const apiUrl = "https://indexing.googleapis.com/v2/urlNotifications:publish";
  const payload = {
    url: pageUrl,
    type: "URL_UPDATED"
  };

  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${accessToken}`
    },
    body: JSON.stringify(payload)
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(`Indexing API error: ${JSON.stringify(data)}`);
  }

  console.log("Indexing API response:", data);
  return data;
}

const DAILY_INDEXING_API_LIMIT = 200;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Auth: verify caller is admin
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const anonClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: userErr } = await anonClient.auth.getUser();
  if (userErr || !user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
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
      status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
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

    const serviceAccountJson = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON");

    // Google retired google.com/ping?sitemap= in 2023. Without a service
    // account there is no way to actively notify Google — discovery falls
    // back to the sitemap (referenced in robots.txt) + IndexNow submissions
    // (which reach Bing, Yandex, and others). Return early with a clear
    // status so the caller doesn't think a submission happened.
    if (!serviceAccountJson) {
      return new Response(
        JSON.stringify({
          success: false,
          submitted: 0,
          method: "none",
          message:
            "Google Indexing API is not configured (GOOGLE_SERVICE_ACCOUNT_JSON secret is missing). " +
            "Google discovery is handled passively via the sitemap listed in robots.txt. " +
            "Active submission is running through IndexNow (Bing, Yandex, and other participating engines).",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let accessToken: string;
    try {
      accessToken = await getGoogleAccessToken(serviceAccountJson);
    } catch (e: any) {
      return new Response(
        JSON.stringify({
          success: false,
          submitted: 0,
          method: "indexing_api",
          error: `Failed to authenticate with Google: ${e.message}`,
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const results: { submitted: number; errors: string[]; method: string; warnings: string[] } = {
      submitted: 0,
      errors: [],
      method: "indexing_api",
      warnings: [],
    };

    if (all_unsubmitted) {
      const { data: pages } = await supabase
        .from("generated_pages")
        .select("id, slug, content_schema_id, niche_id, content_schemas(slug), niches!generated_pages_niche_id_fkey(slug)")
        .eq("status", "published");

      const { data: existingLogs } = await supabase
        .from("indexing_log")
        .select("page_id");

      const submittedIds = new Set((existingLogs || []).map((l: any) => l.page_id));
      const urlList: { id: string; url: string }[] = [];

      for (const pg of pages || []) {
        if (submittedIds.has(pg.id)) continue;
        const contentSlug = (pg as any).content_schemas?.slug;
        if (!contentSlug) continue;
        urlList.push({ id: pg.id, url: `${siteUrl}/resources/${contentSlug}/${pg.slug}` });
      }

      if (urlList.length > DAILY_INDEXING_API_LIMIT) {
        results.warnings.push(
          `${urlList.length} URLs queued but Indexing API limit is ${DAILY_INDEXING_API_LIMIT}/day. Only first ${DAILY_INDEXING_API_LIMIT} will be submitted.`
        );
        urlList.length = DAILY_INDEXING_API_LIMIT;
      }

      for (const item of urlList) {
        try {
          await submitPage(supabase, item.id, item.url, accessToken);
          results.submitted++;
        } catch (e: any) {
          results.errors.push(`${item.id}: ${e.message}`);
        }
      }
    } else if (page_id && page_url) {
      await submitPage(supabase, page_id, page_url, accessToken);
      results.submitted = 1;
    } else {
      return new Response(
        JSON.stringify({ error: "Provide page_id + page_url, or all_unsubmitted: true" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
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
  accessToken: string
) {
  try {
    await submitToIndexingApi(accessToken, pageUrl);

    await supabase.from("indexing_log").insert({
      page_id: pageId,
      page_url: pageUrl,
      submitted_at: new Date().toISOString(),
      status: "submitted",
    });
  } catch (e: any) {
    console.error(`Submit ${pageId} failed:`, e);
    await supabase.from("indexing_log").insert({
      page_id: pageId,
      page_url: pageUrl,
      submitted_at: new Date().toISOString(),
      status: "error",
      error_message: e.message,
    });
    throw e;
  }
}
