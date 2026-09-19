// @vitest-environment jsdom
import React, { StrictMode } from "react";
import { act, render, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import type { Editor } from "@tiptap/react";
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("../ImagePickerModal", () => ({ default: () => null }));
vi.mock("../VideoPickerModal", () => ({ default: () => null }));
import RichTextEditor from "../RichTextEditor";
describe("rich editor lifecycle", () => {
  it("keeps content updates working and clears the parent reference on disposal", async () => {
    let current: Editor | null = null;
    const changes = vi.fn();
    const ready = (editor: Editor | null) => {
      current = editor;
    };
    const view = render(
      <StrictMode>
        <RichTextEditor
          content="<p>Original</p>"
          onChange={changes}
          onEditorReady={ready}
        />
      </StrictMode>,
    );
    await waitFor(() => expect(current?.isInitialized).toBe(true));
    const original = current!;
    act(() => {
      original.commands.insertContent("Updated ");
    });
    expect(changes).toHaveBeenCalled();
    expect(changes.mock.lastCall?.[0]).toContain("Updated");
    view.unmount();
    await waitFor(() => expect(current).toBeNull());
    expect(original.isDestroyed).toBe(true);
    const next = render(
      <RichTextEditor content="<p>New document</p>" onEditorReady={ready} />,
    );
    await waitFor(() => expect(current?.isInitialized).toBe(true));
    expect(current).not.toBe(original);
    expect(current!.getHTML()).toContain("New document");
    next.unmount();
  });
});
