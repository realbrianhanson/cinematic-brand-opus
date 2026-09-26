import { useEffect, useRef, useState } from "react";
import {
  clearFirstBuildRecovery,
  emptyFirstBuildSnapshot,
  readFirstBuildRecovery,
  saveFirstBuildRecovery,
  type FirstBuildSnapshot,
} from "@/lib/firstAiBuildRecovery";

type Status =
  | "checking"
  | "ready"
  | "saved"
  | "available"
  | "restored"
  | "expired"
  | "invalid"
  | "unavailable"
  | "conflict"
  | "clear-failed";
export function useFirstBuildRecovery(scope: string) {
  const [snapshot, setSnapshot] = useState(emptyFirstBuildSnapshot);
  const [status, setStatus] = useState<Status>("checking");
  const expectedRaw = useRef<string | null>(null);
  const current = useRef(snapshot);
  const initialized = useRef(false);
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    try {
      const result = readFirstBuildRecovery(window.localStorage, scope);
      if (result.state === "available") expectedRaw.current = result.raw;
      setStatus(result.state === "empty" ? "ready" : result.state);
    } catch {
      setStatus("unavailable");
    }
  }, [scope]);

  function update(
    change: (previous: FirstBuildSnapshot) => FirstBuildSnapshot,
  ) {
    const next = change(current.current);
    current.current = next;
    setSnapshot(next);
    if (!["ready", "saved", "restored", "expired"].includes(status)) return;
    try {
      const result = saveFirstBuildRecovery(
        window.localStorage,
        scope,
        next,
        expectedRaw.current,
      );
      if (result.state === "saved") expectedRaw.current = result.raw;
      setStatus(result.state);
    } catch {
      setStatus("unavailable");
    }
  }
  function restore() {
    try {
      // Re-read at the explicit action; another tab may have changed the copy.
      const result = readFirstBuildRecovery(window.localStorage, scope);
      if (result.state === "available") {
        expectedRaw.current = result.raw;
        current.current = result.snapshot;
        setSnapshot(result.snapshot);
        setStatus("restored");
      } else {
        if (result.state === "empty" || result.state === "expired")
          expectedRaw.current = null;
        setStatus(result.state === "empty" ? "ready" : result.state);
      }
    } catch {
      setStatus("unavailable");
    }
  }
  function reset() {
    current.current = emptyFirstBuildSnapshot();
    setSnapshot(current.current);
    try {
      const removed = clearFirstBuildRecovery(window.localStorage, scope);
      if (removed) expectedRaw.current = null;
      setStatus(removed ? "ready" : "clear-failed");
    } catch {
      setStatus("clear-failed");
    }
  }
  return { snapshot, status, update, restore, reset };
}
