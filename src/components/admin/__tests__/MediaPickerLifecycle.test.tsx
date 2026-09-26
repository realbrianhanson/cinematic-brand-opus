// @vitest-environment jsdom
import React, { useState } from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({
  upload: vi.fn(),
  insert: vi.fn(),
  toast: vi.fn(),
}));
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: mock.toast }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({ order: async () => ({ data: [], error: null }) }),
      }),
      insert: mock.insert,
    }),
    storage: {
      from: () => ({
        upload: mock.upload,
        getPublicUrl: () => ({
          data: { publicUrl: "https://files.example.com/file" },
        }),
      }),
    },
  },
}));
import ImagePickerModal from "../ImagePickerModal";
import VideoPickerModal from "../VideoPickerModal";
beforeEach(() => {
  vi.clearAllMocks();
  mock.insert.mockResolvedValue({ error: null });
});
afterEach(cleanup);
describe.each([
  {
    name: "Image",
    Component: ImagePickerModal,
    tab: "Upload New",
    type: "image/png",
    filename: "photo.png",
  },
  {
    name: "Video",
    Component: VideoPickerModal,
    tab: "Upload",
    type: "video/mp4",
    filename: "clip.mp4",
  },
])("$name picker lifecycle", ({ name, Component, tab, type, filename }) => {
  it("labels the dialog, focuses it, closes on Escape and returns focus", async () => {
    function Example() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button onClick={() => setOpen(true)}>Open picker</button>
          <Component
            open={open}
            onClose={() => setOpen(false)}
            onSelect={vi.fn()}
          />
        </>
      );
    }
    render(<Example />);
    const trigger = screen.getByRole("button", { name: "Open picker" });
    trigger.focus();
    fireEvent.click(trigger);
    const dialog = screen.getByRole("dialog", { name: `Insert ${name}` });
    await waitFor(() =>
      expect(dialog.contains(document.activeElement)).toBe(true),
    );
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });
  it("does not select a late upload after the dialog is dismissed or reopened", async () => {
    let finish: (value: { error: null }) => void = () => {};
    mock.upload.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const select = vi.fn();
    const props = { onClose: vi.fn(), onSelect: select };
    const view = render(<Component open {...props} />);
    fireEvent.click(screen.getByRole("button", { name: tab }));
    fireEvent.change(document.querySelector('input[type="file"]')!, {
      target: { files: [new File(["content"], filename, { type })] },
    });
    view.rerender(<Component open={false} {...props} />);
    view.rerender(<Component open {...props} />);
    await act(async () => {
      finish({ error: null });
    });
    expect(select).not.toHaveBeenCalled();
    expect(mock.insert).not.toHaveBeenCalled();
  });
});
