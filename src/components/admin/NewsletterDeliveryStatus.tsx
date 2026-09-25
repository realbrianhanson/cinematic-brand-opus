import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Loader2, RotateCcw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { pendingBackendUpdate } from "@/lib/adminBackendUpdate";
import QueryNotice from "./QueryNotice";
import {
  loadDeliveryBreakdown,
  loadSendHistory,
  resumeDelivery,
  retryFailedDelivery,
  type DeliveryRunResult,
} from "@/lib/newsletterAdmin";
import {
  canResumeDelivery,
  canRetryFailed,
  explainDeliveryError,
  sendStatusView,
  type SendTone,
} from "@/lib/newsletterStatus";

export interface DeliveryRow {
  id: string;
  week_key: string;
  status: string;
  sent_count: number | null;
  recipient_count: number | null;
  last_error: string | null;
  last_error_status: number | null;
  delivery_lease_until: string | null;
  from_address: string | null;
}

const toneStyles: Record<SendTone, { bg: string; fg: string }> = {
  success: {
    bg: "hsl(var(--admin-sage-soft))",
    fg: "hsl(var(--admin-sage))",
  },
  warning: {
    bg: "hsl(var(--admin-accent-soft))",
    fg: "hsl(var(--admin-accent))",
  },
  info: {
    bg: "hsl(var(--admin-accent-soft))",
    fg: "hsl(var(--admin-accent))",
  },
  danger: {
    bg: "hsl(var(--admin-danger-soft))",
    fg: "hsl(var(--admin-danger))",
  },
  muted: { bg: "transparent", fg: "hsl(var(--admin-text-soft))" },
};

export function SendBadge({
  row,
}: {
  row: {
    status: string;
    sent_count?: number | null;
    recipient_count?: number | null;
  };
}) {
  const view = sendStatusView(row);
  const tone = toneStyles[view.tone];
  return (
    <span
      data-tone={view.tone}
      style={{
        display: "inline-block",
        padding: "3px 10px",
        borderRadius: 4,
        border: "1px solid hsl(var(--admin-border))",
        background: tone.bg,
        color: tone.fg,
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: "0.04em",
        whiteSpace: "nowrap",
      }}
    >
      {view.label}
    </span>
  );
}

function resultMessage(result: DeliveryRunResult, fromAddress: string | null) {
  if (result.state === "sent")
    return {
      title: "Delivered",
      description: `Sent · ${result.sent} of ${result.recipients} delivered.`,
      failed: false,
    };
  const explained = explainDeliveryError({
    status: result.lastErrorStatus,
    detail: result.lastError,
    fromAddress,
  });
  return {
    title: explained?.title ?? "Delivery did not finish",
    description:
      explained?.action ??
      result.message ??
      `${result.sent} of ${result.recipients} delivered. Reload to check the latest state.`,
    failed: true,
  };
}

