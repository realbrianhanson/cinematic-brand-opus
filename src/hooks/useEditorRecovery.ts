import { useEffect, useRef, useState } from "react";
import { useBlocker } from "@tanstack/react-router";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";

/**
 * JSON with object keys sorted at every level. A jsonb round-trip reorders
 * keys, so comparing raw JSON.stringify output made every stored copy look
 * different and showed a false "restore?" banner.
 */
export function stableSnapshot(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(
          Object.entries(v as Record<string, unknown>).sort(([a], [b]) =>
            a < b ? -1 : a > b ? 1 : 0,
          ),
        )
      : v,
  );
}

function restable(encoded: string): string {
  try {
    return stableSnapshot(JSON.parse(encoded));
  } catch {
    return encoded;
  }
}

const READY = "Draft protection ready";

/**
 * Saves a working copy only. A published article changes only on explicit Save.
 * `serverUpdatedAt` is the loaded article's updated_at: a stored copy older
 * than the last save is stale, so it is removed instead of offered.
 */
export function useEditorRecovery(
  key: string,
  snapshot: Record<string, unknown>,
  ready: boolean,
  serverUpdatedAt?: string | null,
) {
  const { user } = useAuth();
  const encoded = stableSnapshot(snapshot);
  const current = useRef(encoded);
  current.current = encoded;
  const baseline = useRef<string | null>(null);
  const version = useRef<string | null>(null);
  const latestSaved = useRef<string | null>(null);
  const writing = useRef(false);
  const [saveTick, setSaveTick] = useState(0);
  const finished = useRef(false);
  const [loaded, setLoaded] = useState(false);
  const [recovery, setRecovery] = useState<Record<string, unknown> | null>(
    null,
  );
  const [message, setMessage] = useState("Loading draft protection…");
  const dirty = loaded && baseline.current !== encoded && !finished.current;
  const storageKey = `editor-working-copy:${user?.id}:${key}`;
  const serverVersion = useRef(serverUpdatedAt);
  serverVersion.current = serverUpdatedAt;
  useEffect(() => {
    if (!ready || !user) return;
    let active = true;
    baseline.current = current.current;
    version.current = null;
    latestSaved.current = null;
    finished.current = false;
    setLoaded(false);
    const serverMs = serverVersion.current
      ? Date.parse(serverVersion.current)
      : NaN;
    const stale = (ms: number) => Number.isFinite(serverMs) && ms <= serverMs;
    (async () => {
      const { data, error } = await supabase
        .from("post_editor_drafts")
        .select("snapshot,updated_at")
        .eq("user_id", user.id)
        .eq("document_key", key)
        .abortSignal(AbortSignal.timeout(15000))
        .maybeSingle();
      if (!active) return;
      if (error) {
        setMessage(
          "Account recovery unavailable. Changes will be backed up on this device.",
        );
      }
      let candidate: Record<string, unknown> | undefined;
      let remoteMs = -Infinity;
      if (data && stale(Date.parse(data.updated_at))) {
        // The article was saved after this copy was taken: nothing to recover.
        void supabase
          .from("post_editor_drafts")
          .delete()
          .eq("user_id", user.id)
          .eq("document_key", key)
          .eq("updated_at", data.updated_at)
          .then(() => undefined);
      } else if (data) {
        version.current = data.updated_at;
        candidate = data.snapshot as Record<string, unknown>;
        remoteMs = Date.parse(data.updated_at);
      }
      try {
        const local = JSON.parse(localStorage.getItem(storageKey) || "null");
        if (local?.snapshot && stale(Number(local.savedAt)))
          localStorage.removeItem(storageKey);
        else if (local?.snapshot && Number(local.savedAt) > remoteMs)
          candidate = local.snapshot;
      } catch {
        /* Browser storage is optional. */
      }
      if (candidate && stableSnapshot(candidate) !== baseline.current) {
        setRecovery(candidate);
        setMessage(
          "Working copy found · choose Restore or Keep. This device keeps a backup meanwhile",
        );
      } else if (!error) setMessage(READY);
      setLoaded(true);
    })();
    return () => {
      active = false;
    };
  }, [ready, user?.id, key, storageKey]);
  useEffect(() => {
    if (
      !loaded ||
      !dirty ||
      recovery ||
      !user ||
      latestSaved.current === encoded
    )
      return;
    setMessage("Saving working copy…");
    const timer = setTimeout(async () => {
      if (writing.current || finished.current) return;
      const value = current.current;
      let localSaved = false;
      try {
        localStorage.setItem(
          storageKey,
          JSON.stringify({ savedAt: Date.now(), snapshot: JSON.parse(value) }),
        );
        localSaved = true;
      } catch {
        /* The remote save is still attempted. */
      }
      writing.current = true;
      try {
        const payload = JSON.parse(value) as Json;
        const query = version.current
          ? supabase
              .from("post_editor_drafts")
              .update({ snapshot: payload })
              .eq("user_id", user.id)
              .eq("document_key", key)
              .eq("updated_at", version.current)
          : supabase.from("post_editor_drafts").insert({
              user_id: user.id,
              document_key: key,
              snapshot: payload,
            });
        const { data, error } = await query
          .select("updated_at")
          .abortSignal(AbortSignal.timeout(20000))
          .maybeSingle();
        if (error || !data)
          throw new Error(
            "Working copy changed elsewhere or could not be saved.",
          );
        version.current = data.updated_at;
        latestSaved.current = value;
        setMessage(
          current.current === value
            ? "Working copy saved · not published"
            : "Saving newer changes…",
        );
      } catch {
        setMessage(
          localSaved
            ? "Saved on this device only · account save failed. Reload before switching devices."
            : "Draft save failed. Keep this tab open and save your work.",
        );
      } finally {
        writing.current = false;
        if (latestSaved.current === value && current.current !== value)
          setSaveTick((t) => t + 1);
      }
    }, 1200);
    return () => clearTimeout(timer);
  }, [encoded, loaded, dirty, recovery, user?.id, key, storageKey, saveTick]);
  // Keep the latest keystrokes on this device even while the restore banner
  // is open or a remote request is still in flight.
  useEffect(() => {
    if (!dirty) return;
    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify({ savedAt: Date.now(), snapshot: JSON.parse(encoded) }),
      );
    } catch {
      /* remote backup still runs */
    }
  }, [encoded, dirty, storageKey]);
  useBlocker({
    shouldBlockFn: () =>
      dirty &&
      !window.confirm(
        "You have changes that have not been applied to the article. Leave the editor? Your last saved working copy can be recovered.",
      ),
    enableBeforeUnload: dirty,
  });
  async function removeStoredCopy() {
    while (writing.current)
      await new Promise((resolve) => setTimeout(resolve, 50));
    try {
      localStorage.removeItem(storageKey);
    } catch {
      /* optional */
    }
    if (user && version.current)
      await supabase
        .from("post_editor_drafts")
        .delete()
        .eq("user_id", user.id)
        .eq("document_key", key)
        .eq("updated_at", version.current);
  }
  /**
   * The article was saved and the editor is closing. Returns false (and keeps
   * the working copy) when newer edits were typed after `savedSnapshot`.
   */
  async function clear(savedSnapshot?: string) {
    if (savedSnapshot && restable(savedSnapshot) !== current.current) {
      baseline.current = restable(savedSnapshot);
      setMessage("Article saved. Newer edits remain in your working copy.");
      return false;
    }
    finished.current = true;
    baseline.current = current.current;
    setMessage("Article saved");
    await removeStoredCopy();
    return true;
  }
  /**
   * The article was saved and editing continues (for example a publish the
   * gate held). Autosave stays on for the next edit.
   */
  async function markSaved(savedSnapshot?: string) {
    const saved = savedSnapshot ? restable(savedSnapshot) : current.current;
    baseline.current = saved;
    if (saved !== current.current) {
      setMessage("Article saved. Newer edits remain in your working copy.");
      return false;
    }
    setMessage("Article saved · autosave stays on");
    await removeStoredCopy();
    version.current = null;
    latestSaved.current = null;
    return true;
  }
  return {
    message,
    dirty,
    recovery,
    resolveRecovery: () => {
      setRecovery(null);
      setMessage("Working copy restored · review it, then Save");
    },
    discardRecovery: async () => {
      await clear();
      finished.current = false;
      version.current = null;
      latestSaved.current = null;
      setRecovery(null);
      setMessage("Current article kept · recovery copy dismissed");
    },
    clear,
    markSaved,
  };
}
