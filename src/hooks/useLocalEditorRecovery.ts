import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";
import { useAuth } from "@/contexts/AuthContext";
import { stableSnapshot } from "./useEditorRecovery";

const MAX_BACKUP_LENGTH = 2_000_000;
const envelopeSchema = z
  .object({
    version: z.literal(1),
    userId: z.string(),
    documentKey: z.string(),
    savedAt: z.number().finite(),
    baseVersion: z.string().nullable(),
    baseline: z.string().max(MAX_BACKUP_LENGTH),
    snapshot: z.unknown(),
    writeId: z.string().uuid().optional(),
  })
  .strict();
const dismissalSchema = z
  .object({
    version: z.literal(1),
    userId: z.string(),
    documentKey: z.string(),
    sourceKey: z.string(),
    writeId: z.string().uuid().optional(),
    // Legacy backups have no revision ID. Retain their exact raw version.
    legacyRaw: z.string().max(MAX_BACKUP_LENGTH).optional(),
  })
  .strict()
  .refine((value) => !!value.writeId !== (value.legacyRaw !== undefined));

/** This legacy key is also the prefix for isolated editor-instance slots. */
export function localEditorRecoveryKey(userId: string, documentKey: string) {
  return `admin-local-draft:${encodeURIComponent(JSON.stringify([userId, documentKey]))}`;
}
const newSlot = (scope: string) => `${scope}:instance:${crypto.randomUUID()}`;

type Candidate<T> = {
  scope: string;
  key: string;
  raw: string;
  value: T;
  baseline: string;
  baseVersion: string | null;
  savedAt: number;
  writeId?: string;
};

