import type { CallFunnelConfig } from "./callFunnels.ts";
import {
  callFollowupPayload,
  callOwnerAlertPayload,
  sendCallMail,
  type CallMailApplication,
} from "./callFunnelMail.ts";
import { resolveNewsletterConfig } from "./newsletterConfig.ts";
import { speakingNotificationRecipient } from "./speakingNotifications.ts";

/** The parts of supabase-js used here; structural so tests can pass a fake. */
type MailAdmin = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from(table: string): any;
  rpc(
    name: string,
    args: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: unknown }>;
};

const HOUR = 3600000;
/** Owner alerts retry for a day; reminders go 3 to 72 hours after applying. */
const ALERT_WINDOW = 24 * HOUR;
const REMINDER_AFTER = 3 * HOUR;
const REMINDER_UNTIL = 72 * HOUR;

interface Row {
  id: string;
  funnel_id: string;
  revision: number;
  contact: { name: string; email: string };
  answers: Record<string, string>;
  marketing_consent?: boolean;
}

/**
 * Sends owner alerts (and, without an application filter, booking reminders).
 * A timestamp is written only after Resend confirms the email, so an
 * uncertain send retries on the next run with the same idempotency key.
 */
export async function processCallFunnelMail(
  admin: MailAdmin,
  apiKey: string | undefined,
  options: { applicationId?: string; now?: number } = {},
) {
  const now = options.now ?? Date.now();
  const [publicResult, privateResult] = await Promise.all([
    admin
      .from("site_settings")
      .select(
        "site_url,site_name,author_name,newsletter_from_address,newsletter_reply_to",
      )
      .limit(1)
      .maybeSingle(),
    admin
      .from("site_settings_private")
      .select("speaking_notification_email")
      .order("id")
      .limit(1)
      .maybeSingle(),
  ]);
  if (publicResult.error || privateResult.error)
    throw new Error("Mail settings unavailable");
  const mailer = resolveNewsletterConfig(publicResult.data, apiKey);
  const owner = speakingNotificationRecipient(
    privateResult.data?.speaking_notification_email ?? "",
    publicResult.data?.newsletter_reply_to ?? "",
  );
  if (!mailer.ok || !owner)
    return { configured: false, alerts: 0, reminders: 0 };

  const configs = new Map<string, { slug: string; config: CallFunnelConfig }>();
  async function application(row: Row): Promise<CallMailApplication | null> {
    const key = `${row.funnel_id}:${row.revision}`;
    if (!configs.has(key)) {
      const { data, error } = await admin
        .from("call_funnel_revisions")
        .select("slug,config")
        .eq("funnel_id", row.funnel_id)
        .eq("version", row.revision)
        .maybeSingle();
      if (error || !data) return null;
      configs.set(key, data as { slug: string; config: CallFunnelConfig });
    }
    const revision = configs.get(key)!;
    return {
      ...row,
      marketingConsent: row.marketing_consent === true,
      slug: revision.slug,
      config: revision.config,
    };
  }

  let alertQuery = admin
    .from("call_funnel_applications")
    .select("id,funnel_id,revision,contact,answers,marketing_consent")
    .eq("outcome", "qualified")
    .is("owner_alerted_at", null)
    .gte("submitted_at", new Date(now - ALERT_WINDOW).toISOString());
  if (options.applicationId)
    alertQuery = alertQuery.eq("id", options.applicationId);
  const alerts = await alertQuery.order("submitted_at").limit(10);
  if (alerts.error) throw new Error("Applications unavailable");
  let sentAlerts = 0;
  for (const row of (alerts.data ?? []) as Row[]) {
    const app = await application(row);
    if (!app) continue;
    const result = await sendCallMail(
      callOwnerAlertPayload(mailer.config, owner, app),
      mailer.config.apiKey,
      `call-alert-${row.id}`,
    );
    if (result.outcome !== "sent") continue;
    await admin
      .from("call_funnel_applications")
      .update({ owner_alerted_at: new Date(now).toISOString() })
      .eq("id", row.id);
    sentAlerts++;
  }
  if (options.applicationId)
    return { configured: true, alerts: sentAlerts, reminders: 0 };

  const due = await admin
    .from("call_funnel_applications")
    .select("id,funnel_id,revision,contact,answers")
    .eq("outcome", "qualified")
    .is("followup_sent_at", null)
    .lte("submitted_at", new Date(now - REMINDER_AFTER).toISOString())
    .gte("submitted_at", new Date(now - REMINDER_UNTIL).toISOString())
    .order("submitted_at")
    .limit(20);
  if (due.error) throw new Error("Applications unavailable");
  const rows = (due.data ?? []) as Row[];
  if (!rows.length)
    return { configured: true, alerts: sentAlerts, reminders: 0 };
  const booked = await admin
    .from("call_funnel_events")
    .select("application_id")
    .in(
      "application_id",
      rows.map((row) => row.id),
    )
    .in("type", ["booked", "rescheduled"]);
  if (booked.error) throw new Error("Bookings unavailable");
  const hasBooking = new Set(
    (booked.data ?? []).map(
      (event: { application_id: string }) => event.application_id,
    ),
  );
  let sentReminders = 0;
  for (const row of rows) {
    if (hasBooking.has(row.id)) continue;
    const app = await application(row);
    if (!app) continue;
    const { data: suppressed, error } = await admin.rpc(
      "transactional_email_is_suppressed",
      { _email: row.contact.email },
    );
    if (error || typeof suppressed !== "boolean") continue;
    const payload = suppressed
      ? null
      : callFollowupPayload(mailer.config, owner, app);
    // Suppressed or unbookable applicants are marked done without an email.
    const result = payload
      ? await sendCallMail(
          payload,
          mailer.config.apiKey,
          `call-reminder-${row.id}`,
        )
      : { outcome: "sent" as const };
    if (result.outcome !== "sent") continue;
    await admin
      .from("call_funnel_applications")
      .update({ followup_sent_at: new Date(now).toISOString() })
      .eq("id", row.id);
    if (payload) sentReminders++;
  }
  return { configured: true, alerts: sentAlerts, reminders: sentReminders };
}

/** Lets the visitor's response return while the alert finishes in the background. */
export function inBackground(work: Promise<unknown>) {
  const safe = work.catch(() => console.error("Call funnel mail deferred"));
  const runtime = (
    globalThis as unknown as {
      EdgeRuntime?: { waitUntil(task: Promise<unknown>): void };
    }
  ).EdgeRuntime;
  if (runtime?.waitUntil) runtime.waitUntil(safe);
  else void safe;
}
