// Dependency-free weekly report helpers (unit tested from vitest).
import { escapeHtml } from "../_shared/newsletterConfig.ts";
import { providerErrorDetail } from "../_shared/newsletterDelivery.ts";

export interface ReportGateInput {
  mode: "cron" | "admin";
  manual: boolean;
  enabled: boolean;
}

/**
 * Scheduled runs honor report_enabled. Only a signed-in admin's manual run
 * bypasses it; a cron caller cannot claim to be manual.
 */
export function reportGate(input: ReportGateInput): {
  run: boolean;
  message?: string;
} {
  if (input.enabled) return { run: true };
  if (input.mode === "admin" && input.manual) return { run: true };
  return {
    run: false,
    message: "Weekly reports are turned off in Brand & publishing.",
  };
}

/** Always a string, never "[object Object]". */
export function errorText(error: unknown): string {
  if (typeof error === "string" && error.trim()) return error;
  if (error instanceof Error && error.message) return error.message;
  const message = (error as { message?: unknown } | null)?.message;
  return typeof message === "string" && message.trim()
    ? message
    : "Unexpected error";
}

export function reportSendFailure(status: number, body: string): string {
  return `The report email wasn't sent. ${providerErrorDetail(status, body)}`;
}

export interface ReportData {
  siteName: string;
  weekAgo: Date;
  now: Date;
  newPages: number;
  views: number;
  changePercent: string;
  topPages: Array<{ title: string; view_count: number | null }>;
  refreshNeeded: number;
}

export function buildReportHtml(data: ReportData): string {
  const site = escapeHtml(data.siteName);
  const from = data.weekAgo.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
  });
  const to = data.now.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const rows = data.topPages
    .map(
      (p, i) => `
        <tr style="border-bottom: 1px solid #eee;">
          <td style="padding: 8px 0; color: #333;">${i + 1}. ${escapeHtml(p.title)}</td>
          <td style="padding: 8px 0; color: #999; text-align: right;">${(p.view_count ?? 0).toLocaleString()} views</td>
        </tr>`,
    )
    .join("");
  const refresh =
    data.refreshNeeded > 0
      ? `<p style="margin-top: 20px; padding: 12px; background: #fff8e1; border-radius: 6px; font-size: 13px; color: #795548;">${data.refreshNeeded} pages need content refresh</p>`
      : "";
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f8f9fa; padding: 40px 20px; margin: 0;">
  <div style="max-width: 560px; margin: 0 auto; background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
    <div style="background: #0a0a0a; padding: 24px 32px;">
      <h1 style="color: #D4AF55; font-size: 18px; margin: 0; font-weight: 600;">${site} — Weekly Report</h1>
      <p style="color: rgba(255,255,255,0.5); font-size: 12px; margin: 6px 0 0;">Week of ${from} — ${to}</p>
    </div>
    <div style="padding: 28px 32px;">
      <div style="display: flex; gap: 16px; margin-bottom: 24px;">
        <div style="flex: 1; background: #f8f9fa; padding: 16px; border-radius: 6px; text-align: center;">
          <div style="font-size: 24px; font-weight: 700; color: #0a0a0a;">${data.newPages}</div>
          <div style="font-size: 11px; color: #666; margin-top: 4px;">New Pages</div>
        </div>
        <div style="flex: 1; background: #f8f9fa; padding: 16px; border-radius: 6px; text-align: center;">
          <div style="font-size: 24px; font-weight: 700; color: #0a0a0a;">${data.views}</div>
          <div style="font-size: 11px; color: #666; margin-top: 4px;">Views (${escapeHtml(data.changePercent)}%)</div>
        </div>
      </div>
      <p style="font-size: 13px; line-height: 1.6; color: #555; margin: 0 0 24px;">For current offer views, outbound clicks, and confirmed native outcomes, open <strong>Admin → Conversions</strong>. Its visit-based rates cover visitors who allow measurement. Legacy offer-click collection ended September 19, 2026, so this report no longer presents those records as current weekly clicks.</p>
      <h3 style="font-size: 14px; font-weight: 600; color: #0a0a0a; margin: 0 0 12px;">Top Pages</h3>
      <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
        ${rows}
      </table>
      ${refresh}
    </div>
    <div style="padding: 16px 32px; background: #f8f9fa; border-top: 1px solid #eee;">
      <p style="font-size: 11px; color: #999; margin: 0;">Sent from ${site} Performance Dashboard</p>
    </div>
  </div>
</body>
</html>`;
}