/** Device-only backup. Each mounted editor writes only its own unique slot. */
export function useLocalEditorRecovery<T extends object>({
  documentKey,
  snapshot,
  ready,
  serverVersion,
  schema,
  onRestore,
}: {
  documentKey: string;
  snapshot: T;
  ready: boolean;
  serverVersion?: string | null;
  schema: z.ZodType<T>;
  onRestore: (value: T) => void;
}) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const mountedAccount = useRef<string | null>(null);
  if (!mountedAccount.current && userId) mountedAccount.current = userId;
  const accountChanged =
    !!mountedAccount.current && mountedAccount.current !== userId;
  const enabled = ready && !!userId && !accountChanged;
  const scope = userId ? localEditorRecoveryKey(userId, documentKey) : null;
  const encoded = stableSnapshot(snapshot);
  const current = useRef(encoded);
  current.current = encoded;
  const currentScope = useRef(scope);
  currentScope.current = scope;
  const currentlyEnabled = useRef(enabled);
  currentlyEnabled.current = enabled;
  const restoreCallback = useRef(onRestore);
  restoreCallback.current = onRestore;
  const formSchema = useRef(schema);
  formSchema.current = schema;
  const version = useRef(serverVersion ?? null);
  version.current = serverVersion ?? null;
  const baseline = useRef<{
    scope: string;
    value: string;
    version: string | null;
  } | null>(null);
  const ownedSlot = useRef<{ scope: string; key: string } | null>(null);
  const lastWritten = useRef<{ key: string; raw: string } | null>(null);
  const [loadedScope, setLoadedScope] = useState<string | null>(null);
  const [copies, setCopies] = useState<Candidate<T>[]>([]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [storageError, setStorageError] = useState(false);
  const [notice, setNotice] = useState("");
  const [revision, setRevision] = useState(0);

  const discover = useCallback(() => {
    if (
      !scope ||
      !userId ||
      !currentlyEnabled.current ||
      currentScope.current !== scope
    )
      return;
    try {
      const keys = new Set([scope]);
      const dismissed: z.infer<typeof dismissalSchema>[] = [];
      for (let index = 0; index < localStorage.length; index++) {
        const key = localStorage.key(index);
        if (key?.startsWith(`${scope}:instance:`)) keys.add(key);
        if (key?.startsWith(`${scope}:dismissed:`)) {
          const raw = localStorage.getItem(key);
          if (!raw || raw.length > MAX_BACKUP_LENGTH) continue;
          try {
            const marker = dismissalSchema.safeParse(JSON.parse(raw));
            if (
              marker.success &&
              marker.data.userId === userId &&
              marker.data.documentKey === documentKey
            )
              dismissed.push(marker.data);
          } catch {
            /* Ignore malformed local records. */
          }
        }
      }
      const found: Candidate<T>[] = [];
      for (const key of keys) {
        const raw = localStorage.getItem(key);
        if (!raw || raw.length > MAX_BACKUP_LENGTH) continue;
        let value: unknown;
        try {
          value = JSON.parse(raw);
        } catch {
          continue;
        }
        const envelope = envelopeSchema.safeParse(value);
        if (
          !envelope.success ||
          envelope.data.userId !== userId ||
          envelope.data.documentKey !== documentKey
        )
          continue;
        if (
          dismissed.some(
            (marker) =>
              marker.sourceKey === key &&
              (marker.writeId
                ? marker.writeId === envelope.data.writeId
                : marker.legacyRaw === raw),
          )
        )
          continue;
        const draft = formSchema.current.safeParse(envelope.data.snapshot);
        if (
          !draft.success ||
          stableSnapshot(draft.data) === baseline.current?.value
        )
          continue;
        found.push({
          scope,
          key,
          raw,
          value: draft.data,
          baseline: envelope.data.baseline,
          baseVersion: envelope.data.baseVersion,
          savedAt: envelope.data.savedAt,
          writeId: envelope.data.writeId,
        });
      }
      found.sort((a, b) => b.savedAt - a.savedAt || a.key.localeCompare(b.key));
      setCopies(found);
      setSelectedKey((previous) =>
        found.some((copy) => copy.key === previous)
          ? previous
          : (found[0]?.key ?? null),
      );
      setStorageError(false);
    } catch {
      setStorageError(true);
    }
  }, [scope, userId, documentKey]);

  useEffect(() => {
    setLoadedScope(null);
    setCopies([]);
    setSelectedKey(null);
    setStorageError(false);
    setNotice("");
    lastWritten.current = null;
    if (!enabled || !scope || !userId) return;
    baseline.current = {
      scope,
      value: current.current,
      version: version.current,
    };
    ownedSlot.current = { scope, key: newSlot(scope) };
    discover();
    setLoadedScope(scope);
  }, [enabled, scope, userId, discover]);

  useEffect(() => {
    if (
      !enabled ||
      !scope ||
      loadedScope !== scope ||
      baseline.current?.scope !== scope ||
      ownedSlot.current?.scope !== scope
    )
      return;
    try {
      const key = ownedSlot.current.key;
      if (encoded === baseline.current.value) {
        if (
          lastWritten.current?.key === key &&
          localStorage.getItem(key) === lastWritten.current.raw
        )
          localStorage.removeItem(key);
        lastWritten.current = null;
        return;
      }
      const raw = JSON.stringify({
        version: 1,
        userId,
        documentKey,
        savedAt: Date.now(),
        baseVersion: baseline.current.version,
        baseline: baseline.current.value,
        snapshot: JSON.parse(encoded),
        writeId: crypto.randomUUID(),
      });
      if (raw.length > MAX_BACKUP_LENGTH) throw new Error("backup_too_large");
      localStorage.setItem(key, raw);
      lastWritten.current = { key, raw };
      setStorageError(false);
    } catch {
      setStorageError(true);
    }
  }, [enabled, scope, loadedScope, encoded, userId, documentKey, revision]);

  const candidate = enabled
    ? (copies.find(
        (copy) => copy.scope === scope && copy.key === selectedKey,
      ) ?? null)
    : null;
  const matchesSavedVersion = (copy: Candidate<T>) =>
    copy.scope === currentScope.current &&
    copy.baseline === baseline.current?.value &&
    copy.baseVersion === version.current;
  const canRestore = !!candidate && matchesSavedVersion(candidate);

  const clearSaved = useCallback(
    (submitted: T) => {
      if (
        !scope ||
        currentScope.current !== scope ||
        baseline.current?.scope !== scope ||
        ownedSlot.current?.scope !== scope
      )
        return false;
      const saved = stableSnapshot(submitted);
      baseline.current = { scope, value: saved, version: version.current };
      try {
        const keys = [ownedSlot.current.key];
        // A different instance's source is retained even after restoring it.
        // Discovery hides snapshots equal to the authoritative saved form.
        for (const key of keys) {
          const raw = localStorage.getItem(key);
          if (!raw || raw.length > MAX_BACKUP_LENGTH) continue;
          const envelope = envelopeSchema.safeParse(JSON.parse(raw));
          if (
            envelope.success &&
            envelope.data.userId === userId &&
            envelope.data.documentKey === documentKey &&
            stableSnapshot(envelope.data.snapshot) === saved &&
            localStorage.getItem(key) === raw
          )
            localStorage.removeItem(key);
        }
      } catch {
        setStorageError(true);
      }
      setRevision((value) => value + 1);
      return saved === current.current;
    },
    [scope, userId, documentKey],
  );

  const staleCandidate = () => {
    setNotice(
      "That working copy changed or disappeared. Review the available copies again before restoring or discarding one.",
    );
    discover();
  };

  return {
    pending: !!candidate,
    canRestore,
    savedAt: candidate?.savedAt,
    copies: enabled
      ? copies
          .filter((copy) => copy.scope === scope)
          .map((copy) => ({
            id: copy.key,
            savedAt: copy.savedAt,
            canRestore: matchesSavedVersion(copy),
          }))
      : [],
    selectedCopyId: candidate?.key ?? "",
    selectCopy: (key: string) => {
      if (copies.some((copy) => copy.scope === scope && copy.key === key)) {
        setSelectedKey(key);
        setNotice("");
      }
    },
    restore: () => {
      if (
        !candidate ||
        !scope ||
        !currentlyEnabled.current ||
        !matchesSavedVersion(candidate)
      )
        return;
      try {
        if (localStorage.getItem(candidate.key) !== candidate.raw) {
          staleCandidate();
          return;
        }
        // A fresh slot preserves this editor's typing while choosing a copy.
        const key = newSlot(scope);
        const raw = JSON.stringify({
          version: 1,
          userId,
          documentKey,
          savedAt: Date.now(),
          baseVersion: version.current,
          baseline: baseline.current!.value,
          snapshot: candidate.value,
          writeId: crypto.randomUUID(),
        });
        if (raw.length > MAX_BACKUP_LENGTH) throw new Error("backup_too_large");
        localStorage.setItem(key, raw);
        ownedSlot.current = { scope, key };
        lastWritten.current = { key, raw };
        restoreCallback.current(candidate.value);
        setCopies([]);
        setSelectedKey(null);
        setNotice("");
      } catch {
        setStorageError(true);
      }
    },
    discard: () => {
      if (
        !candidate ||
        !currentlyEnabled.current ||
        candidate.scope !== currentScope.current
      )
        return;
      try {
        if (localStorage.getItem(candidate.key) !== candidate.raw) {
          staleCandidate();
          return;
        }
        const marker = JSON.stringify({
          version: 1,
          userId,
          documentKey,
          sourceKey: candidate.key,
          ...(candidate.writeId
            ? { writeId: candidate.writeId }
            : { legacyRaw: candidate.raw }),
        });
        if (marker.length > MAX_BACKUP_LENGTH)
          throw new Error("dismissal_too_large");
        // A unique marker dismisses only the chosen revision. Never remove a
        // source another tab could update between a read and a removal.
        localStorage.setItem(
          `${scope}:dismissed:${crypto.randomUUID()}`,
          marker,
        );
        discover();
        setNotice("");
      } catch {
        setStorageError(true);
      }
    },
    clearSaved,
    download: () => {
      if (
        !candidate ||
        candidate.scope !== currentScope.current ||
        !currentlyEnabled.current
      )
        return;
      const blob = new Blob([JSON.stringify(candidate.value, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "editor-working-copy.json";
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    },
    notice,
    message: accountChanged
      ? "Reopen this editor to enable draft protection for your current account."
      : storageError
        ? "This browser could not back up your draft. Keep this tab open and save your changes."
        : enabled && loadedScope === scope
          ? "Unsaved edits are backed up on this device only. Nothing is published automatically."
          : "",
  };
}
