// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import OfferRecovery from "../OfferRecovery";
const invoke = vi.hoisted(() => vi.fn());
vi.mock("@/lib/offers", () => ({ invokeOfferApi: invoke }));
afterEach(() => {
  cleanup();
  invoke.mockReset();
});
describe("download recovery", () => {
  it("acknowledges without claiming that an address exists or a message was delivered", async () => {
    invoke.mockResolvedValue({ accepted: true });
    render(<OfferRecovery />);
    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "reader@example.com" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Email my access links" }),
    );
    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toContain(
        "If eligible downloads match",
      ),
    );
    expect(invoke).toHaveBeenCalledWith({
      action: "recover",
      email: "reader@example.com",
      website: "",
    });
    expect(screen.queryByRole("button", { name: "Download file" })).toBeNull();
    expect(
      screen
        .getByRole("link", { name: "Contact support" })
        .getAttribute("href"),
    ).toBe("/support");
  });
  it("preserves the email and reports unavailability without fake success", async () => {
    invoke.mockRejectedValue(new Error("Email recovery is unavailable."));
    render(<OfferRecovery />);
    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "reader@example.com" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Email my access links" }),
    );
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain("unavailable"),
    );
    expect(
      (screen.getByLabelText("Email address") as HTMLInputElement).value,
    ).toBe("reader@example.com");
    expect(screen.queryByRole("status")).toBeNull();
  });
  it("blocks duplicate in-flight submits", async () => {
    invoke.mockReturnValue(new Promise(() => {}));
    render(<OfferRecovery />);
    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "reader@example.com" },
    });
    const form = screen.getByLabelText("Email address").closest("form")!;
    fireEvent.submit(form);
    fireEvent.submit(form);
    expect(invoke).toHaveBeenCalledTimes(1);
  });
});
