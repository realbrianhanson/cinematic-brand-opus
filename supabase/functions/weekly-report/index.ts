import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authorizeCronOrAdmin } from "../_shared/cronAuth.ts";
import { resolveNewsletterConfig } from "../_shared/newsletterConfig.ts";
import {
  buildReportHtml,
  errorText,
  reportGate,
  reportSendFailure,
} from "./reportLogic.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Handled outcomes keep HTTP 200 so the admin button can show `error` (a plain
// string); unexpected exceptions return 500 with a string error.
function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const authResult = await authorizeCronOrAdmin(req, corsHeaders);
  if (authResult instanceof Response) return authResult;

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const reqBody = await req.json().catch(() => ({}));

    // Sensitive report config lives in an admin-only table.
    const { data: privateSettings, error: privateError } = await supabase
      .from("site_settings_private")
      .select("report_email, report_enabled")
      .limit(1)
      .maybeSingle();
    if (privateError) throw privateError;

    const gate = reportGate({
      mode: authResult.mode,
      manual: reqBody?.manual === true,
      enabled: privateSettings?.report_enabled === true,
    });
    if (!gate.run)
      return json({ ok: true, skipped: true, message: gate.message });

    const reportEmail = (privateSettings?.report_email ?? "").trim();
    if (!reportEmail) {
      return json({
        ok: false,
        error: "No report email is set in Brand & publishing.",
      });
    }

    const { data: settings, error: settingsError } = await supabase
      .from("site_settings")
      .select(
        "site_url, site_name, author_name, newsletter_from_address, newsletter_reply_to, newsletter_postal_address",
      )
      .limit(1)
      .maybeSingle();
    if (settingsError) throw settingsError;
    // Same validated sender as the newsletter; no hand-built noreply address.
    const resolved = resolveNewsletterConfig(
      settings,
      Deno.env.get("RESEND_API_KEY"),
    );
    if (!resolved.ok) {
      return json({
        ok: false,
        error: `Email isn't configured: ${resolved.missing.join(", ")}`,
      });
    }
    const config = resolved.config;

    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 86400000);
    const twoWeeksAgo = new Date(now.getTime() - 14 * 86400000).toISOString();

    const { count: newPages } = await supabase
      .from("generated_pages")
      .select("id", { count: "exact", head: true })
      .eq("status", "published")
      .gte("published_at", weekAgo.toISOString());

    const { count: viewsThisWeek } = await supabase
      .from("page_engagement")
      .select("id", { count: "exact", head: true })
      .eq("event_type", "view")
      .gte("created_at", weekAgo.toISOString());

    const { count: viewsLastWeek } = await supabase
      .from("page_engagement")
      .select("id", { count: "exact", head: true })
      .eq("event_type", "view")
      .gte("created_at", twoWeeksAgo)
      .lt("created_at", weekAgo.toISOString());

    const vt = viewsThisWeek ?? 0;
    const vl = viewsLastWeek ?? 0;
    const changePercent = vl > 0 ? (((vt - vl) / vl) * 100).toFixed(1) : "N/A";

    const { data: topPages } = await supabase.rpc("top_pages_by_views", {
      limit_count: 5,
    });

    const { count: refreshNeeded } = await supabase
      .from("generated_pages")
      .select("id", { count: "exact", head: true })
      .eq("performance_trend", "needs_refresh");

    const html = buildReportHtml({
      siteName: config.siteName,
      weekAgo,
      now,
      newPages: newPages ?? 0,
      views: vt,
      changePercent,
      topPages: Array.isArray(topPages) ? topPages : [],
      refreshNeeded: refreshNeeded ?? 0,
    });

    const sendResp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      signal: AbortSignal.timeout(15000),
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: config.fromAddress,
        reply_to: config.replyTo,
        to: [reportEmail],
        subject: `${config.siteName} Weekly pSEO Report`,
        html,
      }),
    });
    if (!sendResp.ok) {
      const error = reportSendFailure(
        sendResp.status,
        await sendResp.text().catch(() => ""),
      );
      console.error("Weekly report send failed:", error);
      return json({ ok: false, error, provider_status: sendResp.status });
    }

    return json({
      ok: true,
      message: "Report sent successfully",
      stats: {
        newPages,
        viewsThisWeek: vt,
        viewsLastWeek: vl,
        changePercent,
        refreshNeeded,
      },
    });
  } catch (error) {
    const message = errorText(error);
    console.error("Weekly report error:", message);
    return json({ ok: false, error: message }, 500);
  }
});
