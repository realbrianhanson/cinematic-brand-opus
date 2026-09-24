import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";
import { resolveNewsletterConfig } from "./newsletterConfig.ts";
import type { AccessMailPayload } from "./offerAccessMail.ts";
import {
  sendSpeakingNotification,
  speakingNotificationPayload,
  speakingNotificationRecipient,
  type SpeakingMailKind,
  type SpeakingMailInquiry,
} from "./speakingNotifications.ts";

interface Claim {
  id: string;
  lease_id: string;
  kind: SpeakingMailKind;
  payload: AccessMailPayload | null;
  inquiry: SpeakingMailInquiry;
}

/** Durable queue processing is independent of a visitor's successful submission. */
export async function processSpeakingNotifications(
  admin: SupabaseClient,
  inquiryRequestId?: string,
) {
  const [privateResult, publicResult] = await Promise.all([
    admin
      .from("site_settings_private")
      .select("speaking_notifications_enabled,speaking_notification_email")
      .order("id")
      .limit(1)
      .maybeSingle(),
    admin
      .from("site_settings")
      .select(
        "site_url,site_name,author_name,newsletter_from_address,newsletter_reply_to",
      )
      .limit(1)
      .maybeSingle(),
  ]);
  if (privateResult.error || publicResult.error)
    throw new Error("Notification settings unavailable");
  if (!privateResult.data?.speaking_notifications_enabled)
    return { enabled: false, processed: 0 };
  const mailer = resolveNewsletterConfig(
    publicResult.data,
    Deno.env.get("RESEND_API_KEY"),
  );
  const owner = speakingNotificationRecipient(
    privateResult.data.speaking_notification_email ?? "",
    publicResult.data?.newsletter_reply_to ?? "",
  );
  if (!mailer.ok || !owner || !mailer.config.siteUrl.startsWith("https://")) {
    // Keep a concrete, private explanation beside pending deliveries instead
    // of making a configuration problem look like normal provider backoff.
    const { error } = await admin
      .from("speaking_notification_deliveries")
      .update({
        last_error:
          "Email remains queued: check the Resend API key, verified brand sender, reply-to address, HTTPS site URL, and owner notification address.",
      })
      .eq("status", "pending");
    if (error) throw new Error("Notification status unavailable");
    return { enabled: true, processed: 0, configuration_required: true };
  }
  let inquiryId: string | undefined;
  if (inquiryRequestId) {
    const { data, error } = await admin
      .from("speaking_inquiries")
      .select("id")
      .eq("request_id", inquiryRequestId)
      .maybeSingle();
    if (error || !data) throw new Error("Inquiry unavailable");
    inquiryId = data.id;
  }
  let query = admin
    .from("speaking_notification_deliveries")
    .select("id")
    .in("status", ["pending", "sending"])
    .lte("next_attempt_at", new Date().toISOString());
  if (inquiryId) query = query.eq("inquiry_id", inquiryId);
  const { data, error } = await query.order("next_attempt_at").limit(5);
  if (error) throw new Error("Notification queue unavailable");
  let processed = 0;
  for (const delivery of data ?? []) {
    const { data: claimed, error: claimError } = await admin.rpc(
      "claim_speaking_notification",
      { _id: delivery.id },
    );
    if (claimError) throw new Error("Notification claim unavailable");
    if (!claimed) continue;
    const item = claimed as Claim;
    try {
      const recipient =
        item.payload?.to[0] ??
        (item.kind === "acknowledgement" ? item.inquiry.email : owner);
      const { data: suppressed, error: suppressionError } = await admin.rpc(
        "transactional_email_is_suppressed",
        { _email: recipient },
      );
      if (suppressionError || typeof suppressed !== "boolean")
        throw new Error("Suppression check unavailable");
      let result;
      if (suppressed) {
        result = {
          outcome: "blocked",
          providerId: null,
          detail:
            "Not sent: the recipient previously bounced or marked email as spam.",
        };
      } else {
        const payload =
          item.payload ??
          speakingNotificationPayload(
            mailer.config,
            owner,
            item.kind,
            item.inquiry,
          );
        if (!item.payload) {
          const { data: frozen, error: freezeError } = await admin.rpc(
            "freeze_speaking_notification",
            { _id: item.id, _lease_id: item.lease_id, _payload: payload },
          );
          if (freezeError || frozen !== true)
            throw new Error("Notification could not be prepared");
        }
        result = await sendSpeakingNotification(
          payload,
          mailer.config.apiKey,
          item.id,
        );
      }
      const { data: recorded, error: recordError } = await admin.rpc(
        "record_speaking_notification",
        {
          _id: item.id,
          _lease_id: item.lease_id,
          _outcome: result.outcome,
          _provider_id: result.providerId,
          _error: result.detail,
        },
      );
      if (recordError || recorded !== true)
        throw new Error("Notification receipt unavailable");
      processed++;
    } catch {
      // Preserve the lease and frozen payload after any uncertain failure. A
      // later worker retries the exact email with the same provider key.
      console.error("Speaking notification deferred");
    }
  }
  return { enabled: true, processed };
}

export function backgroundSpeakingNotifications(work: Promise<unknown>) {
  const safe = work.catch(() => {
    console.error("Speaking notification processing deferred");
  });
  const runtime = (
    globalThis as unknown as {
      EdgeRuntime?: { waitUntil(task: Promise<unknown>): void };
    }
  ).EdgeRuntime;
  if (runtime?.waitUntil) runtime.waitUntil(safe);
  else void safe;
}
