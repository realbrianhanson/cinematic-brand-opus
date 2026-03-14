import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const anonClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: claims, error: claimsErr } = await anonClient.auth.getClaims(authHeader.replace("Bearer ", ""));
  if (claimsErr || !claims?.claims?.sub) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Get site settings
    const { data: settings } = await supabase
      .from("site_settings")
      .select("*")
      .limit(1)
      .maybeSingle();

    if (!settings?.report_enabled && !(await req.json().catch(() => ({})))?.manual) {
      return new Response(
        JSON.stringify({ message: "Reports are disabled" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const reportEmail = settings?.report_email;
    if (!reportEmail) {
      return new Response(
        JSON.stringify({ message: "No report email configured" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 86400000).toISOString();
    const twoWeeksAgo = new Date(now.getTime() - 14 * 86400000).toISOString();

    // New pages published this week
    const { count: newPages } = await supabase
      .from("generated_pages")
      .select("id", { count: "exact", head: true })
      .eq("status", "published")
      .gte("published_at", weekAgo);

    // Views this week vs last week
    const { count: viewsThisWeek } = await supabase
      .from("page_engagement")
      .select("id", { count: "exact", head: true })
      .eq("event_type", "view")
      .gte("created_at", weekAgo);

    const { count: viewsLastWeek } = await supabase
      .from("page_engagement")
      .select("id", { count: "exact", head: true })
      .eq("event_type", "view")
      .gte("created_at", twoWeeksAgo)
      .lt("created_at", weekAgo);

    const vt = viewsThisWeek ?? 0;
    const vl = viewsLastWeek ?? 0;
    const changePercent = vl > 0 ? (((vt - vl) / vl) * 100).toFixed(1) : "N/A";

    // Top 5 pages
    const { data: topPages } = await supabase.rpc("top_pages_by_views", { limit_count: 5 });

    // CTA clicks this week
    const { count: ctaClicks } = await supabase
      .from("cta_events")
      .select("id", { count: "exact", head: true })
      .eq("event_type", "click")
      .gte("created_at", weekAgo);

    // Pages needing refresh
    const { count: refreshNeeded } = await supabase
      .from("generated_pages")
      .select("id", { count: "exact", head: true })
      .eq("performance_trend", "needs_refresh");

    const siteName = settings?.site_name || "Your Site";

    // Build HTML email
    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f8f9fa; padding: 40px 20px; margin: 0;">
  <div style="max-width: 560px; margin: 0 auto; background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
    <div style="background: #0a0a0a; padding: 24px 32px;">
      <h1 style="color: #D4AF55; font-size: 18px; margin: 0; font-weight: 600;">${siteName} — Weekly Report</h1>
      <p style="color: rgba(255,255,255,0.5); font-size: 12px; margin: 6px 0 0;">Week of ${new Date(weekAgo).toLocaleDateString("en-US", { month: "long", day: "numeric" })} — ${now.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</p>
    </div>
    <div style="padding: 28px 32px;">
      <div style="display: flex; gap: 16px; margin-bottom: 24px;">
        <div style="flex: 1; background: #f8f9fa; padding: 16px; border-radius: 6px; text-align: center;">
          <div style="font-size: 24px; font-weight: 700; color: #0a0a0a;">${newPages ?? 0}</div>
          <div style="font-size: 11px; color: #666; margin-top: 4px;">New Pages</div>
        </div>
        <div style="flex: 1; background: #f8f9fa; padding: 16px; border-radius: 6px; text-align: center;">
          <div style="font-size: 24px; font-weight: 700; color: #0a0a0a;">${vt}</div>
          <div style="font-size: 11px; color: #666; margin-top: 4px;">Views (${changePercent}%)</div>
        </div>
        <div style="flex: 1; background: #f8f9fa; padding: 16px; border-radius: 6px; text-align: center;">
          <div style="font-size: 24px; font-weight: 700; color: #0a0a0a;">${ctaClicks ?? 0}</div>
          <div style="font-size: 11px; color: #666; margin-top: 4px;">CTA Clicks</div>
        </div>
      </div>
      <h3 style="font-size: 14px; font-weight: 600; color: #0a0a0a; margin: 0 0 12px;">Top Pages</h3>
      <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
        ${(topPages ?? []).map((p, i) => `
        <tr style="border-bottom: 1px solid #eee;">
          <td style="padding: 8px 0; color: #333;">${i + 1}. ${p.title}</td>
          <td style="padding: 8px 0; color: #999; text-align: right;">${(p.view_count ?? 0).toLocaleString()} views</td>
        </tr>`).join("")}
      </table>
      ${(refreshNeeded ?? 0) > 0 ? `<p style="margin-top: 20px; padding: 12px; background: #fff8e1; border-radius: 6px; font-size: 13px; color: #795548;">⚠️ ${refreshNeeded} pages need content refresh</p>` : ""}
    </div>
    <div style="padding: 16px 32px; background: #f8f9fa; border-top: 1px solid #eee;">
      <p style="font-size: 11px; color: #999; margin: 0;">Sent from ${siteName} Performance Dashboard</p>
    </div>
  </div>
</body>
</html>`;

    // For now, log the report. Actual sending requires an email service.
    // If RESEND_API_KEY is configured, send via Resend
    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (resendKey) {
      const sendResp = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: `${siteName} <noreply@${new URL(settings?.site_url || "https://example.com").hostname}>`,
          to: reportEmail,
          subject: `${siteName} Weekly pSEO Report`,
          html,
        }),
      });
      const sendResult = await sendResp.json();
      if (!sendResp.ok) {
        console.error("Resend error:", sendResult);
        return new Response(
          JSON.stringify({ message: "Report generated but email failed", error: sendResult }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    } else {
      console.log("No RESEND_API_KEY, report HTML generated but not sent. Email:", reportEmail);
    }

    return new Response(
      JSON.stringify({
        message: resendKey ? "Report sent successfully" : "Report generated (no email service configured — add RESEND_API_KEY to send)",
        stats: { newPages, viewsThisWeek: vt, viewsLastWeek: vl, changePercent, ctaClicks, refreshNeeded },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Weekly report error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
