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
  resetPasswordForEmail: vi.fn(),
  navigate: vi.fn(),
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => h.auth }));
vi.mock("@/lib/router-compat", () => ({ useNavigate: () => h.navigate }));
vi.mock("@/config/SiteConfigContext", () => ({
  useSiteConfig: () => ({
    identity: { name: "Test Site", logoInitials: "TS" },
  }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { resetPasswordForEmail: h.resetPasswordForEmail } },
}));

import AdminLogin from "../AdminLogin";

const signIn = vi.fn();
const signOut = vi.fn();
const recheckRole = vi.fn();
function state(overrides: Record<string, unknown> = {}) {
  h.auth = {
    user: null,
    loading: false,
    isAdmin: false,
    roleError: false,
    roleRechecking: false,
    signIn,
    signOut,
    recheckRole,
    ...overrides,
  };
}
const NEUTRAL =
  /if an admin account exists for that email, a reset link is on its way/i;

beforeEach(() => {
  vi.clearAllMocks();
  state();
});
afterEach(cleanup);

describe("admin login access messages", () => {
  it("says 'no admin access' only for a definite answer, with a way out", () => {
    state({ user: { id: "u", email: "member@example.com" } });
    render(<AdminLogin />);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "This account does not have admin access",
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: "Sign out and use a different account",
      }),
    );
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it("offers a retry when the access check itself failed", () => {
    state({ user: { id: "u", email: "brian@example.com" }, roleError: true });
    render(<AdminLogin />);
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Couldn't verify admin access");
    expect(alert).not.toHaveTextContent("does not have admin access");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(recheckRole).toHaveBeenCalledTimes(1);
  });

  it("re-runs the role check after a successful sign-in", async () => {
    signIn.mockResolvedValue({ error: null });
    render(<AdminLogin />);
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "brian@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "Harbor-Lantern-2026" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign In" }));
    await waitFor(() => expect(recheckRole).toHaveBeenCalledTimes(1));
    expect(signIn).toHaveBeenCalledWith(
      "brian@example.com",
      "Harbor-Lantern-2026",
    );
  });
});

describe("forgot password", () => {
  const openForgot = (email = "brian@example.com") => {
    render(<AdminLogin />);
    fireEvent.click(screen.getByRole("button", { name: "Forgot password?" }));
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: email },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send reset link" }));
  };

  it("sends a recovery email that returns to the reset page", async () => {
    h.resetPasswordForEmail.mockResolvedValue({ data: {}, error: null });
    openForgot();
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(NEUTRAL),
    );
    expect(h.resetPasswordForEmail).toHaveBeenCalledWith("brian@example.com", {
      redirectTo: `${window.location.origin}/admin/reset-password`,
    });
  });

  it("uses the same neutral message when the provider rejects the address", async () => {
    h.resetPasswordForEmail.mockResolvedValue({
      data: null,
      error: { name: "AuthApiError", status: 400, message: "User not found" },
    });
    openForgot("nobody@example.com");
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(NEUTRAL),
    );
    expect(screen.queryByText(/user not found/i)).toBeNull();
  });

  it("reports a connection failure without hinting at the account", async () => {
    h.resetPasswordForEmail.mockRejectedValue(new TypeError("Failed to fetch"));
    openForgot();
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Couldn't reach the server",
      ),
    );
  });

  it("returns to sign in", () => {
    render(<AdminLogin />);
    fireEvent.click(screen.getByRole("button", { name: "Forgot password?" }));
    fireEvent.click(screen.getByRole("button", { name: "Back to sign in" }));
    expect(screen.getByRole("button", { name: "Sign In" })).toBeInTheDocument();
  });
});
