import type { ReactNode } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { OfferChange } from "@/lib/offerBuilderDiff";

/** A confirmation step that shows exactly what the action changes. */
export default function OfferConfirmDialog({
  open,
  title,
  description,
  changes,
  noChanges,
  warning,
  confirmLabel,
  busy = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description: ReactNode;
  changes?: OfferChange[];
  noChanges?: string;
  warning?: string;
  confirmLabel: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !busy) onCancel();
      }}
    >
      <AlertDialogContent className="admin-shell max-h-[90vh] overflow-y-auto">
        <AlertDialogTitle>{title}</AlertDialogTitle>
        <AlertDialogDescription>{description}</AlertDialogDescription>
        {warning && (
          <p className="admin-notice text-sm text-amber-700 dark:text-amber-300">
            {warning}
          </p>
        )}
        {changes &&
          (changes.length ? (
            <dl
              aria-label="Changes"
              className="divide-y divide-current/10 rounded-lg border border-current/10 text-sm"
            >
              {changes.map((change) => (
                <div key={change.label} className="grid gap-1 p-3">
                  <dt className="font-semibold">{change.label}</dt>
                  <dd className="break-words">
                    <span className="opacity-70">{change.before}</span>
                    {" → "}
                    <span>{change.after}</span>
                  </dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="text-sm">{noChanges}</p>
          ))}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={busy}
            onClick={(event) => {
              event.preventDefault();
              onConfirm();
            }}
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
