import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { invokeOfferApi, type OfferHealth } from "@/lib/offers";
import { toast } from "@/hooks/use-toast";
import OfferConfirmDialog from "./OfferConfirmDialog";

/** Mirrors `delivery_last_issue` from offers-api `health`. No recipient data */
export interface OfferDeliveryIssue {
  id: string;
  status: "pending" | "sending" | "failed" | "needs_review";
  attempts: number;
  provider_status: number | null;
  detail: string | null;
  at: string | null;
  next_attempt_at: string | null;
}
/** `OfferHealth` plus delivery observability, independent of a retry schedule. */
export type OfferDeliveryHealthData = OfferHealth & {
  delivery_failed?: number;
  delivery_next_retry_at?: string | null;
  delivery_last_issue?: OfferDeliveryIssue | null;
};
type RetryResult = {
  sent: number;
  remaining: number;
  stopped?: number;
  errors?: number;
  requeued?: boolean;
};

const MAX_TRIES = 10;
const RETRYING = new Set(["pending", "sending"]);
const STOPPED = new Set(["failed", "needs_review"]);

/** Drops trailing periods/ellipses so our copy never ends a sentence on one */
const unperiod = (value: string) => value.trim().replace(/[.…]+$/, "");
const when = (value: string | null | undefined) =>
  value
    ? new Date(value).toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : null;
const reasonOf = (issue: OfferDeliveryIssue) =>
  unperiod(issue.detail || "no reason was recorded");

function pendingCopy(
  issue: OfferDeliveryIssue,
  fallbackNext: string | null | undefined,
) {
  const at = when(issue.at);
  const next = when(issue.next_attempt_at ?? fallbackNext);
  const timing =
    issue.status === "sending"
      ? "An attempt is in progress"
      : next
        ? `Retry eligible after ${next}`
        : "Retry timing is unavailable";
  return `Download emails aren't going out yet. Last try${at ? ` ${at}` : ""}: ${reasonOf(issue)}. ${timing}. Use Retry due emails now to process eligible messages. Automatic retries require a configured schedule. Customers can still use their private link`;
}
function failedCopy(count: number) {
  const one = count === 1;
  return `${count} download email${one ? "" : "s"} stopped after ${MAX_TRIES} tries. Resend never accepted ${one ? "it" : "them"}, so fix the cause above and hit Requeue`;
}
const NEEDS_REVIEW_COPY =
  "An email may have reached Resend before we lost track of it. Check the Resend log first. If it shows no send, hit Requeue";

function IssueMeta({ issue }: { issue: OfferDeliveryIssue }) {
  return (
    <p className="admin-help text-xs">
      Try {issue.attempts} of {MAX_TRIES}
      {issue.provider_status
        ? ` · Resend answered HTTP ${issue.provider_status}`
        : ""}
    </p>
  );
}

function useRequeue(refresh: () => void) {
  return useMutation({
    mutationFn: (id: string) =>
      invokeOfferApi<RetryResult>({
        action: "retry_deliveries",
        requeue_id: id,
      }),
    onSuccess: (result) => {
      toast({
        title: "Email requeued",
        description: `${result.sent} accepted by Resend on this run. Remaining messages stay queued for the next manual or configured scheduled run`,
      });
      refresh();
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        title: "Requeue didn't go through",
        description: unperiod(
          error instanceof Error && error.message
            ? error.message
            : "Try again in a minute",
        ),
      });
    },
  });
}

function RequeueControl({
  issue,
  ready,
  refresh,
}: {
  issue: OfferDeliveryIssue;
  ready: boolean;
  refresh: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const requeue = useRequeue(refresh);
  const review = issue.status === "needs_review";
  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <button
          className="admin-btn-secondary"
          disabled={!ready || requeue.isPending}
          onClick={() => setConfirming(true)}
        >
          {requeue.isPending ? "Requeuing…" : "Requeue"}
        </button>
        {!ready && (
          <span className="admin-help">
            Finish the sender setup above first
          </span>
        )}
      </div>
      <OfferConfirmDialog
        open={confirming}
        title="Requeue this download email?"
        description={
          review
            ? "Only do this if the Resend log shows no send for it. We send the same saved message with the same duplicate protection and try it right away"
            : "Resend never accepted this email. We send the same saved message right away, then leave it queued for the next manual or configured scheduled run if it still fails"
        }
        confirmLabel="Requeue email"
        onCancel={() => setConfirming(false)}
        onConfirm={() => {
          setConfirming(false);
          requeue.mutate(issue.id);
        }}
      />
    </>
  );
}

