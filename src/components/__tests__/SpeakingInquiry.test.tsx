// @vitest-environment jsdom
import React from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SpeakingInquiry from "../SpeakingInquiry";

const originalLocation = window.location;
const assign = vi.fn();
beforeEach(() => {
  assign.mockReset();
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { assign },
  });
});
afterEach(() => {
  cleanup();
  Object.defineProperty(window, "location", {
    configurable: true,
    value: originalLocation,
  });
  vi.restoreAllMocks();
});

function fillRequired() {
  fireEvent.change(screen.getByLabelText(/Your name/), {
    target: { value: "Alex Lee" },
  });
  fireEvent.change(screen.getByLabelText(/Email \(required\)/), {
    target: { value: "alex@example.com" },
  });
  fireEvent.change(screen.getByLabelText(/Event name/), {
    target: { value: "Business & AI / Fall" },
  });
}
function submit() {
  fireEvent.submit(
    screen.getByRole("button", { name: "Open email draft" }).closest("form")!,
  );
}

describe("speaking inquiry email handoff", () => {
  it("requires contact details before opening an email draft", () => {
    render(<SpeakingInquiry href="mailto:speaker@example.com" />);
    submit();
    expect(assign).not.toHaveBeenCalled();
    fillRequired();
    fireEvent.change(screen.getByLabelText(/Email \(required\)/), {
      target: { value: "invalid" },
    });
    submit();
    expect(assign).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText(/Email \(required\)/), {
      target: { value: "alex@example.com" },
    });
    fireEvent.change(screen.getByLabelText(/Your name/), {
      target: { value: "   " },
    });
    submit();
    expect(assign).not.toHaveBeenCalled();
    expect(screen.getByRole("status").textContent).toContain(
      "Please add your name",
    );
  });

  it("opens a safely encoded draft to the configured recipient, without claiming delivery", () => {
    render(
      <SpeakingInquiry href="mailto:speaker@example.com?subject=Speaking%20Inquiry&bcc=other%40example.com" />,
    );
    fillRequired();
    fireEvent.change(screen.getByLabelText(/Date or timeframe/), {
      target: { value: "October 2026" },
    });
    fireEvent.change(screen.getByLabelText(/Who will be/), {
      target: { value: "50 local founders" },
    });
    fireEvent.change(screen.getByLabelText(/What would you/), {
      target: { value: "Practical workflows\n&bcc=someone@example.com" },
    });
    submit();
    expect(assign).toHaveBeenCalledOnce();
    const href = new URL(assign.mock.calls[0][0]);
    expect(href.protocol).toBe("mailto:");
    expect(href.pathname).toBe("speaker@example.com");
    expect([...href.searchParams.keys()]).toEqual(["subject", "body"]);
    expect(href.searchParams.get("subject")).toBe("Speaking Inquiry");
    expect(href.searchParams.get("body")).toContain(
      "Event: Business & AI / Fall",
    );
    expect(href.searchParams.get("body")).toContain("Date: October 2026");
    expect(href.searchParams.get("body")).toContain("&bcc=someone@example.com");
    expect(screen.getByRole("status").textContent).toContain(
      "has not sent a message",
    );
    expect(
      (screen.getByLabelText("Your email draft") as HTMLTextAreaElement).value,
    ).toContain("To: speaker@example.com");
  });

  it("preserves encoded address characters without turning them into URI fragments", () => {
    render(
      <SpeakingInquiry href="mailto:events%23team@example.com?subject=Speaking%20Inquiry" />,
    );
    fillRequired();
    submit();
    const href = new URL(assign.mock.calls[0][0]);
    expect(href.hash).toBe("");
    expect(href.pathname).toBe("events%23team@example.com");
    expect(decodeURIComponent(href.pathname)).toBe("events#team@example.com");
    expect(href.searchParams.get("subject")).toBe("Speaking Inquiry");
    expect(href.searchParams.get("body")).toContain("Name: Alex Lee");
    expect(
      (screen.getByLabelText("Your email draft") as HTMLTextAreaElement).value,
    ).toContain("To: events#team@example.com");
  });

  it("rejects unsafe recipient headers and keeps subjects on one line", () => {
    const { rerender } = render(
      <SpeakingInquiry href="mailto:speaker@example.com%0d%0aBcc:other@example.com" />,
    );
    expect(
      screen.queryByRole("button", { name: "Open email draft" }),
    ).toBeNull();
    rerender(
      <SpeakingInquiry href="mailto:speaker@example.com?subject=Speaking%0D%0ABcc%3Aother%40example.com" />,
    );
    fillRequired();
    submit();
    const href = new URL(assign.mock.calls[0][0]);
    expect(href.searchParams.get("subject")).not.toMatch(/[\r\n]/);
    expect(href.searchParams.has("bcc")).toBe(false);
  });

  it("lets the visitor copy or manually select the draft when an email app is unavailable", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("Clipboard blocked"));
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    render(<SpeakingInquiry href="mailto:speaker@example.com" />);
    fillRequired();
    submit();
    fireEvent.click(screen.getByRole("button", { name: "Copy draft" }));
    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toContain(
        "Select and copy",
      ),
    );
    const draft = screen.getByLabelText(
      "Your email draft",
    ) as HTMLTextAreaElement;
    expect(document.activeElement).toBe(draft);
    expect(draft.selectionEnd).toBe(draft.value.length);
    writeText.mockResolvedValue(undefined);
    fireEvent.click(screen.getByRole("button", { name: "Copy draft" }));
    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toContain("Draft copied"),
    );
    expect(writeText).toHaveBeenLastCalledWith(draft.value);
  });
});
