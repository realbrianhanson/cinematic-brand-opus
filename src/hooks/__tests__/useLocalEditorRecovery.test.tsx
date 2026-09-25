// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
const auth = vi.hoisted(() => ({
  user: { id: "admin-one" } as { id: string } | null,
}));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: auth.user }),
}));
import {
  localEditorRecoveryKey,
  useLocalEditorRecovery,
} from "../useLocalEditorRecovery";
import { stableSnapshot } from "../useEditorRecovery";

const schema = z.object({ title: z.string(), body: z.string() }).strict();
const saved = { title: "Saved title", body: "Saved body" };
const edited = { title: "Working title", body: "Unsaved body" };
const version = "2026-09-25T10:00:00Z";
const documentKey = "guide:one";
const key = localEditorRecoveryKey("admin-one", documentKey);
function slots(scope = key) {
  return Object.keys(localStorage).filter((entry) =>
    entry.startsWith(`${scope}:instance:`),
  );
}
const onlyBackup = () => JSON.parse(localStorage.getItem(slots()[0])!);
function backup(extra: Record<string, unknown> = {}) {
  return JSON.stringify({
    version: 1,
    userId: "admin-one",
    documentKey,
    savedAt: Date.now(),
    baseVersion: version,
    baseline: stableSnapshot(saved),
    snapshot: edited,
    ...extra,
  });
}
function renderRecovery(
  initial: {
    snapshot: typeof saved;
    ready: boolean;
    documentKey: string;
    serverVersion: string;
  } = { snapshot: saved, ready: true, documentKey, serverVersion: version },
) {
  const restore = vi.fn();
  return {
    ...renderHook(
      (props) =>
        useLocalEditorRecovery({ ...props, schema, onRestore: restore }),
      { initialProps: initial },
    ),
    restore,
  };
}
beforeEach(() => {
  localStorage.clear();
  auth.user = { id: "admin-one" };
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("account-scoped local editorial recovery", () => {
  it("keeps simultaneous editors in different slots through interleaved edits and a save", () => {
    const first = renderRecovery();
    const second = renderRecovery();
    first.rerender({
      snapshot: edited,
      ready: true,
      documentKey,
      serverVersion: version,
    });
    const firstSlot = slots()[0];
    const otherDraft = { ...edited, body: "Second active editor" };
    second.rerender({
      snapshot: otherDraft,
      ready: true,
      documentKey,
      serverVersion: version,
    });
    const secondSlot = slots().find((slot) => slot !== firstSlot)!;
    const secondRaw = localStorage.getItem(secondSlot);
    expect(slots()).toHaveLength(2);
    first.rerender({
      snapshot: { ...edited, body: "First editor still typing" },
      ready: true,
      documentKey,
      serverVersion: version,
    });
    expect(localStorage.getItem(secondSlot)).toBe(secondRaw);
    expect(JSON.parse(localStorage.getItem(firstSlot)!).snapshot.body).toBe(
      "First editor still typing",
    );
    act(() => second.result.current.clearSaved(otherDraft));
    expect(localStorage.getItem(firstSlot)).not.toBeNull();
    expect(localStorage.getItem(secondSlot)).toBeNull();
  });
  it("preserves a newer other-tab backup when an older candidate is explicitly restored and saved", () => {
    const first = renderRecovery();
    const second = renderRecovery();
    first.rerender({
      snapshot: edited,
      ready: true,
      documentKey,
      serverVersion: version,
    });
    const olderSlot = slots()[0];
    second.rerender({
      snapshot: { ...edited, body: "Second editor first draft" },
      ready: true,
      documentKey,
      serverVersion: version,
    });
    const newerSlot = slots().find((slot) => slot !== olderSlot)!;
    const choosing = renderRecovery();
    expect(choosing.result.current.copies).toHaveLength(2);
    act(() => choosing.result.current.selectCopy(olderSlot));
    second.rerender({
      snapshot: { ...edited, body: "Second editor even newer draft" },
      ready: true,
      documentKey,
      serverVersion: version,
    });
    const newerRaw = localStorage.getItem(newerSlot);
    act(() => choosing.result.current.restore());
    expect(choosing.restore).toHaveBeenCalledExactlyOnceWith(edited);
    expect(localStorage.getItem(newerSlot)).toBe(newerRaw);
    expect(slots()).toHaveLength(3);
    choosing.rerender({
      snapshot: edited,
      ready: true,
      documentKey,
      serverVersion: version,
    });
    act(() => choosing.result.current.clearSaved(edited));
    expect(localStorage.getItem(newerSlot)).toBe(newerRaw);
    expect(slots().sort()).toEqual([olderSlot, newerSlot].sort());
  });
  it("refuses cached restore and discard actions when their selected slot changed", () => {
    const original = backup();
    localStorage.setItem(key, original);
    const choosing = renderRecovery();
    const staleRestore = choosing.result.current.restore;
    const changed = backup({
      snapshot: { ...edited, body: "Newer source draft" },
      savedAt: Date.now() + 1,
    });
    localStorage.setItem(key, changed);
    act(() => staleRestore());
    expect(choosing.restore).not.toHaveBeenCalled();
    expect(choosing.result.current.notice).toContain("changed or disappeared");
    expect(localStorage.getItem(key)).toBe(changed);
    const staleDiscard = choosing.result.current.discard;
    localStorage.setItem(
      key,
      backup({ snapshot: { ...edited, body: "Newer again" } }),
    );
    act(() => staleDiscard());
    expect(localStorage.getItem(key)).not.toBeNull();
    expect(choosing.result.current.notice).toContain("changed or disappeared");
  });
  it("preserves this editor's fresh typing when it chooses a different recovery copy", () => {
    localStorage.setItem(key, backup());
    const choosing = renderRecovery();
    choosing.rerender({
      snapshot: { ...saved, body: "Typed while comparing backups" },
      ready: true,
      documentKey,
      serverVersion: version,
    });
    const typingSlot = slots()[0];
    const typingRaw = localStorage.getItem(typingSlot);
    act(() => choosing.result.current.restore());
    choosing.rerender({
      snapshot: edited,
      ready: true,
      documentKey,
      serverVersion: version,
    });
    expect(localStorage.getItem(typingSlot)).toBe(typingRaw);
    expect(slots()).toHaveLength(2);
    expect(localStorage.getItem(key)).not.toBeNull();
  });
  it("ignores a previously captured restore callback after changing documents", () => {
    localStorage.setItem(key, backup());
    const choosing = renderRecovery();
    const oldRestore = choosing.result.current.restore;
    choosing.rerender({
      snapshot: saved,
      ready: true,
      documentKey: "guide:two",
      serverVersion: version,
    });
    act(() => oldRestore());
    expect(choosing.restore).not.toHaveBeenCalled();
    expect(slots()).toHaveLength(0);
    expect(localStorage.getItem(key)).not.toBeNull();
  });
  it("waits for authoritative hydration and never writes on initial load", () => {
    const view = renderRecovery({
      snapshot: { title: "", body: "" },
      ready: false,
      documentKey,
      serverVersion: version,
    });
    expect(localStorage.getItem(key)).toBeNull();
    view.rerender({
      snapshot: saved,
      ready: true,
      documentKey,
      serverVersion: version,
    });
    expect(localStorage.getItem(key)).toBeNull();
    view.rerender({
      snapshot: edited,
      ready: true,
      documentKey,
      serverVersion: version,
    });
    expect(slots()).toHaveLength(1);
    expect(onlyBackup().snapshot).toEqual(edited);
    expect(onlyBackup().baseVersion).toBe(version);
  });
  it("offers restoration after remount without automatically applying or overwriting the saved page", () => {
    localStorage.setItem(key, backup());
    const view = renderRecovery();
    expect(view.result.current.pending).toBe(true);
    expect(view.result.current.canRestore).toBe(true);
    expect(view.restore).not.toHaveBeenCalled();
    act(() => view.result.current.restore());
    expect(view.restore).toHaveBeenCalledExactlyOnceWith(edited);
  });
  it("preserves a pending backup while the owner decides, even if fields change", () => {
    const raw = backup();
    localStorage.setItem(key, raw);
    const view = renderRecovery();
    view.rerender({
      snapshot: { ...saved, title: "New typing" },
      ready: true,
      documentKey,
      serverVersion: version,
    });
    expect(localStorage.getItem(key)).toBe(raw);
    expect(onlyBackup().snapshot.title).toBe("New typing");
  });
  it("discards only the offered backup and resumes protection for new edits", () => {
    localStorage.setItem(key, backup());
    const view = renderRecovery();
    act(() => view.result.current.discard());
    expect(view.result.current.pending).toBe(false);
    expect(localStorage.getItem(key)).not.toBeNull();
    view.rerender({
      snapshot: edited,
      ready: true,
      documentKey,
      serverVersion: version,
    });
    expect(onlyBackup().snapshot).toEqual(edited);
  });
  it("dismisses only one revision without deleting a source that another tab can update", () => {
    const first = renderRecovery();
    first.rerender({
      snapshot: edited,
      ready: true,
      documentKey,
      serverVersion: version,
    });
    const sourceSlot = slots()[0];
    const originalRaw = localStorage.getItem(sourceSlot);
    const choosing = renderRecovery();
    act(() => choosing.result.current.discard());
    expect(choosing.result.current.pending).toBe(false);
    expect(localStorage.getItem(sourceSlot)).toBe(originalRaw);
    choosing.unmount();
    const hidden = renderRecovery();
    expect(hidden.result.current.pending).toBe(false);
    hidden.unmount();
    first.rerender({
      snapshot: { ...edited, body: "New revision after dismissal" },
      ready: true,
      documentKey,
      serverVersion: version,
    });
    const later = renderRecovery();
    expect(later.result.current.pending).toBe(true);
    act(() => later.result.current.restore());
    expect(later.restore).toHaveBeenCalledWith({
      ...edited,
      body: "New revision after dismissal",
    });
  });
  it.each([
    { baseVersion: "older-version" },
    { baseline: stableSnapshot({ ...saved, body: "Older stored body" }) },
  ])(
    "blocks direct restoration against a different authoritative saved revision",
    (extra) => {
      localStorage.setItem(key, backup(extra));
      const view = renderRecovery();
      expect(view.result.current.pending).toBe(true);
      expect(view.result.current.canRestore).toBe(false);
      act(() => view.result.current.restore());
      expect(view.restore).not.toHaveBeenCalled();
    },
  );
  it("blocks restore if a background refetch changes the server version after discovery", () => {
    localStorage.setItem(key, backup());
    const view = renderRecovery();
    view.rerender({
      snapshot: saved,
      ready: true,
      documentKey,
      serverVersion: "newer-version",
    });
    expect(view.result.current.canRestore).toBe(false);
    expect(view.result.current.pending).toBe(true);
  });
  it("clears only the submitted working snapshot after a successful save", () => {
    const view = renderRecovery();
    view.rerender({
      snapshot: edited,
      ready: true,
      documentKey,
      serverVersion: version,
    });
    act(() => expect(view.result.current.clearSaved(edited)).toBe(true));
    expect(slots()).toHaveLength(0);
    view.rerender({
      snapshot: { ...edited, title: "A later edit" },
      ready: true,
      documentKey,
      serverVersion: version,
    });
    expect(onlyBackup().snapshot.title).toBe("A later edit");
  });
  it("preserves newer typing while an earlier save completes", () => {
    const view = renderRecovery();
    view.rerender({
      snapshot: edited,
      ready: true,
      documentKey,
      serverVersion: version,
    });
    const submitted = edited;
    const newer = { ...edited, body: "Typed during the request" };
    view.rerender({
      snapshot: newer,
      ready: true,
      documentKey,
      serverVersion: version,
    });
    act(() => expect(view.result.current.clearSaved(submitted)).toBe(false));
    expect(onlyBackup().snapshot).toEqual(newer);
  });
  it("removes only this tab's obsolete backup after undoing every edit", () => {
    const view = renderRecovery();
    view.rerender({
      snapshot: edited,
      ready: true,
      documentKey,
      serverVersion: version,
    });
    expect(slots()).toHaveLength(1);
    view.rerender({
      snapshot: saved,
      ready: true,
      documentKey,
      serverVersion: version,
    });
    expect(slots()).toHaveLength(0);
    view.rerender({
      snapshot: edited,
      ready: true,
      documentKey,
      serverVersion: version,
    });
    const other = backup({
      snapshot: { ...edited, body: "Other tab's new work" },
    });
    localStorage.setItem(key, other);
    view.rerender({
      snapshot: saved,
      ready: true,
      documentKey,
      serverVersion: version,
    });
    expect(localStorage.getItem(key)).toBe(other);
  });
  it("does not delete a newer backup written in another tab", () => {
    const view = renderRecovery();
    view.rerender({
      snapshot: edited,
      ready: true,
      documentKey,
      serverVersion: version,
    });
    const other = backup({ snapshot: { ...edited, body: "Other tab's work" } });
    localStorage.setItem(key, other);
    act(() => view.result.current.clearSaved(edited));
    expect(localStorage.getItem(key)).toBe(other);
  });
  it("never offers another document's or account's copy, including forged envelope scope", () => {
    localStorage.setItem(key, backup({ userId: "other-admin" }));
    const view = renderRecovery();
    expect(view.result.current.pending).toBe(false);
    localStorage.setItem(key, backup());
    view.rerender({
      snapshot: saved,
      ready: false,
      documentKey: "resource:two",
      serverVersion: version,
    });
    view.rerender({
      snapshot: saved,
      ready: true,
      documentKey: "resource:two",
      serverVersion: version,
    });
    expect(view.result.current.pending).toBe(false);
    expect(localStorage.getItem(key)).not.toBeNull();
  });
  it("does not copy mounted fields into a different account when authentication changes in place", () => {
    const view = renderRecovery();
    view.rerender({
      snapshot: edited,
      ready: true,
      documentKey,
      serverVersion: version,
    });
    auth.user = { id: "admin-two" };
    view.rerender({
      snapshot: { ...edited, title: "Changed after account switch" },
      ready: true,
      documentKey,
      serverVersion: version,
    });
    expect(view.result.current.pending).toBe(false);
    expect(view.result.current.message).toContain("Reopen this editor");
    expect(
      localStorage.getItem(localEditorRecoveryKey("admin-two", documentKey)),
    ).toBeNull();
  });
  it("ignores a late save callback for the previous document", () => {
    const view = renderRecovery();
    view.rerender({
      snapshot: edited,
      ready: true,
      documentKey,
      serverVersion: version,
    });
    const oldClear = view.result.current.clearSaved;
    view.rerender({
      snapshot: saved,
      ready: true,
      documentKey: "guide:two",
      serverVersion: version,
    });
    act(() => expect(oldClear(edited)).toBe(false));
    expect(slots()).toHaveLength(1);
  });
  it("keeps editing functional when storage is denied or full", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Full", "QuotaExceededError");
    });
    const view = renderRecovery();
    expect(() =>
      view.rerender({
        snapshot: edited,
        ready: true,
        documentKey,
        serverVersion: version,
      }),
    ).not.toThrow();
    expect(view.result.current.message).toContain("could not back up");
    expect(() =>
      act(() => view.result.current.clearSaved(edited)),
    ).not.toThrow();
  });
  it("does not restore unknown fields, including forged IDs and saved timestamps", () => {
    localStorage.setItem(
      key,
      backup({
        snapshot: { ...edited, id: "another-document", updated_at: "forged" },
      }),
    );
    const view = renderRecovery();
    expect(view.result.current.pending).toBe(false);
    expect(view.restore).not.toHaveBeenCalled();
  });
});
