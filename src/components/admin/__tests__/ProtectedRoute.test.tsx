// @vitest-environment jsdom
import React from "react";
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({
  value: {} as Record<string, unknown>,
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => auth.value }));
vi.mock("@/lib/router-compat", () => ({
  Navigate: ({ to }: { to: string }) => <p>redirect:{to}</p>,
}));

import ProtectedRoute from "../ProtectedRoute";

const recheckRole = vi.fn();
const signOut = vi.fn();
function state(overrides: Record<string, unknown>) {
  auth.value = {
    user: { id: "u1", email: "brian@example.com" },
    loading: false,
    isAdmin: false,
    roleError: false,
    roleRechecking: false,
    recheckRole,
    signOut,
    ...overrides,
  };
}
const renderGuard = () =>
  render(
    <ProtectedRoute>
      <p>secret admin content</p>
    </ProtectedRoute>,
  );

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("admin route guard", () => {
  it("renders children only for a confirmed admin", () => {
    state({ isAdmin: true });
    renderGuard();
    expect(screen.getByText("secret admin content")).toBeInTheDocument();
  });

  it("redirects a signed-in user who definitely has no admin role", () => {
    state({});
    renderGuard();
    expect(screen.getByText("redirect:/admin/login")).toBeInTheDocument();
  });

  it("shows a retry state instead of redirecting when the role check failed", () => {
    state({ roleError: true });
    renderGuard();
    expect(screen.queryByText("secret admin content")).toBeNull();
    expect(screen.queryByText(/redirect:/)).toBeNull();
    expect(
      screen.getByRole("heading", {
        name: /couldn't verify your admin access/i,
      }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(recheckRole).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it("shows automatic retries in progress", () => {
    state({ roleError: true, roleRechecking: true });
    renderGuard();
    expect(screen.getByRole("button", { name: "Checking…" })).toBeDisabled();
  });
});
