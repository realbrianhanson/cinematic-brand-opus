// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import WorkflowDemonstration from "../WorkflowDemonstration";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
describe("worked follow-up demonstration", () => {
  it("copies the complete fictional prompt without generating or sending anything", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    render(<WorkflowDemonstration />);
    fireEvent.click(
      screen.getByRole("button", { name: "Copy example prompt" }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Prompt copied" }),
      ).toBeTruthy(),
    );
    expect(writeText).toHaveBeenCalledOnce();
    expect(writeText.mock.calls[0][0]).toContain("Fictional example");
    expect(writeText.mock.calls[0][0]).toContain(
      "No price or start date was agreed",
    );
    expect(screen.queryByRole("form")).toBeNull();
  });
  it("keeps the prompt readable when clipboard permission is unavailable", async () => {
    vi.stubGlobal("navigator", {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
    });
    render(<WorkflowDemonstration />);
    fireEvent.click(
      screen.getByRole("button", { name: "Copy example prompt" }),
    );
    await waitFor(() =>
      expect(screen.getByText(/Select and copy the prompt above/)).toBeTruthy(),
    );
    expect(
      screen.getByText(/Turn the notes below into a client follow-up draft/),
    ).toBeTruthy();
  });
});
