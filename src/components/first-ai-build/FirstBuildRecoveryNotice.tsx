import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const button =
  "inline-flex min-h-11 items-center justify-center rounded-md border border-white/25 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--brand-accent)]";
export function FirstBuildRecoveryNotice({
  status,
  hasAnswers,
  onRestore,
  onReset,
}: {
  status: string;
  hasAnswers: boolean;
  onRestore: () => void;
  onReset: () => void;
}) {
  const [confirmReset, setConfirmReset] = useState(false);
  const needsDecision = status === "available" || status === "invalid";
  const message: Record<string, string> = {
    checking: "Checking this browser for a saved plan…",
    ready: "Your progress will be saved on this device as you work.",
    available:
      "A saved plan or draft is available in this browser. Resume it or start over.",
    saved: "Your latest answers and plan are saved on this device.",
    restored:
      "Your saved progress is restored. You can continue where you left off.",
    expired:
      "Your previous saved copy expired and was removed. Start a new plan below.",
    invalid:
      "The saved copy is from a different version or could not be read. Start over to remove it and create a new plan.",
    unavailable:
      "Temporary session: browser saving is unavailable. Your current answers still work here. Download or print your plan before leaving.",
    conflict:
      "Another tab changed the saved copy. Your current answers are still here, but new changes in this tab are not being saved. Download or print your plan before leaving.",
    "clear-failed":
      "Your answers were cleared from this page, but browser storage could not be cleared. A saved copy may remain. Remove this website’s saved data in browser settings if you use a shared device.",
  };
  return (
    <aside
      className="mb-8 rounded-lg border border-white/20 p-4 sm:p-5"
      aria-label="Your saved progress"
    >
      <p role="status" className="text-sm font-medium">
        {message[status]}
      </p>
      <p className="mt-2 max-w-4xl text-xs leading-relaxed text-white/65">
        This saved copy stays in this browser. Optional descriptions are not
        sent to our server. Saved progress is available for 7 days after your
        last edit, then removed on your next visit. It does not sync between
        devices or browsers. Anyone using this browser may be able to see it.
        Use sample details and choose Start over to remove the saved copy.
      </p>
      {(needsDecision || hasAnswers || status === "clear-failed") && (
        <div className="mt-3 flex flex-wrap gap-3">
          {status === "available" && (
            <button type="button" className={button} onClick={onRestore}>
              Resume saved progress
            </button>
          )}
          <button
            type="button"
            className={button}
            onClick={() => setConfirmReset(true)}
          >
            Start over
          </button>
        </div>
      )}
      <AlertDialog open={confirmReset} onOpenChange={setConfirmReset}>
        <AlertDialogContent className="border-white/20 bg-[var(--site-surface,var(--brand-backdrop))] text-white">
          <AlertDialogHeader>
            <AlertDialogTitle>Start a new build plan?</AlertDialogTitle>
            <AlertDialogDescription className="text-white/75">
              This clears your current answers and this planner’s saved copy in
              this browser. Download or print any plan you want to keep first.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className={button}>
              Keep my progress
            </AlertDialogCancel>
            <AlertDialogAction className={button} onClick={onReset}>
              Clear and start over
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </aside>
  );
}
