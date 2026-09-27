// @vitest-environment jsdom
import React, { useState } from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildCallFunnelScriptDocument,
  buildCallFunnelScriptPrompt,
  emptyCallFunnelScripts,
  type CallFunnelScripts,
} from "@/lib/callFunnelScripts";
import CallScriptWorkspace from "./CallScriptWorkspace";

const initial = {
  ...emptyCallFunnelScripts(),
  buyer: "Independent coaches",
  invitation: "First invitation.",
  welcome: "Welcome to the next step.",
  training: "One useful lesson.",
};
function mount({ disabled = false } = {}) {
  const onChange = vi.fn();
  function Harness() {
    const [value, setValue] = useState<CallFunnelScripts>(initial);
    return (
      <CallScriptWorkspace
        offerName="Strategy call"
        value={value}
        disabled={disabled}
        onChange={(next) => {
          onChange(next);
          setValue(next);
        }}
      />
    );
  }
  return { ...render(<Harness />), onChange };
}
function exportScripts() {
  fireEvent.change(screen.getByLabelText("Export"), {
    target: { value: "scripts" },
  });
}
function downloadMock() {
  const createObjectURL = vi.fn((_blob: Blob) => "blob:call-scripts");
  const revokeObjectURL = vi.fn();
  vi.stubGlobal(
    "URL",
    Object.assign(class extends URL {}, { createObjectURL, revokeObjectURL }),
  );
  return { createObjectURL, revokeObjectURL };
}
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("video-script workspace", () => {
  it("edits separate stages without replacing another stage and preserves brief details", () => {
    const { onChange } = mount();
    fireEvent.change(screen.getByLabelText("Invitation script"), {
      target: { value: "Updated invitation" },
    });
    fireEvent.change(screen.getByLabelText("Script"), {
      target: { value: "welcome" },
    });
    expect(
      (screen.getByLabelText("Welcome script") as HTMLTextAreaElement).value,
    ).toBe(initial.welcome);
    fireEvent.change(screen.getByLabelText("Welcome script"), {
      target: { value: "Prepare your question." },
    });
    expect(onChange).toHaveBeenLastCalledWith({
      ...initial,
      invitation: "Updated invitation",
      welcome: "Prepare your question.",
    });
    fireEvent.change(screen.getByLabelText("Script"), {
      target: { value: "invitation" },
    });
    expect(
      (screen.getByLabelText("Invitation script") as HTMLTextAreaElement).value,
    ).toBe("Updated invitation");
    fireEvent.click(screen.getByText("Offer brief"));
    fireEvent.change(screen.getByLabelText("Who is this for?"), {
      target: { value: "Local business owners" },
    });
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        buyer: "Local business owners",
        invitation: "Updated invitation",
        welcome: "Prepare your question.",
      }),
    );
  });

  it("updates the runtime estimate when the speaking pace changes", () => {
    const { onChange } = mount();
    fireEvent.change(screen.getByLabelText("Invitation script"), {
      target: { value: Array(160).fill("word").join(" ") },
    });
    expect(screen.getByText(/160 words · about 1:09/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Speaking pace"), {
      target: { value: "160" },
    });
    expect(screen.getByText(/160 words · about 1:00/)).toBeTruthy();
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ wordsPerMinute: 160 }),
    );
  });

  it("copies current content only after an explicit click and distinguishes prompt from scripts", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    mount();
    expect(writeText).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Copy export" }));
    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toBe(
        "Writing prompt copied.",
      ),
    );
    expect(writeText).toHaveBeenLastCalledWith(
      buildCallFunnelScriptPrompt(initial, "Strategy call"),
    );
    exportScripts();
    fireEvent.click(screen.getByRole("button", { name: "Copy export" }));
    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toBe(
        "Scripts and brief copied.",
      ),
    );
    expect(writeText).toHaveBeenLastCalledWith(
      buildCallFunnelScriptDocument(initial, "Strategy call"),
    );
  });

  it("offers selected export text and truthful feedback when clipboard access fails", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("Blocked"));
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    mount();
    exportScripts();
    fireEvent.click(screen.getByRole("button", { name: "Copy export" }));
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain(
        "Copy did not work",
      ),
    );
    const area = screen.getByLabelText("Export text") as HTMLTextAreaElement;
    expect(area.value).toBe(
      buildCallFunnelScriptDocument(initial, "Strategy call"),
    );
    expect(document.activeElement).toBe(area);
    expect(area.selectionEnd).toBe(area.value.length);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("downloads real scripts and releases its temporary URL after starting the download", async () => {
    vi.useFakeTimers();
    const { createObjectURL, revokeObjectURL } = downloadMock();
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      expect(this.download).toBe("call-funnel-video-scripts.md");
      expect(document.body.contains(this)).toBe(true);
    });
    const { unmount } = mount();
    exportScripts();
    fireEvent.click(screen.getByRole("button", { name: "Download export" }));
    expect(document.querySelector("a[download]")).toBeNull();
    expect(createObjectURL).toHaveBeenCalledOnce();
    const blob = createObjectURL.mock.calls[0][0];
    expect(blob.type).toBe("text/markdown;charset=utf-8");
    const reader = new FileReader();
    const content = new Promise<string>((resolve) => {
      reader.onload = () => resolve(String(reader.result));
    });
    reader.readAsText(blob);
    await vi.runAllTimersAsync();
    expect(await content).toBe(
      buildCallFunnelScriptDocument(initial, "Strategy call"),
    );
    expect(screen.getByRole("status").textContent).toContain(
      "Download requested",
    );
    unmount();
    expect(revokeObjectURL).toHaveBeenCalledOnce();
    await vi.runAllTimersAsync();
    expect(revokeObjectURL).toHaveBeenCalledOnce();
  });

  it("releases a pending download immediately when the workspace unmounts", () => {
    vi.useFakeTimers();
    const { revokeObjectURL } = downloadMock();
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const { unmount } = mount();
    fireEvent.click(screen.getByRole("button", { name: "Download export" }));
    expect(revokeObjectURL).not.toHaveBeenCalled();
    unmount();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:call-scripts");
    vi.runAllTimers();
    expect(revokeObjectURL).toHaveBeenCalledOnce();
  });

  it("also offers manual copy when the browser has no clipboard API", async () => {
    vi.stubGlobal("navigator", {});
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Copy export" }));
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain(
        "Copy did not work",
      ),
    );
    expect(
      (screen.getByLabelText("Export text") as HTMLTextAreaElement).value,
    ).toBe(buildCallFunnelScriptPrompt(initial, "Strategy call"));
  });

  it("shows the complete selectable prompt when downloads are unavailable", () => {
    vi.stubGlobal("URL", {
      createObjectURL: undefined,
      revokeObjectURL: undefined,
    });
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Download export" }));
    expect(screen.getByRole("alert").textContent).toContain(
      "could not start the download",
    );
    const area = screen.getByLabelText("Export text") as HTMLTextAreaElement;
    expect(area.value).toBe(
      buildCallFunnelScriptPrompt(initial, "Strategy call"),
    );
    expect(area.readOnly).toBe(true);
    expect(document.activeElement).toBe(area);
  });

  it("disables draft edits and export actions during a parent save while leaving a readable export", () => {
    mount({ disabled: true });
    expect(
      (
        screen.getByRole("group", {
          name: "Video scripts and offer brief",
        }) as HTMLFieldSetElement
      ).disabled,
    ).toBe(true);
    for (const name of ["Copy export", "Download export"])
      expect(
        (screen.getByRole("button", { name }) as HTMLButtonElement).disabled,
      ).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "View export text" }));
    expect(
      (screen.getByLabelText("Export text") as HTMLTextAreaElement).value,
    ).toContain("Independent coaches");
  });
});