function RetryPendingButton({
  health,
  refresh,
}: {
  health?: OfferDeliveryHealthData;
  refresh: () => void;
}) {
  const [retrying, setRetrying] = useState(false);
  const [notice, setNotice] = useState("");
  const run = async () => {
    setRetrying(true);
    setNotice("");
    try {
      const result = await invokeOfferApi<RetryResult>({
        action: "retry_deliveries",
      });
      setNotice(
        `${result.sent} accepted by Resend. ${result.remaining} still waiting or stopped in this batch`,
      );
      refresh();
    } catch (reason) {
      setNotice(
        unperiod(
          reason instanceof Error ? reason.message : "Delivery retry failed",
        ),
      );
    } finally {
      setRetrying(false);
    }
  };
  return (
    <>
      <button
        className="admin-btn-secondary"
        disabled={
          retrying || !health?.delivery_ready || !health?.delivery_pending
        }
        onClick={() => void run()}
      >
        {retrying ? "Retrying…" : "Retry due emails now (up to 3)"}
      </button>
      {notice && (
        <p role="status" className="admin-help">
          {notice}
        </p>
      )}
    </>
  );
}

/** Download email queue: counts, plain-English problems, and Requeue */
export default function OfferDeliveryHealth({
  health,
  refresh,
}: {
  health?: OfferDeliveryHealthData;
  refresh: () => void;
}) {
  const issue = health?.delivery_last_issue ?? null;
  const failed = health?.delivery_failed ?? 0;
  const review = health?.delivery_needs_review ?? 0;
  const retryingIssue = issue && RETRYING.has(issue.status) ? issue : null;
  const stoppedIssue = issue && STOPPED.has(issue.status) ? issue : null;
  const stopped = failed > 0 || review > 0;
  return (
    <div className="border-t pt-4 space-y-3">
      <h3 className="font-semibold">Download email delivery</h3>
      <p className="admin-help">
        {health?.delivery_pending ?? 0} pending · {review} need review ·{" "}
        {failed} failed. Resend accepting an email doesn't prove it reached the
        inbox. Customers can recover links at /offer-access?recover=1
      </p>
      {!!health?.delivery_missing?.length && (
        <p className="admin-help">
          Missing: {health.delivery_missing.join(", ")}. Set sender and reply-to
          in Brand & publishing and RESEND_API_KEY in server secrets
        </p>
      )}
      {retryingIssue && (
        <div className="admin-notice space-y-1">
          <p role="status">
            {pendingCopy(retryingIssue, health?.delivery_next_retry_at)}
          </p>
          <IssueMeta issue={retryingIssue} />
        </div>
      )}
      {stopped && (
        <div className="admin-notice space-y-2 text-amber-800 dark:text-amber-200">
          {stoppedIssue && (
            <p>
              Last try{stoppedIssue.at ? ` ${when(stoppedIssue.at)}` : ""}:{" "}
              {reasonOf(stoppedIssue)}
            </p>
          )}
          {failed > 0 && <p role="status">{failedCopy(failed)}</p>}
          {review > 0 && <p role="status">{NEEDS_REVIEW_COPY}</p>}
          {stoppedIssue ? (
            <>
              <IssueMeta issue={stoppedIssue} />
              <RequeueControl
                issue={stoppedIssue}
                ready={!!health?.delivery_ready}
                refresh={refresh}
              />
            </>
          ) : (
            <p className="admin-help">
              Requeue shows up here once the email that's still retrying settles
            </p>
          )}
        </div>
      )}
      <RetryPendingButton health={health} refresh={refresh} />
    </div>
  );
}
