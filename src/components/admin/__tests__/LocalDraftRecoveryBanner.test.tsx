// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import LocalDraftRecoveryBanner, {
  type LocalDraftRecovery,
} from "../LocalDraftRecoveryBanner";
afterEach(cleanup);
describe("local draft selection", () => {
  it("exposes separate backup choices and requires an explicit restore action", () => {
    const recovery: LocalDraftRecovery = {
      pending: true,
      canRestore: true,
      message: "Backed up on this device.",
      notice: "",
      copies: [
        { id: "older-slot", savedAt: 1000, canRestore: true },
        { id: "newer-slot", savedAt: 2000, canRestore: false },
      ],
      selectedCopyId: "older-slot",
      selectCopy: vi.fn(),
      restore: vi.fn(),
      discard: vi.fn(),
      download: vi.fn(),
    };
    render(<LocalDraftRecoveryBanner recovery={recovery} />);
    const chooser = screen.getByRole("combobox", {
      name: /2 working copies found/,
    });
    expect(screen.getAllByRole("option")).toHaveLength(2);
    fireEvent.change(chooser, { target: { value: "newer-slot" } });
    expect(recovery.selectCopy).toHaveBeenCalledWith("newer-slot");
    expect(recovery.restore).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("button", { name: "Restore working copy" }),
    );
    expect(recovery.restore).toHaveBeenCalledOnce();
  });
  it("shows a changed-copy notice and blocks restore against a newer saved revision", () => {
    const recovery: LocalDraftRecovery = {
      pending: true,
      canRestore: false,
      message: "Backed up on this device.",
      notice: "The selected working copy changed. Review it again.",
      copies: [{ id: "slot", savedAt: 1000, canRestore: false }],
      selectedCopyId: "slot",
      selectCopy: vi.fn(),
      restore: vi.fn(),
      discard: vi.fn(),
      download: vi.fn(),
    };
    render(<LocalDraftRecoveryBanner recovery={recovery} />);
    expect(
      screen.queryByRole("button", { name: "Restore working copy" }),
    ).toBeNull();
    expect(screen.getByText(/selected working copy changed/)).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Download working copy" }),
    ).toBeTruthy();
  });
});
