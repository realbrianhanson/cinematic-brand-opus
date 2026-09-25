// @vitest-environment jsdom
import React from "react";
import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MediaUsage } from "@/lib/mediaDelete";

const mocks = vi.hoisted(() => ({
  load: vi.fn(),
  findMediaUsage: vi.fn(),
  deleteMedia: vi.fn(),
  toast: vi.fn(),
  storageRemove: vi.fn(),
  mediaDelete: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => {
  const chain = {
    select: () => chain,
    in: () => chain,
    order: () => chain,
    abortSignal: () => mocks.load(),
    delete: () => {
      mocks.mediaDelete();
      return chain;
    },
    insert: async () => ({ error: null }),
  };
  return {
    supabase: {
      from: () => chain,
      storage: {
        from: () => ({
          remove: mocks.storageRemove,
          upload: async () => ({ error: null }),
          getPublicUrl: () => ({ data: { publicUrl: "https://cdn.test/new" } }),
        }),
      },
    },
  };
});

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: mocks.toast }),
}));

vi.mock("@/lib/mediaDelete", () => ({
  findMediaUsage: mocks.findMediaUsage,
  deleteMedia: mocks.deleteMedia,
}));

import MediaLibrary from "../MediaLibrary";

const photo = {
  id: "m1",
  name: "hero.png",
  file_path: "photos/1-a.png",
  url: "https://cdn.test/blog-images/photos/1-a.png",
  type: "photo",
  size: 10,
  mime_type: "image/png",
  created_at: "2026-09-01T00:00:00Z",
};

const unused: MediaUsage = {
  total: 0,
  truncated: false,
  titles: [],
  references: [],
};

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.load.mockResolvedValue({ data: [photo], error: null });
  mocks.findMediaUsage.mockResolvedValue(unused);
  mocks.deleteMedia.mockResolvedValue({ storageError: null });
});

afterEach(cleanup);

describe("MediaLibrary delete", () => {
  it("opens a confirmation instead of deleting, and deletes only after confirm", async () => {
    render(<MediaLibrary />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Delete hero.png" }),
    );

    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText(/Delete “hero.png”\?/)).toBeInTheDocument();
    expect(
      await within(dialog).findByText(/Not used in any post/),
    ).toBeInTheDocument();
    expect(mocks.findMediaUsage).toHaveBeenCalledWith(
      expect.objectContaining({ id: "m1" }),
    );
    expect(mocks.deleteMedia).not.toHaveBeenCalled();
    expect(mocks.storageRemove).not.toHaveBeenCalled();
    expect(mocks.mediaDelete).not.toHaveBeenCalled();

    fireEvent.click(
      within(dialog).getByRole("button", { name: "Delete file" }),
    );
    await waitFor(() =>
      expect(mocks.deleteMedia).toHaveBeenCalledWith(
        expect.objectContaining({ id: "m1", file_path: "photos/1-a.png" }),
      ),
    );
    await waitFor(() =>
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument(),
    );
    expect(screen.queryByText("hero.png")).not.toBeInTheDocument();
    expect(mocks.toast).toHaveBeenCalledWith({ title: "File deleted" });
  });

  it("cancel closes the dialog without deleting", async () => {
    render(<MediaLibrary />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Delete hero.png" }),
    );
    const dialog = await screen.findByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() =>
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument(),
    );
    expect(mocks.deleteMedia).not.toHaveBeenCalled();
    expect(screen.getByText("hero.png")).toBeInTheDocument();
  });

  it("names the pages using the file and requires a second confirmation", async () => {
    mocks.findMediaUsage.mockResolvedValue({
      total: 2,
      truncated: false,
      titles: ["AI agents", "Hiring guide"],
      references: [],
    });
    render(<MediaLibrary />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Delete hero.png" }),
    );
    const dialog = await screen.findByRole("alertdialog");
    expect(
      await within(dialog).findByText(
        /Used in 2 places: AI agents, Hiring guide/,
      ),
    ).toBeInTheDocument();

    const confirm = within(dialog).getByRole("button", { name: "Delete file" });
    expect(confirm).toBeDisabled();
    fireEvent.click(confirm);
    expect(mocks.deleteMedia).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole("checkbox"));
    expect(confirm).toBeEnabled();
    fireEvent.click(confirm);
    await waitFor(() => expect(mocks.deleteMedia).toHaveBeenCalledTimes(1));
  });

  it("keeps delete behind an acknowledgement when the usage check fails", async () => {
    mocks.findMediaUsage.mockRejectedValue(new Error("network down"));
    render(<MediaLibrary />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Delete hero.png" }),
    );
    const dialog = await screen.findByRole("alertdialog");
    expect(await within(dialog).findByText(/network down/)).toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", { name: "Delete file" }),
    ).toBeDisabled();
  });

  it("keeps the file and shows the error when the delete fails", async () => {
    mocks.deleteMedia.mockRejectedValue(new Error("rls denied"));
    render(<MediaLibrary />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Delete hero.png" }),
    );
    const dialog = await screen.findByRole("alertdialog");
    await within(dialog).findByText(/Not used in any post/);
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Delete file" }),
    );
    await waitFor(() =>
      expect(mocks.toast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Delete failed",
          description: "rls denied",
        }),
      ),
    );
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
  });

  it("gives tile actions accessible names and hides them from the pointer until revealed", async () => {
    render(<MediaLibrary />);
    const copy = await screen.findByRole("button", {
      name: "Copy URL for hero.png",
    });
    const del = screen.getByRole("button", { name: "Delete hero.png" });
    for (const button of [copy, del]) {
      expect(button).toHaveClass("pointer-events-none");
      expect(button).toHaveClass("group-hover:pointer-events-auto");
      expect(button).toHaveClass("group-focus-within:pointer-events-auto");
      expect(button.style.pointerEvents).toBe("");
    }
  });
});

describe("MediaLibrary load errors", () => {
  it("shows an error with Retry instead of an empty library", async () => {
    mocks.load.mockResolvedValueOnce({
      data: null,
      error: { message: "JWT expired" },
    });
    render(<MediaLibrary />);
    expect(
      await screen.findByText(/Couldn't load your photos/),
    ).toBeInTheDocument();
    expect(screen.getByText(/JWT expired/)).toBeInTheDocument();
    expect(screen.queryByText(/No photos yet/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("hero.png")).toBeInTheDocument();
    expect(screen.queryByText(/Couldn't load/)).not.toBeInTheDocument();
  });

  it("still shows the empty state when the load succeeds with no files", async () => {
    mocks.load.mockResolvedValue({ data: [], error: null });
    render(<MediaLibrary />);
    expect(await screen.findByText(/No photos yet/)).toBeInTheDocument();
  });

  it("keeps the last good list when a refresh fails", async () => {
    render(<MediaLibrary />);
    expect(await screen.findByText("hero.png")).toBeInTheDocument();

    // A successful upload refetches the list; make that refetch fail.
    mocks.load.mockRejectedValueOnce(new Error("offline"));
    const input = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    const file = new File(["x"], "new.png", { type: "image/png" });
    Object.defineProperty(input, "files", { value: [file] });
    fireEvent.change(input);

    expect(
      await screen.findByText(/Couldn't refresh media/),
    ).toBeInTheDocument();
    expect(screen.getByText("hero.png")).toBeInTheDocument();
  });
});
