import { useCallback, useEffect, useId, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { buttonVariants } from "@/components/ui/button";
import { errorMessage } from "@/lib/errorMessage";
import {
  deleteMedia,
  findMediaUsage,
  type DeleteMediaResult,
  type MediaFile,
  type MediaUsage,
} from "@/lib/mediaDelete";

/** How many page titles the dialog lists before summarising the rest. */
const TITLE_PREVIEW = 5;

type UsageState =
  | { status: "checking" }
  | { status: "ready"; usage: MediaUsage }
  | { status: "error"; message: string };

interface MediaDeleteDialogProps {
  item: MediaFile | null;
  onClose: () => void;
  onDeleted: (item: MediaFile, result: DeleteMediaResult) => void;
  onFailed: (message: string) => void;
}

const pageCount = (usage: MediaUsage) =>
  `${usage.total}${usage.truncated ? "+" : ""} ${usage.total === 1 && !usage.truncated ? "page" : "pages"}`;

function UsageSummary({
  state,
  onRetry,
}: {
  state: UsageState;
  onRetry: () => void;
}) {
  if (state.status === "checking") {
    return (
      <p className="flex items-center gap-2 text-sm" role="status">
        <Loader2 size={14} className="animate-spin" aria-hidden />
        Checking where this file is used…
      </p>
    );
  }
  if (state.status === "error") {
    return (
      <div className="space-y-2 text-sm" role="alert">
        <p>{state.message}</p>
        <button type="button" className="admin-btn-ghost" onClick={onRetry}>
          Check again
        </button>
      </div>
    );
  }
  const { usage } = state;
  if (usage.total === 0) {
    return (
      <p className="text-sm">
        Not used on any post, topic guide, page, offer or news item
      </p>
    );
  }
  const shown = usage.titles.slice(0, TITLE_PREVIEW);
  const more = usage.total - shown.length;
  return (
    <div className="space-y-2 text-sm" role="alert">
      <p className="font-semibold">
        Used on {pageCount(usage)}: {shown.join(", ")}
        {more > 0 ? ` and ${more}${usage.truncated ? "+" : ""} more` : ""}
      </p>
      <p>Those pages will show a broken image after you delete it</p>
    </div>
  );
}

/**
 * Confirmation step for permanently deleting a media file. It checks where
 * the file is used first. When the file is in use, or the check fails, the
 * Delete button stays disabled until the admin ticks an explicit
 * acknowledgement. Substring matching can over-report, so a hard block would
 * strand files; the second confirmation keeps deletion possible but deliberate.
 */
const MediaDeleteDialog = ({
  item,
  onClose,
  onDeleted,
  onFailed,
}: MediaDeleteDialogProps) => {
  const ackId = useId();
  const [usageState, setUsageState] = useState<UsageState>({
    status: "checking",
  });
  const [acknowledged, setAcknowledged] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!item) return;
    let cancelled = false;
    setUsageState({ status: "checking" });
    setAcknowledged(false);
    findMediaUsage(item)
      .then((usage) => {
        if (!cancelled) setUsageState({ status: "ready", usage });
      })
      .catch((err: unknown) => {
        if (!cancelled)
          setUsageState({ status: "error", message: errorMessage(err) });
      });
    return () => {
      cancelled = true;
    };
  }, [item, attempt]);

  const retryCheck = useCallback(() => setAttempt((n) => n + 1), []);

  const needsAck =
    usageState.status === "error" ||
    (usageState.status === "ready" && usageState.usage.total > 0);
  const canDelete =
    !!item &&
    !deleting &&
    usageState.status !== "checking" &&
    (!needsAck || acknowledged);

  const confirm = async () => {
    if (!item || !canDelete) return;
    setDeleting(true);
    try {
      const result = await deleteMedia(item);
      onDeleted(item, result);
    } catch (err) {
      onFailed(errorMessage(err));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <AlertDialog
      open={!!item}
      onOpenChange={(open) => {
        if (!open && !deleting) onClose();
      }}
    >
      <AlertDialogContent className="admin-shell">
        <AlertDialogTitle className="break-all">
          Delete “{item?.name}”?
        </AlertDialogTitle>
        <AlertDialogDescription>
          This permanently removes the file from storage. You can't undo it
        </AlertDialogDescription>
        <UsageSummary state={usageState} onRetry={retryCheck} />
        {needsAck && (
          <label htmlFor={ackId} className="flex items-start gap-2 text-sm">
            <input
              id={ackId}
              type="checkbox"
              checked={acknowledged}
              onChange={(e) => setAcknowledged(e.target.checked)}
              disabled={deleting}
              className="mt-0.5"
            />
            {usageState.status === "error"
              ? "Delete anyway. I understand pages using this file may break"
              : "I understand these pages will show a broken image"}
          </label>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className={buttonVariants({ variant: "destructive" })}
            disabled={!canDelete}
            onClick={(e) => {
              e.preventDefault();
              void confirm();
            }}
          >
            {deleting ? "Deleting…" : "Delete file"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default MediaDeleteDialog;
