// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PageShareBar from "@/components/widgets/PageShareBar";
import { brianPreset } from "@/config/presets/brian";

const route = vi.hoisted(() => ({ pathname: "/guides/ai-for-small-business" }));
vi.mock("@/lib/router-compat", () => ({ useLocation: () => route }));
vi.mock("@/config/SiteConfigContext", () => ({
  useSiteConfig: () => brianPreset,
}));
beforeEach(() => {
  route.pathname = "/guides/ai-for-small-business";
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
  });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("page share controls", () => {
  it("offers manual copying when a permission request stalls, ignoring its late completion", async () => {
    vi.useFakeTimers();
    let finish!: () => void;
    vi.mocked(navigator.clipboard.writeText).mockReturnValueOnce(
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
    );
    render(<PageShareBar config={{ platforms: ["copy"] }} />);
    fireEvent.click(screen.getByRole("button", { name: "Copy link" }));
    expect(screen.getByRole("button", { name: "Copying…" })).toHaveProperty(
      "disabled",
      true,
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(screen.getByRole("textbox", { name: "Page link" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Copy link" })).toHaveProperty(
      "disabled",
      false,
    );
    await act(async () => {
      finish();
    });
    expect(screen.queryByText("Page link copied.")).toBeNull();
    expect(screen.getByRole("textbox", { name: "Page link" })).toBeTruthy();
  });
  it("copies the canonical page URL and announces success", async () => {
    render(<PageShareBar config={{ platforms: ["copy", "email"] }} />);
    fireEvent.click(screen.getByRole("button", { name: "Copy link" }));
    await screen.findByText("Page link copied.");
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      "https://brianhanson.com/guides/ai-for-small-business",
    );
    expect(
      screen
        .getByRole("link", { name: "Share via email" })
        .getAttribute("href"),
    ).toContain(
      encodeURIComponent(
        "https://brianhanson.com/guides/ai-for-small-business",
      ),
    );
  });
  it("offers a selectable page link when clipboard access fails", async () => {
    vi.mocked(navigator.clipboard.writeText).mockRejectedValue(
      new Error("blocked"),
    );
    render(<PageShareBar config={{ platforms: ["copy"] }} />);
    fireEvent.click(screen.getByRole("button", { name: "Copy link" }));
    const input = (await screen.findByRole("textbox", {
      name: "Page link",
    })) as HTMLInputElement;
    expect(input.value).toBe(
      "https://brianhanson.com/guides/ai-for-small-business",
    );
    expect(input.readOnly).toBe(true);
    expect(screen.getByRole("status").textContent).toMatch(/couldn’t copy/i);
    expect(screen.queryByText("Page link copied.")).toBeNull();
  });
  it("does not report an old page's pending copy as the new page's success", async () => {
    let finish!: () => void;
    vi.mocked(navigator.clipboard.writeText).mockReturnValue(
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
    );
    const { rerender } = render(
      <PageShareBar config={{ platforms: ["copy"] }} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Copy link" }));
    route.pathname = "/blog/another-post";
    rerender(<PageShareBar config={{ platforms: ["copy"] }} />);
    finish();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Copy link" })).toBeTruthy(),
    );
    expect(screen.queryByText("Page link copied.")).toBeNull();
  });
});
