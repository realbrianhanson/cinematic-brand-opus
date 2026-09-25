// Weekly sync of Google Search Console query+page performance data.
// Requires GOOGLE_SERVICE_ACCOUNT_JSON with the webmasters.readonly scope
// and the service account added as a user on the GSC property.
// Skips gracefully if the secret isn't configured.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";
import {
  stageGscImport,
  resolveGscProperty,
  type SearchRow,
} from "../_shared/gscImport.ts";
import { authorizeCronOrAdmin } from "../_shared/cronAuth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function pemToBuffer(pem: string) {
  const base64 = pem
    .replace(/\\n/g, "")
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "");
  const binary = atob(base64);
  const buf = new ArrayBuffer(binary.length);
  const view = new Uint8Array(buf);
  for (let i = 0; i < binary.length; i++) view[i] = binary.charCodeAt(i);
  return buf;
}

function base64url(source: ArrayBuffer | Uint8Array) {
  const str = String.fromCharCode(...new Uint8Array(source));
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function getAccessToken(serviceAccountJson: string): Promise<string> {
  const sa = JSON.parse(serviceAccountJson);
  const now = Math.floor(Date.now() / 1000);
  const header = JSON.stringify({ alg: "RS256", typ: "JWT" });
  const claim = JSON.stringify({
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/webmasters.readonly",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  });
  const headerB = base64url(new TextEncoder().encode(header));
  const claimB = base64url(new TextEncoder().encode(claim));
  const data = `${headerB}.${claimB}`;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToBuffer(sa.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(data),
  );
  const jwt = `${data}.${base64url(sig)}`;
  const tokRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    signal: AbortSignal.timeout(30000),
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });
  const tok = await tokRes.json();
  if (!tokRes.ok) throw new Error(`Token: ${JSON.stringify(tok)}`);
  return tok.access_token;
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

async function querySearchAnalytics(
  accessToken: string,
  siteUrl: string,
  start: string,
  end: string,
) {
  const rows: SearchRow[] = [];
  let startRow = 0;
  const rowLimit = 25000;
  while (true) {
    const res = await fetch(
      `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
      {
        method: "POST",
        signal: AbortSignal.timeout(30000),
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          startDate: start,
          endDate: end,
          dimensions: ["page", "query"],
          rowLimit,
          startRow,
        }),
      },
    );
    const data = await res.json();
    if (!res.ok) throw new Error(`GSC: ${JSON.stringify(data)}`);
    const chunk = data.rows || [];
    if (!Array.isArray(chunk))
      throw new Error(
        "Search Console returned an invalid report. Existing data is unchanged.",
      );
    rows.push(...chunk);
    if (chunk.length < rowLimit) break;
    startRow += rowLimit;
    if (startRow > 200000)
      throw new Error(
        "Search Console import exceeded the row limit. The last complete import is unchanged.",
      );
  }
  return rows;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { headers: corsHeaders });

  const authResult = await authorizeCronOrAdmin(req, corsHeaders);
  if (authResult instanceof Response) return authResult;

  const serviceAccountJson = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON");
  if (!serviceAccountJson) {
    return new Response(
      JSON.stringify({
        skipped: true,
        reason:
          "GOOGLE_SERVICE_ACCOUNT_JSON not configured — GSC sync is disabled.",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const end = daysAgo(1);
    const start = daysAgo(28);

    const [
      { data: settings, error: settingsError },
      { data: privateSettings, error: privateError },
    ] = await Promise.all([
      supabase
        .from("site_settings")
        .select("site_url")
        .order("id")
        .limit(1)
        .abortSignal(AbortSignal.timeout(15000))
        .maybeSingle(),
      supabase
        .from("site_settings_private")
        .select("gsc_property")
        .order("id")
        .limit(1)
        .abortSignal(AbortSignal.timeout(15000))
        .maybeSingle(),
    ]);
    if (settingsError) throw settingsError;
    if (privateError) throw privateError;
    const siteUrl = resolveGscProperty(
      privateSettings?.gsc_property,
      settings?.site_url,
    );
    // Keep the portable import runner independent of remote/generated schema
    // types; Supabase's recursive select types otherwise exceed Deno's depth.
    const imported = await stageGscImport(
      supabase as unknown as Parameters<typeof stageGscImport>[0],
      { property: siteUrl, start, end },
      async () => {
        const accessToken = await getAccessToken(serviceAccountJson);
        return querySearchAnalytics(accessToken, siteUrl, start, end);
      },
    );

    return new Response(
      JSON.stringify({
        ok: true,
        site: siteUrl,
        period: `${start} → ${end}`,
        rows: imported.rows,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("gsc-sync error:", err);
    return new Response(
      JSON.stringify({
        error:
          err instanceof Error
            ? err.message
            : "Search Console import failed. Check the integration and retry.",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
