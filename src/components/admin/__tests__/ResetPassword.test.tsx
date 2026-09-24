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
  auth: {} as Record<string, unknown>,
  hint: { kind: "none" } as { kind: string; code?: string },
  updateUser: vi.fn(),
  navigate: vi.fn(),
  toast: vi.fn(),
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => h.auth }));
vi.mock("@/lib/authRecovery", () => ({
  get initialRecoveryHint() {
    return h.hint;
  },
}));
vi.mock("@/lib/router-compat", () => ({
  useNavigate: () => h.navigate,
  Link: ({ to, children }: { to: string; children: React.ReactNode }) => (
    <a href={to}>{children}</a>
  ),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { updateUser: h.updateUser } },
}));
vi.mock("@/hooks/use-toast", () => ({ toast: h.toast }));

import ResetPassword from "../ResetPassword";

const endPasswordRecovery = vi.fn();
function state(overrides: Record<string, unknown> = {}) {
  h.auth = {
    user: { id: "u1", email: "brian@example.com" },
    loading: false,
    passwordRecovery: true,
    endPasswordRecovery,
    ...overrides,
  };
}
const STRONG = "Harbor-Lantern-2026";
function submit(password: string, confirm = password) {
  fireEvent.change(screen.getByLabelText("New password"), {
    target: { value: password },
  });
  fireEvent.change(screen.getByLabelText("Confirm new password"), {
    target: { value: confirm },
  });
  fireEvent.click(screen.getByRole("button", { name: "Set new password" }));
}

beforeEach(() => {
  vi.clearAllMocks();
  h.hint = { kind: "none" };
  state();
});
afterEach(cleanup);

describe("password reset page", () => {
  it("waits while the recovery link is being checked", () => {
    state({ loading: true, user: null, passwordRecovery: false });
    render(<ResetPassword />);
    expect(screen.getByRole("status")).toHaveTextContent(
      "Checking your reset link",
    );
  });

  it.each([
    ["an expired link", { kind: "error", code: "otp_expired" }, {}],
    ["no session", { kind: "none" }, { user: null, passwordRecovery: false }],
    ["an ordinary session", { kind: "none" }, { passwordRecovery: false }],
  ])("refuses %s and offers a new link", (_label, hint, overrides) => {
    h.hint = hint;
    state(overrides);
    render(<ResetPassword />);
    expect(
      screen.getByRole("heading", { level: 1, name: "Reset link expired" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Request a new link" }),
    ).toHaveAttribute("href", "/admin/login");
    expect(screen.queryByLabelText("New password")).toBeNull();
  });

  it("enforces the password policy", async () => {
    render(<ResetPassword />);
    submit("short");
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Use at least 12 characters.",
    );
    expect(h.updateUser).not.toHaveBeenCalled();
  });

  it("sets the new password, ends recovery mode and opens the admin", async () => {
    h.updateUser.mockResolvedValue({ data: {}, error: null });
    render(<ResetPassword />);
    expect(
      screen.getByRole("heading", { level: 1, name: "Choose a new password" }),
    ).toBeInTheDocument();
    submit(STRONG);
    await waitFor(() =>
      expect(h.navigate).toHaveBeenCalledWith("/admin", { replace: true }),
    );
    expect(h.updateUser).toHaveBeenCalledWith({ password: STRONG });
    expect(endPasswordRecovery).toHaveBeenCalledTimes(1);
  });

  it("shows server rejections", async () => {
    h.updateUser.mockResolvedValue({
      data: {},
      error: { code: "same_password", message: "x" },
    });
    render(<ResetPassword />);
    submit(STRONG);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Choose a password different from your current one.",
    );
    expect(h.navigate).not.toHaveBeenCalled();
  });
});
