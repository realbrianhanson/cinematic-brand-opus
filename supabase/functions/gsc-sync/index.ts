// Weekly sync of Google Search Console query+page performance data.
// Requires GOOGLE_SERVICE_ACCOUNT_JSON with the webmasters.readonly scope
// and the service account added as a user on the GSC property.
// Skips gracefully if the secret isn't configured.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authorizeCronOrAdmin } from "../_shared/cronAuth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function pemToBuffer(pem: string) {
  const base64 = pem.replace(/\\n/g, "").replace(/-----BEGIN PRIVATE KEY-----/, "").replace(/-----END PRIVATE KEY-----/, "");
  const binary = atob(base64);
  const buf = new ArrayBuffer(binary.length);
  const view = new Uint8Array(buf);
  for (let i = 0; i < binary.length; i++) view[i] = binary.charCodeAt(i);
  return buf;
}

function base64url(source: ArrayBuffer) {
  const str = String.fromCharCode.apply(null, new Uint8Array(source) as any);
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
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(data));
  const jwt = `${data}.${base64url(sig)}`;
  const tokRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
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

async function querySearchAnalytics(accessToken: string, siteUrl: string, start: string, end: string) {
  const rows: any[] = [];
  let startRow = 0;
  const rowLimit = 25000;
  while (true) {
    const res = await fetch(
      `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
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
    rows.push(...chunk);
    if (chunk.length < rowLimit) break;
    startRow += rowLimit;
    if (startRow > 200000) break; // hard cap
  }
  return rows;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const authResult = await authorizeCronOrAdmin(req, corsHeaders);
  if (authResult instanceof Response) return authResult;

  const serviceAccountJson = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON");
  if (!serviceAccountJson) {
    return new Response(
      JSON.stringify({ skipped: true, reason: "GOOGLE_SERVICE_ACCOUNT_JSON not configured — GSC sync is disabled." }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // Resolve the site property from site_settings.site_url.
  const { data: settings } = await supabase.from("site_settings").select("site_url").limit(1).maybeSingle();
  const siteUrl = (settings?.site_url || "").replace(/\/+$/, "") + "/";
  if (!siteUrl || siteUrl === "/") {
    return new Response(
      JSON.stringify({ skipped: true, reason: "site_settings.site_url is empty." }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  try {
    const end = daysAgo(1);
    const start = daysAgo(28);

    const accessToken = await getAccessToken(serviceAccountJson);
    const rows = await querySearchAnalytics(accessToken, siteUrl, start, end);

    // Clear rows for this period, then insert fresh snapshot.
    await supabase.from("gsc_performance").delete().eq("period_start", start).eq("period_end", end);

    const batch = rows.map((r: any) => ({
      page_url: r.keys?.[0] || "",
      query: r.keys?.[1] || "",
      clicks: Math.round(r.clicks || 0),
      impressions: Math.round(r.impressions || 0),
      ctr: Number(r.ctr || 0),
      position: Number(r.position || 0),
      period_start: start,
      period_end: end,
    })).filter((r: any) => r.page_url && r.query);

    // Insert in chunks
    const chunkSize = 1000;
    for (let i = 0; i < batch.length; i += chunkSize) {
      const slice = batch.slice(i, i + chunkSize);
      const { error } = await supabase.from("gsc_performance").insert(slice);
      if (error) throw new Error(`Insert failed at row ${i}: ${error.message}`);
    }

    return new Response(
      JSON.stringify({ ok: true, site: siteUrl, period: `${start} → ${end}`, rows: batch.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    console.error("gsc-sync error:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
