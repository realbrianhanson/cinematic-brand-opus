import { useEffect, useRef, useState } from "react";
import { useBlocker } from "@tanstack/react-router";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";

/** Saves a working copy only. A published article changes only on explicit Save. */
export function useEditorRecovery(
  key: string,
  snapshot: Record<string, unknown>,
  ready: boolean,
) {
  const { user } = useAuth();
  const encoded = JSON.stringify(snapshot);
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
  useEffect(() => {
    if (!ready || !user) return;
    let active = true;
    baseline.current = current.current;
    version.current = null;
    latestSaved.current = null;
    finished.current = false;
    setLoaded(false);
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
      version.current = data?.updated_at ?? null;
      let candidate = data?.snapshot as Record<string, unknown> | undefined;
      try {
        const local = JSON.parse(localStorage.getItem(storageKey) || "null");
        if (
          local?.snapshot &&
          (!data || local.savedAt > Date.parse(data.updated_at))
        )
          candidate = local.snapshot;
      } catch {
        /* Browser storage is optional. */
      }
      if (candidate && JSON.stringify(candidate) !== baseline.current)
        setRecovery(candidate);
      else if (!error) setMessage("Draft protection ready");
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
  // Keep the latest keystrokes locally even if a remote request is still in flight.
  useEffect(() => {
    if (!dirty || recovery) return;
    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify({ savedAt: Date.now(), snapshot: JSON.parse(encoded) }),
      );
    } catch {
      /* remote backup still runs */
    }
  }, [encoded, dirty, recovery, storageKey]);
  useBlocker({
    shouldBlockFn: () =>
      dirty &&
      !window.confirm(
        "You have changes that have not been applied to the article. Leave the editor? Your last saved working copy can be recovered.",
      ),
    enableBeforeUnload: dirty,
  });
  async function clear(savedSnapshot?: string) {
    if (savedSnapshot && savedSnapshot !== current.current) {
      baseline.current = savedSnapshot;
      setMessage("Article saved. Newer edits remain in your working copy.");
      return false;
    }
    finished.current = true;
    baseline.current = current.current;
    setMessage("Article saved");
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
    return true;
  }
  return {
    message,
    dirty,
    recovery,
    resolveRecovery: () => {
      setRecovery(null);
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
  };
}
