import { useEffect, useId, useState } from "react";
import { AlertTriangle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { MIN_OVERRIDE_REASON, type PublishMode } from "./manualPublishClient";

export interface OverrideRequest {
  postId: string;
  title?: string;
  mode: PublishMode;
  /** ISO time for mode 'schedule'. */
  scheduledAt: string | null;
  failures: string[];
  reasonError: string | null;
}

/**
 * Override for ONE article. The typed reason is recorded with the article and
 * in the override audit log. There is no multi-article version on purpose.
 */
export default function PublishOverrideDialog({
  request,
  pending,
  onCancel,
  onConfirm,
  stateNote,
}: {
  request: OverrideRequest | null;
  pending: boolean;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
  /** What happened to the article so far, e.g. "Your changes were saved". */
  stateNote?: string;
}) {
  const [reason, setReason] = useState("");
  const fieldId = useId();
  const errorId = `${fieldId}-error`;
  const open = !!request;
  useEffect(() => {
    if (open) setReason("");
  }, [open, request?.postId, request?.mode]);
  const schedule = request?.mode === "schedule";
  const trimmed = reason.trim().length;
  const short = trimmed < MIN_OVERRIDE_REASON;
  const action = schedule ? "Schedule anyway" : "Publish anyway";
  const when =
    schedule && request?.scheduledAt
      ? ` for ${new Date(request.scheduledAt).toLocaleString()}`
      : "";
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !pending) onCancel();
      }}
    >
      <DialogContent className="admin-shell max-h-[85dvh] overflow-y-auto">
        <DialogTitle className="flex items-center gap-2">
          <AlertTriangle size={20} aria-hidden="true" />
          {schedule
            ? "This article didn't pass the checks for scheduling"
            : "This article didn't pass the publishing checks"}
        </DialogTitle>
        <DialogDescription>
          {stateNote ? `${stateNote} ` : ""}
          Fix the issues below, or type a reason to{" "}
          {schedule ? `schedule it anyway${when}` : "publish it anyway"}. The
          reason is saved with this one article.
        </DialogDescription>
        {request?.title && <p className="font-medium">{request.title}</p>}
        <ul className="list-disc pl-5 text-sm space-y-2">
          {request?.failures.map((failure, i) => (
            <li key={i}>{failure}</li>
          ))}
        </ul>
        <label htmlFor={fieldId} className="admin-label">
          Reason for overriding
        </label>
        <textarea
          id={fieldId}
          className="admin-input w-full"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          rows={3}
          maxLength={1000}
          disabled={pending}
          aria-describedby={request?.reasonError ? errorId : undefined}
          aria-invalid={!!request?.reasonError}
          placeholder="Why is this article OK to go live despite these issues?"
        />
        <p className="admin-help">
          {short
            ? `At least ${MIN_OVERRIDE_REASON} characters (${trimmed}/${MIN_OVERRIDE_REASON})`
            : "This reason will be recorded"}
        </p>
        {request?.reasonError && (
          <p id={errorId} role="alert" className="text-sm text-red-400">
            {request.reasonError}
          </p>
        )}
        <div className="flex justify-end gap-2 flex-wrap">
          <button
            type="button"
            className="admin-btn-ghost"
            disabled={pending}
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            type="button"
            className="admin-btn-primary"
            disabled={pending || short}
            onClick={() => onConfirm(reason.trim())}
          >
            {pending ? (schedule ? "Scheduling…" : "Publishing…") : action}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
