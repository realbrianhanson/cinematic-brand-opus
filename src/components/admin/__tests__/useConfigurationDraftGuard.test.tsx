// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, renderHook } from "@testing-library/react";
import { useConfigurationDraftGuard } from "../useConfigurationDraftGuard";
const h = vi.hoisted(() => ({
  blocker: { shouldBlockFn: () => false, enableBeforeUnload: () => false },
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
describe("configuration navigation protection", () => {
  it("blocks navigation during saves, then preserves unsaved drafts until deliberately discarded", () => {
    const alert = vi.spyOn(window, "alert").mockImplementation(() => {});
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const view = renderHook(
      ({ dirty, pending }) => useConfigurationDraftGuard(dirty, pending),
      { initialProps: { dirty: true, pending: true } },
    );
    expect(h.blocker.shouldBlockFn()).toBe(true);
    expect(alert).toHaveBeenCalledTimes(1);
    expect(confirm).not.toHaveBeenCalled();
    expect(h.blocker.enableBeforeUnload()).toBe(true);
    view.rerender({ dirty: true, pending: false });
    expect(h.blocker.shouldBlockFn()).toBe(true);
    confirm.mockReturnValue(true);
    expect(h.blocker.shouldBlockFn()).toBe(false);
    view.rerender({ dirty: false, pending: false });
    expect(h.blocker.shouldBlockFn()).toBe(false);
    expect(h.blocker.enableBeforeUnload()).toBe(false);
  });
});
