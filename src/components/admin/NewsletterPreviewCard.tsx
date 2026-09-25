import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { safeMutation } from "@/lib/withTimeout";
import { functionPayload } from "@/lib/newsletterAdmin";
import { Loader2, Mail, RefreshCw, X } from "lucide-react";
import QueryNotice from "./QueryNotice";
import {
  DeliveryProblem,
  NewsletterHistory,
  SendBadge,
  type DeliveryRow,
} from "./NewsletterDeliveryStatus";

// Returns the current ISO week key (e.g. "2026-W30") in UTC, matching the
// server-side helper in _shared/newsletterCompose.ts.
function currentIsoWeekKey(): string {
  const d = new Date();
  const t = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
  );
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(
    ((t.getTime() - yearStart.getTime()) / 86400000 + 1) / 7,
  );
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

interface Blurb {
  slug: string;
  blurb: string;
}

interface PreviewRow extends DeliveryRow {
  subject: string | null;
  intro: string | null;
  post_blurbs: Blurb[] | null;
  post_ids: string[] | null;
}

// last_error* ship in 20260923140000_newsletter_truth.sql.
const PREVIEW_COLUMNS =
  "id, week_key, status, subject, intro, post_blurbs, post_ids, sent_count, recipient_count, last_error, last_error_status, delivery_lease_until, from_address:delivery_template->>from";

