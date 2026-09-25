// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { useAdminDraftGuard } from "../useAdminDraftGuard";

const h = vi.hoisted(() => ({
  blocker: { shouldBlockFn: () => false, enableBeforeUnload: false },
}));
vi.mock("@tanstack/react-router", () => ({
  useBlocker: (options: typeof h.blocker) => {
    h.blocker = options;
  },
}));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("admin unsaved changes guard", () => {
  it("cancels navigation and protects closing the tab when edits are unsaved", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const view = renderHook(
      ({ title }) => useAdminDraftGuard({ title }, "format:one"),
      { initialProps: { title: "Saved title" } },
    );
    view.rerender({ title: "Keep this unsaved title" });
    expect(h.blocker.shouldBlockFn()).toBe(true);
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(h.blocker.enableBeforeUnload).toBe(true);
    expect(view.result.current.dirty).toBe(true);
    confirm.mockReturnValue(true);
    expect(h.blocker.shouldBlockFn()).toBe(false);
  });

  it("allows a completed save to navigate immediately, before another render", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const view = renderHook(
      ({ title }) => useAdminDraftGuard({ title }, "settings"),
      { initialProps: { title: "Saved" } },
    );
    view.rerender({ title: "Submitted" });
    act(() => {
      view.result.current.markSaved({ title: "Submitted" });
      expect(h.blocker.shouldBlockFn()).toBe(false);
    });
    expect(h.blocker.enableBeforeUnload).toBe(false);
    expect(confirm).not.toHaveBeenCalled();
  });

  it("keeps newer typing protected when an earlier submitted version finishes saving", () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const view = renderHook(
      ({ title }) => useAdminDraftGuard({ title }, "guide:one"),
      { initialProps: { title: "Saved" } },
    );
    view.rerender({ title: "Newer unsaved typing" });
    act(() => view.result.current.markSaved({ title: "Submitted earlier" }));
    expect(h.blocker.shouldBlockFn()).toBe(true);
    expect(h.blocker.enableBeforeUnload).toBe(true);
  });

  it("does not carry a previous document's baseline into a different editor", () => {
    const view = renderHook(
      ({ title, id }) => useAdminDraftGuard({ title }, id),
      { initialProps: { title: "First", id: "one" } },
    );
    view.rerender({ title: "Second", id: "two" });
    expect(h.blocker.shouldBlockFn()).toBe(false);
    expect(h.blocker.enableBeforeUnload).toBe(false);
  });
});
