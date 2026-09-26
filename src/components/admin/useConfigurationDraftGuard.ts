import { useBlocker } from "@tanstack/react-router";

/** Protect both internal navigation and closing/reloading the tab. */
export function useConfigurationDraftGuard(dirty: boolean, pending: boolean) {
  useBlocker({
    shouldBlockFn: () => {
      if (pending) {
        window.alert("Wait for the current save to finish before leaving.");
        return true;
      }
      return dirty && !confirmDiscardAdminDraft();
    },
    enableBeforeUnload: () => dirty || pending,
  });
}

export function confirmDiscardAdminDraft() {
  return window.confirm(
    "Discard your unsaved changes and load the saved version?",
  );
}