/** Why a send did not fully deliver, what to do, and a safe retry. */
export function DeliveryProblem({ row }: { row: DeliveryRow }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const needsReceipts = ["failed", "needs_review", "sending"].includes(
    row.status,
  );
  const breakdown = useQuery({
    queryKey: ["newsletter-breakdown", row.id, row.status],
    queryFn: () => loadDeliveryBreakdown(row.id),
    enabled: needsReceipts,
  });
  const run = useMutation({
    mutationFn: (mode: "retry" | "resume") => {
      if (breakdown.isPending || breakdown.error)
        throw new Error("Delivery receipts must be available before sending.");
      return mode === "retry"
        ? retryFailedDelivery(row.id)
        : resumeDelivery(row.id);
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ["newsletter-preview"] });
      void qc.invalidateQueries({ queryKey: ["newsletter-history"] });
      void qc.invalidateQueries({ queryKey: ["newsletter-breakdown"] });
    },
    onSuccess: (result) => {
      const message = resultMessage(result, row.from_address);
      toast({
        title: message.title,
        description: message.description,
        variant: message.failed ? "destructive" : undefined,
      });
    },
    onError: (e: Error) =>
      toast({
        title:
          pendingBackendUpdate(e, "newsletter")?.title ?? "Retry did not start",
        description:
          pendingBackendUpdate(e, "newsletter")?.description ?? e.message,
        variant: "destructive",
      }),
  });

  // While queued for delivery, an older error no longer describes the send.
  const explained =
    row.status === "sending"
      ? null
      : explainDeliveryError({
          status: row.last_error_status,
          detail: row.last_error,
          fromAddress: row.from_address,
        });
  const counts = breakdown.data;
  const backendError = pendingBackendUpdate(run.error, "newsletter")
    ? run.error
    : null;
  const deliveryUnavailable =
    breakdown.isPending || !!breakdown.error || !!backendError;
  const retryable =
    !!counts &&
    (explained?.retryable ?? true) &&
    canRetryFailed({
      status: row.status,
      hasSnapshot: !!row.from_address,
      failed: counts.failed,
      uncertain: counts.uncertain,
      attempting: counts.attempting,
    });
  const resumable = canResumeDelivery(row);
  // A live delivery (or a retry in progress) is not a problem to report yet.
  if (row.status === "sending" && !resumable) return null;
  const shortfall =
    row.status === "sent" && (row.sent_count ?? 0) < (row.recipient_count ?? 0);
  if (!explained && !resumable && !shortfall && row.status !== "failed")
    return null;

  return (
    <div
      role="alert"
      style={{
        border: "1px solid hsl(var(--admin-danger))",
        background: "hsl(var(--admin-danger-soft))",
        borderRadius: 8,
        padding: "12px 14px",
        margin: "0 0 14px",
        fontSize: 13,
        lineHeight: 1.5,
        color: "hsl(var(--admin-text))",
      }}
    >
      <div
        className="flex items-center gap-2"
        style={{ color: "hsl(var(--admin-danger))", fontWeight: 700 }}
      >
        <AlertTriangle size={15} aria-hidden="true" />
        {explained?.title ??
          (resumable
            ? "Delivery paused before it finished"
            : "Not fully delivered")}
      </div>
      {explained && (
        <p style={{ margin: "6px 0 0" }}>{explained.explanation}</p>
      )}
      <p style={{ margin: "6px 0 0" }}>
        <strong>What to do: </strong>
        {explained?.action ??
          "Resume delivery. Recipients who already received it are not emailed again."}
      </p>
      {counts &&
        (counts.failed > 0 || counts.uncertain > 0 || counts.skipped > 0) && (
          <p
            style={{ margin: "6px 0 0", color: "hsl(var(--admin-text-soft))" }}
          >
            {counts.failed} rejected · {counts.uncertain} unknown ·{" "}
            {counts.skipped} unsubscribed before delivery
          </p>
        )}
      {breakdown.isError && (
        <p style={{ margin: "6px 0 0" }}>
          Delivery receipts could not be loaded. Sending stays unavailable until
          they can be verified.
        </p>
      )}
      {backendError && (
        <QueryNotice error={backendError} backendScope="newsletter" />
      )}
      {(retryable || resumable) && (
        <button
          type="button"
          className="admin-btn"
          style={{ marginTop: 10 }}
          disabled={run.isPending || deliveryUnavailable}
          onClick={() => {
            const mode = retryable ? "retry" : "resume";
            const question =
              mode === "retry"
                ? `Retry ${counts?.failed ?? 0} failed recipient(s) for ${row.week_key}? Only recipients Resend rejected are emailed; nobody who already received it gets a second copy.`
                : `Resume delivery of ${row.week_key}? Recipients who already received it are skipped.`;
            if (confirm(question)) run.mutate(mode);
          }}
        >
          {run.isPending ? (
            <>
              <Loader2 size={14} className="animate-spin" /> Sending…
            </>
          ) : (
            <>
              <RotateCcw size={14} />{" "}
              {retryable ? "Retry failed recipients" : "Resume delivery"}
            </>
          )}
        </button>
      )}
    </div>
  );
}

/** The last eight issues with honest delivered counts. */
export function NewsletterHistory() {
  const history = useQuery({
    queryKey: ["newsletter-history"],
    queryFn: loadSendHistory,
    refetchOnWindowFocus: false,
  });
  if (history.isError)
    return (
      <QueryNotice
        error={history.error}
        backendScope="newsletter"
        retry={() => void history.refetch()}
      />
    );
  if (history.isPending || !history.data?.length) return null;
  return (
    <section aria-label="Recent newsletter sends" style={{ marginTop: 16 }}>
      <h3
        style={{
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: "hsl(var(--admin-text-soft))",
          margin: "0 0 8px",
        }}
      >
        Last {history.data.length} weeks
      </h3>
      <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {history.data.map((send) => {
          const explained = explainDeliveryError({
            status: send.last_error_status,
            detail: send.last_error,
          });
          return (
            <li
              key={send.id}
              className="flex flex-wrap items-center justify-between gap-2"
              style={{
                padding: "6px 0",
                borderBottom: "1px solid hsl(var(--admin-border))",
                fontSize: 13,
              }}
            >
              <span style={{ fontFamily: "monospace" }}>{send.week_key}</span>
              <span className="flex flex-wrap items-center gap-2">
                {explained && send.status !== "sent" && (
                  <span
                    style={{ color: "hsl(var(--admin-danger))", fontSize: 12 }}
                  >
                    {explained.title}
                  </span>
                )}
                <SendBadge row={send} />
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
