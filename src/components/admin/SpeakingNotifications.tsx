import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import QueryNotice from "./QueryNotice";

const speakingDeliveryLabels: Record<string, string> = {
  pending: "Queued",
  sending: "Processing",
  sent: "Accepted by email provider",
  failed: "Delivery failed",
  needs_review: "Needs delivery review",
  cancelled: "Cancelled",
};
const kindLabels: Record<string, string> = {
  owner: "Owner notification",
  acknowledgement: "Organizer acknowledgement",
  reminder: "48-hour follow-up reminder",
};

export function SpeakingDeliveryStatus({ inquiryId }: { inquiryId: string }) {
  const query = useQuery({
    queryKey: ["speaking-notifications", "inquiry", inquiryId],
    refetchInterval: 30000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("speaking_notification_deliveries")
        .select("id,kind,status,attempts,next_attempt_at,last_error")
        .eq("inquiry_id", inquiryId)
        .order("created_at");
      if (error)
        throw new Error(
          "Email status could not be loaded. The saved inquiry is still available.",
        );
      return data;
    },
  });
  return (
    <section className="admin-card p-5" aria-label="Inquiry email status">
      <h2 className="font-semibold">Email status</h2>
      <QueryNotice
        loading={query.isPending}
        error={query.error}
        retry={() => {
          void query.refetch();
        }}
      />
      {query.data?.length === 0 && (
        <p className="admin-help mt-2">
          No automatic emails were queued for this inquiry. You can reply
          directly from the inbox.
        </p>
      )}
      <ul className="mt-3 space-y-3">
        {query.data?.map((delivery) => (
          <li key={delivery.id} className="text-sm">
            <p className="font-medium">
              {kindLabels[delivery.kind]} ·{" "}
              {speakingDeliveryLabels[delivery.status]}
            </p>
            {delivery.status === "pending" && (
              <p className="admin-help">
                Eligible after{" "}
                {new Date(delivery.next_attempt_at).toLocaleString()}. Attempts:{" "}
                {delivery.attempts}.
              </p>
            )}
            {delivery.last_error && (
              <p className="admin-help mt-1">{delivery.last_error}</p>
            )}
          </li>
        ))}
      </ul>
      <p className="admin-help mt-3">
        Provider acceptance does not confirm inbox delivery. Mark the inquiry
        Contacted after replying to stop an unsent reminder.
      </p>
    </section>
  );
}

