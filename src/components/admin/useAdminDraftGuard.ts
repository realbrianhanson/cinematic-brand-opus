import { useCallback, useRef, useState } from "react";
import { useBlocker } from "@tanstack/react-router";

/** The same leave-confirmation pattern as PostEditor, without writing drafts. */
export function useAdminDraftGuard(snapshot: object, documentKey: string) {
  const encoded = JSON.stringify(snapshot);
  const current = useRef(encoded);
  current.current = encoded;
  const baseline = useRef(encoded);
  const key = useRef(documentKey);
  const [, changed] = useState(0);
  if (key.current !== documentKey) {
    key.current = documentKey;
    baseline.current = encoded;
  }
  const dirty = current.current !== baseline.current;
  useBlocker({
    shouldBlockFn: () =>
      current.current !== baseline.current &&
      !window.confirm(
        "You have unsaved changes. Leave this page and discard them?",
      ),
    enableBeforeUnload: dirty,
  });

  // Update synchronously before a successful save navigates away. Mark only
  // the submitted version: typing during a request must remain protected.
  const markSaved = useCallback((saved: object) => {
    baseline.current = JSON.stringify(saved);
    changed((revision) => revision + 1);
  }, []);
  return { dirty, markSaved };
}
