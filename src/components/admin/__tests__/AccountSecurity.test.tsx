// @vitest-environment jsdom
import React from "react";
import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  signInWithPassword: vi.fn(),
  updateUser: vi.fn(),
  signOut: vi.fn(),
  toast: vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      signInWithPassword: h.signInWithPassword,
      updateUser: h.updateUser,
      signOut: h.signOut,
    },
  },
}));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "u1", email: "brian@example.com" } }),
}));
vi.mock("@/hooks/use-toast", () => ({ toast: h.toast }));

import AccountSecurity from "../AccountSecurity";

const STRONG = "Harbor-Lantern-2026";
beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.mocked(console.error).mockRestore();
});

function fill(current: string, next: string, confirm = next) {
  fireEvent.change(screen.getByLabelText("Current password"), {
    target: { value: current },
  });
  fireEvent.change(screen.getByLabelText("New password"), {
    target: { value: next },
  });
  fireEvent.change(screen.getByLabelText("Confirm new password"), {
    target: { value: confirm },
  });
  fireEvent.click(screen.getByRole("button", { name: "Update password" }));
}

describe("account security page", () => {
  it("has a page heading and named, labelled password controls", () => {
    render(<AccountSecurity />);
    expect(
      screen.getByRole("heading", { level: 1, name: "Account security" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Current password")).toHaveAttribute(
      "autocomplete",
      "current-password",
    );
    expect(screen.getByLabelText("New password")).toHaveAttribute(
      "autocomplete",
      "new-password",
    );
    const toggle = screen.getByRole("button", {
      name: "Show new password",
    });
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(toggle);
    expect(screen.getByLabelText("New password")).toHaveAttribute(
      "type",
      "text",
    );
    expect(
      screen.getByRole("button", { name: "Hide new password" }),
    ).toHaveAttribute("aria-pressed", "true");
  });
});

describe("change password", () => {
  it("rejects weak passwords before contacting the server", async () => {
    render(<AccountSecurity />);
    fill("old-password", "short1");
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Use at least 12 characters.",
    );
    expect(h.signInWithPassword).not.toHaveBeenCalled();
    expect(h.updateUser).not.toHaveBeenCalled();
  });

  it("requires matching confirmation", async () => {
    render(<AccountSecurity />);
    fill("old-password", STRONG, `${STRONG}x`);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "New passwords don't match.",
    );
    expect(h.updateUser).not.toHaveBeenCalled();
  });

  it("stops when the current password is wrong", async () => {
    h.signInWithPassword.mockResolvedValue({
      data: {},
      error: {
        status: 400,
        code: "invalid_credentials",
        message: "Invalid login credentials",
      },
    });
    render(<AccountSecurity />);
    fill("wrong-password", STRONG);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Current password is incorrect.",
    );
    expect(h.signInWithPassword).toHaveBeenCalledWith({
      email: "brian@example.com",
      password: "wrong-password",
    });
    expect(h.updateUser).not.toHaveBeenCalled();
  });

  it("re-authenticates, then updates the password and clears the form", async () => {
    h.signInWithPassword.mockResolvedValue({ data: {}, error: null });
    h.updateUser.mockResolvedValue({ data: {}, error: null });
    render(<AccountSecurity />);
    fill("Old-Password-2025", STRONG);
    await waitFor(() =>
      expect(h.updateUser).toHaveBeenCalledWith({ password: STRONG }),
    );
    expect(h.signInWithPassword.mock.invocationCallOrder[0]).toBeLessThan(
      h.updateUser.mock.invocationCallOrder[0],
    );
    expect(await screen.findByText("Password updated.")).toBeInTheDocument();
    expect(screen.getByLabelText("Current password")).toHaveValue("");
    expect(screen.getByLabelText("New password")).toHaveValue("");
  });

  it("explains server-side rejections in plain words", async () => {
    h.signInWithPassword.mockResolvedValue({ data: {}, error: null });
    h.updateUser.mockResolvedValue({
      data: {},
      error: {
        code: "weak_password",
        message: "Password is known to be weak and easy to guess",
        reasons: ["pwned"],
      },
    });
    render(<AccountSecurity />);
    fill("Old-Password-2025", STRONG);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This password appears in a known data breach. Choose a different one.",
    );
  });
});

describe("sign out other devices", () => {
  it("asks for confirmation, then revokes every other session", async () => {
    h.signOut.mockResolvedValue({ error: null });
    render(<AccountSecurity />);
    fireEvent.click(
      screen.getByRole("button", { name: "Sign out all other devices" }),
    );
    expect(h.signOut).not.toHaveBeenCalled();
    fireEvent.click(
      await screen.findByRole("button", { name: "Sign out other devices" }),
    );
    await waitFor(() =>
      expect(h.signOut).toHaveBeenCalledWith({ scope: "others" }),
    );
    expect(
      await screen.findByText(
        "All other devices were signed out. This browser stays signed in.",
      ),
    ).toBeInTheDocument();
  });

  it("does nothing when cancelled", async () => {
    render(<AccountSecurity />);
    fireEvent.click(
      screen.getByRole("button", { name: "Sign out all other devices" }),
    );
    fireEvent.click(await screen.findByRole("button", { name: "Cancel" }));
    expect(h.signOut).not.toHaveBeenCalled();
  });

  it("reports a failure", async () => {
    h.signOut.mockResolvedValue({ error: { message: "network down" } });
    render(<AccountSecurity />);
    fireEvent.click(
      screen.getByRole("button", { name: "Sign out all other devices" }),
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Sign out other devices" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Couldn't sign out other devices. Try again.",
    );
  });
});