export default function SpeakingNotifications() {
  const client = useQueryClient();
  const [recipient, setRecipient] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [baseline, setBaseline] = useState<{
    id: string;
    speaking_notifications_enabled: boolean;
    speaking_notification_email: string;
  } | null>(null);
  const query = useQuery({
    queryKey: ["speaking-notifications", "settings"],
    queryFn: async () => {
      const [settings, brand] = await Promise.all([
        supabase
          .from("site_settings_private")
          .select(
            "id,speaking_notifications_enabled,speaking_notification_email",
          )
          .order("id")
          .limit(1)
          .maybeSingle(),
        supabase
          .from("site_settings")
          .select("newsletter_reply_to")
          .limit(1)
          .maybeSingle(),
      ]);
      if (settings.error || brand.error || !settings.data)
        throw new Error("Email settings could not be loaded.");
      return {
        ...settings.data,
        fallback: brand.data?.newsletter_reply_to ?? "",
      };
    },
  });
  const changed =
    !!baseline &&
    (recipient !== baseline.speaking_notification_email ||
      enabled !== baseline.speaking_notifications_enabled);
  useEffect(() => {
    if (query.data && !changed) {
      setBaseline(query.data);
      setRecipient(query.data.speaking_notification_email);
      setEnabled(query.data.speaking_notifications_enabled);
    }
  }, [query.data, changed]);
  const conflict = !!(
    changed &&
    baseline &&
    query.data &&
    (baseline.speaking_notification_email !==
      query.data.speaking_notification_email ||
      baseline.speaking_notifications_enabled !==
        query.data.speaking_notifications_enabled)
  );
  const save = useMutation({
    mutationFn: async () => {
      if (!query.data || !baseline)
        throw new Error("Load email settings before saving.");
      if (conflict)
        throw new Error(
          "Saved settings changed elsewhere. Your edits are still here; load the latest settings before saving.",
        );
      const normalized = recipient.trim().toLowerCase();
      if (
        (enabled || normalized) &&
        !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(
          normalized || query.data.fallback,
        )
      )
        throw new Error(
          "Enter a valid owner email address, or configure the brand reply-to address.",
        );
      const { data, error } = await supabase
        .from("site_settings_private")
        .update({
          speaking_notifications_enabled: enabled,
          speaking_notification_email: normalized,
        })
        .eq("id", baseline.id)
        .eq(
          "speaking_notifications_enabled",
          baseline.speaking_notifications_enabled,
        )
        .eq("speaking_notification_email", baseline.speaking_notification_email)
        .select("id")
        .maybeSingle();
      if (error || !data)
        throw new Error(
          "Settings could not be saved. Refresh the page and try again.",
        );
      return {
        ...query.data,
        speaking_notifications_enabled: enabled,
        speaking_notification_email: normalized,
      };
    },
    onSuccess: (settings) => {
      client.setQueryData(["speaking-notifications", "settings"], settings);
      setBaseline(settings);
      setRecipient(settings.speaking_notification_email);
      setEnabled(settings.speaking_notifications_enabled);
      void client.invalidateQueries({ queryKey: ["speaking-notifications"] });
    },
  });
  const deliveryHealth = useQuery({
    queryKey: ["speaking-notifications", "health"],
    refetchInterval: 30000,
    queryFn: async () => {
      const [pending, failed] = await Promise.all([
        supabase
          .from("speaking_notification_deliveries")
          .select("id", { count: "exact", head: true })
          .in("status", ["pending", "sending"]),
        supabase
          .from("speaking_notification_deliveries")
          .select("id", { count: "exact", head: true })
          .in("status", ["failed", "needs_review"]),
      ]);
      if (pending.error || failed.error)
        throw new Error(
          "Delivery health is unavailable. Check individual inquiries for their email status.",
        );
      return { pending: pending.count ?? 0, failed: failed.count ?? 0 };
    },
  });
  return (
    <section
      className="admin-card p-5"
      aria-label="Speaking email notifications"
    >
      <h2 className="font-semibold">Email notifications and follow-up</h2>
      <p className="admin-help mt-2">
        When enabled, new inquiries queue an owner notification and an organizer
        acknowledgement. An inquiry still marked New after 48 hours queues one
        owner reminder. No marketing subscription is created.
      </p>
      <QueryNotice
        loading={query.isPending}
        error={query.error}
        retry={() => {
          void query.refetch();
        }}
      />
      {query.data && (
        <form
          className="mt-4 space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            save.mutate();
          }}
        >
          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={enabled}
              disabled={save.isPending}
              onChange={(event) => setEnabled(event.target.checked)}
            />{" "}
            Enable inquiry emails
          </label>
          <label className="block text-sm font-medium">
            Owner notification address
            <input
              className="admin-input mt-2 w-full"
              type="email"
              maxLength={254}
              value={recipient}
              placeholder={query.data.fallback || "you@example.com"}
              disabled={save.isPending}
              onChange={(event) => setRecipient(event.target.value)}
            />
          </label>
          <p className="admin-help">
            Leave blank to use the brand reply-to address
            {query.data.fallback
              ? ` (${query.data.fallback})`
              : " once configured"}
            . Emails use the existing verified sender and Resend service.
            Disabling pauses queued emails; enabling resumes them and applies to
            future inquiries. Earlier inquiries without queued emails are not
            backfilled.
          </p>
          <button
            className="admin-btn-secondary"
            type="submit"
            disabled={!changed || save.isPending || conflict}
          >
            {save.isPending ? "Saving…" : "Save email settings"}
          </button>
          {conflict && (
            <div role="alert" className="admin-notice admin-notice-error">
              <p>
                Saved settings changed elsewhere. Your edits are still here.
                Load the latest saved settings to replace this draft before
                editing again.
              </p>
              <button
                type="button"
                className="admin-btn-secondary mt-2"
                disabled={save.isPending}
                onClick={() => {
                  setBaseline(query.data);
                  setRecipient(query.data.speaking_notification_email);
                  setEnabled(query.data.speaking_notifications_enabled);
                  save.reset();
                }}
              >
                Load latest saved settings
              </button>
            </div>
          )}
          {save.error && (
            <p role="alert" className="admin-notice admin-notice-error">
              {save.error.message}
            </p>
          )}
          {save.isSuccess && !changed && (
            <p role="status" className="admin-help">
              Email settings saved.
            </p>
          )}
        </form>
      )}
      <QueryNotice
        error={deliveryHealth.error}
        retry={() => {
          void deliveryHealth.refetch();
        }}
      />
      {deliveryHealth.data && (
        <p className="admin-help mt-4">
          {deliveryHealth.data.pending} queued or processing ·{" "}
          {deliveryHealth.data.failed} need attention. Open an inquiry to see
          delivery details. Scheduled processing runs every 15 minutes when
          deployed.
        </p>
      )}
    </section>
  );
}