const NewsletterPreviewCard = () => {
  const { toast } = useToast();
  const qc = useQueryClient();
  const weekKey = currentIsoWeekKey();

  const {
    data: row,
    isLoading,
    error: loadError,
    refetch,
  } = useQuery({
    queryKey: ["newsletter-preview", weekKey],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("newsletter_sends")
        .select(PREVIEW_COLUMNS)
        .eq("week_key", weekKey)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as PreviewRow | null;
    },
    refetchOnWindowFocus: false,
  });

  const cancelMutation = useMutation({
    mutationFn: () =>
      safeMutation(async () => {
        if (loadError)
          throw new Error(
            "Newsletter details must be available before making changes.",
          );
        if (!row?.id) throw new Error("No preview to cancel");
        const { data: cancelled, error } = await supabase
          .from("newsletter_sends")
          .update({ status: "cancelled" })
          .eq("id", row.id)
          .eq("status", "preview")
          .select("id")
          .maybeSingle();
        if (error) throw error;
        if (!cancelled)
          throw new Error(
            "The send has already started or changed. Reload to check its status.",
          );
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["newsletter-preview", weekKey] });
      toast({
        title: "Cancelled",
        description: "This week's newsletter will not send.",
      });
    },
    onError: (e: Error) =>
      toast({
        title: "Cancel failed",
        description: e.message,
        variant: "destructive",
      }),
  });

  const regenerateMutation = useMutation({
    mutationFn: () =>
      safeMutation(async () => {
        if (loadError)
          throw new Error(
            "Newsletter details must be available before composing a preview.",
          );
        const response = await supabase.functions.invoke(
          "compose-weekly-newsletter-preview",
          { body: {} },
        );
        const { payload } = await functionPayload(
          response.data,
          response.error,
        );
        const data = payload as {
          ok?: boolean;
          skipped?: string;
          error?: string;
          missing?: string[];
          preview_email_sent?: boolean;
          preview_email_error?: string | null;
        };
        if (response.error && !data.error && !data.missing?.length)
          throw response.error;
        if (data.missing?.length)
          throw new Error(`Email isn't configured: ${data.missing.join(", ")}`);
        if (!data?.ok || data?.skipped)
          throw new Error(
            data?.error || data?.skipped || "Preview was not generated.",
          );
        return data;
      }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["newsletter-preview", weekKey] });
      toast({
        title: "Preview saved",
        description: data.preview_email_sent
          ? "The preview was saved and emailed."
          : data.preview_email_error
            ? `The preview was saved, but the preview email failed: ${data.preview_email_error}`
            : "The preview was saved. No preview email was sent; check your email configuration.",
      });
    },
    onError: (e: Error) =>
      toast({
        title: "Regenerate failed",
        description: e.message,
        variant: "destructive",
      }),
  });

  const shell = (children: React.ReactNode) => (
    <div
      id="newsletter"
      className="admin-card"
      style={{ padding: 20, marginBottom: 32, scrollMarginTop: 80 }}
    >
      <div className="flex items-center gap-2" style={{ marginBottom: 12 }}>
        <Mail size={16} style={{ color: "hsl(var(--admin-accent))" }} />
        <span
          className="font-body"
          style={{
            fontSize: 15,
            fontWeight: 700,
            color: "hsl(var(--admin-text))",
          }}
        >
          Weekly newsletter — {weekKey}
        </span>
      </div>
      {children}
      <NewsletterHistory />
    </div>
  );

  if (isLoading) {
    return shell(
      <div
        className="flex items-center gap-2"
        style={{ color: "hsl(var(--admin-text-soft))", fontSize: 14 }}
      >
        <Loader2 size={14} className="animate-spin" /> Loading preview…
      </div>,
    );
  }

  if (loadError)
    return shell(
      <QueryNotice
        error={loadError}
        backendScope="newsletter"
        retry={() => void refetch()}
      />,
    );

  if (!row) {
    return shell(
      <div style={{ fontSize: 14, color: "hsl(var(--admin-text-soft))" }}>
        No preview yet for this week. Composition runs Monday 14:00 UTC. You can
        generate one now:
        <div style={{ marginTop: 10 }}>
          <button
            className="admin-btn"
            onClick={() => regenerateMutation.mutate()}
            disabled={regenerateMutation.isPending || cancelMutation.isPending}
          >
            {regenerateMutation.isPending ? (
              <>
                <Loader2 size={14} className="animate-spin" /> Composing…
              </>
            ) : (
              <>
                <RefreshCw size={14} /> Compose preview
              </>
            )}
          </button>
        </div>
      </div>,
    );
  }

  return shell(
    <div>
      <div style={{ marginBottom: 12 }}>
        <SendBadge row={row} />
      </div>
      <DeliveryProblem row={row} />
      <div
        style={{
          fontSize: 17,
          fontWeight: 700,
          color: "hsl(var(--admin-text))",
          marginBottom: 6,
        }}
      >
        {row.subject || (
          <em style={{ color: "hsl(var(--admin-text-soft))" }}>(no subject)</em>
        )}
      </div>
      {row.intro ? (
        <p
          style={{
            fontSize: 14,
            lineHeight: 1.55,
            color: "hsl(var(--admin-text-soft))",
            margin: "0 0 14px",
          }}
        >
          {row.intro}
        </p>
      ) : null}
      {Array.isArray(row.post_blurbs) && row.post_blurbs.length > 0 ? (
        <ol
          style={{
            margin: "0 0 16px",
            padding: "0 0 0 20px",
            fontSize: 13,
            lineHeight: 1.5,
            color: "hsl(var(--admin-text))",
          }}
        >
          {row.post_blurbs.map((b) => (
            <li key={b.slug} style={{ marginBottom: 8 }}>
              <div
                style={{
                  fontFamily: "monospace",
                  fontSize: 11,
                  color: "hsl(var(--admin-text-soft))",
                }}
              >
                {b.slug}
              </div>
              <div>{b.blurb}</div>
            </li>
          ))}
        </ol>
      ) : null}

      {row.status === "preview" ? (
        <div className="flex flex-wrap gap-2" style={{ marginTop: 8 }}>
          <button
            className="admin-btn"
            onClick={() => {
              if (confirm("Cancel this week's newsletter send?"))
                cancelMutation.mutate();
            }}
            disabled={cancelMutation.isPending || regenerateMutation.isPending}
          >
            {cancelMutation.isPending ? (
              <>
                <Loader2 size={14} className="animate-spin" /> Cancelling…
              </>
            ) : (
              <>
                <X size={14} /> Cancel this week's send
              </>
            )}
          </button>
          <button
            className="admin-btn"
            onClick={() => regenerateMutation.mutate()}
            disabled={regenerateMutation.isPending || cancelMutation.isPending}
          >
            {regenerateMutation.isPending ? (
              <>
                <Loader2 size={14} className="animate-spin" /> Regenerating…
              </>
            ) : (
              <>
                <RefreshCw size={14} /> Regenerate
              </>
            )}
          </button>
        </div>
      ) : null}
    </div>,
  );
};

export default NewsletterPreviewCard;
