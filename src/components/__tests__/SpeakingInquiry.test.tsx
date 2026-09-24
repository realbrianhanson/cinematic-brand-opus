// @vitest-environment jsdom
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const { send } = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock("@/lib/speakingInquiries", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@/lib/speakingInquiries")>();
  return { ...original, submitSpeakingInquiry: send };
});
import SpeakingInquiry from "../SpeakingInquiry";
import { speakingEmailHref } from "@/lib/speakingInquiries";
const id = "10000000-0000-4000-8000-000000000001";
beforeEach(() => {
  send.mockReset();
  vi.spyOn(crypto, "randomUUID").mockReturnValue(id);
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function fillRequired() {
  fireEvent.change(screen.getByLabelText(/Your name/), {
    target: { value: "Alex Lee" },
  });
  fireEvent.change(screen.getByLabelText(/Email \(required\)/), {
    target: { value: "alex@example.com" },
  });
  fireEvent.change(screen.getByLabelText(/Event name/), {
    target: { value: "Business & AI" },
  });
}
function submit() {
  fireEvent.submit(
    screen
      .getByRole("button", { name: /speaking inquiry|Sending inquiry/ })
      .closest("form")!,
  );
}
describe("speaking inquiry capture", () => {
  it("prevents native GET submission before hydration and offers email fallback", () => {
    const html = renderToStaticMarkup(
      <SpeakingInquiry href="mailto:speaker@example.com" />,
    );
    expect(html).toContain('method="post"');
    expect(html).toContain('<fieldset disabled=""');
    expect(html).toMatch(/type="submit" disabled=""/);
    expect(html).toContain(
      'href="mailto:speaker@example.com?subject=Speaking%20inquiry"',
    );
    expect(html).toContain("<noscript>");
  });
  it("requires valid contact information before submitting", async () => {
    render(<SpeakingInquiry href="mailto:speaker@example.com" />);
    submit();
    expect(send).not.toHaveBeenCalled();
    fillRequired();
    fireEvent.change(screen.getByLabelText(/Your name/), {
      target: { value: "   " },
    });
    submit();
    expect(await screen.findByRole("alert")).toHaveTextContent("your name");
    expect(send).not.toHaveBeenCalled();
  });
  it("waits for a confirmed save and blocks duplicate clicks", async () => {
    let finish!: () => void;
    send.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    render(<SpeakingInquiry href="mailto:speaker@example.com" />);
    fillRequired();
    submit();
    submit();
    expect(send).toHaveBeenCalledOnce();
    expect(screen.queryByText("Your inquiry is in")).toBeNull();
    expect(
      screen.getByRole("button", { name: "Sending inquiry" }),
    ).toBeDisabled();
    finish();
    expect(await screen.findByText("Your inquiry is in")).toBeVisible();
    expect(screen.getByRole("status")).toHaveFocus();
    expect(send.mock.calls[0][0]).toMatchObject({
      request_id: id,
      email: "alex@example.com",
      event_name: "Business & AI",
      event_format: "undecided",
    });
  });
  it("keeps inputs and the request identity after an uncertain submission", async () => {
    send
      .mockRejectedValueOnce(new Error("Could not confirm. Try again."))
      .mockResolvedValueOnce(undefined);
    render(<SpeakingInquiry href="mailto:speaker@example.com" />);
    fillRequired();
    submit();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not confirm",
    );
    expect(screen.getByLabelText(/Your name/)).toHaveValue("Alex Lee");
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Send speaking inquiry" }),
      ).toBeEnabled(),
    );
    submit();
    expect(await screen.findByText("Your inquiry is in")).toBeVisible();
    expect(send.mock.calls[1][0]).toEqual(send.mock.calls[0][0]);
  });
  it("safely provides email fallback without requiring a configured email to collect inquiries", () => {
    const { rerender } = render(
      <SpeakingInquiry href="mailto:speaker@example.com?subject=Hello&bcc=other@example.com" />,
    );
    const link = screen.getByRole("link", { name: "Contact us directly" });
    expect(link).toHaveAttribute(
      "href",
      "mailto:speaker@example.com?subject=Hello",
    );
    rerender(<SpeakingInquiry href="javascript:bad" />);
    expect(
      screen.queryByRole("link", { name: "Contact us directly" }),
    ).toBeNull();
    expect(
      screen.getByRole("button", { name: "Send speaking inquiry" }),
    ).toBeVisible();
    expect(
      speakingEmailHref("mailto:speaker@example.com%0D%0ABcc:bad@example.com"),
    ).toBeNull();
    expect(speakingEmailHref("mailto:events%23team@example.com")).toContain(
      "events%23team@example.com",
    );
  });
});
