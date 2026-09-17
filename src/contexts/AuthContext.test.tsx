// @vitest-environment jsdom
import React from "react";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider, useAuth } from "./AuthContext";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(), onAuthStateChange: vi.fn(), maybeSingle: vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { ...mocks, signInWithPassword: vi.fn(), signOut: vi.fn() },
    from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: mocks.maybeSingle }) }) }) }),
  },
}));

const user = (id: string) => ({ id });
function State() {
  const state = useAuth();
  return <output>{JSON.stringify({ id: state.user?.id ?? null, loading: state.loading, admin: state.isAdmin })}</output>;
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
const current = () => JSON.parse(screen.getByRole("status").textContent!);
let event: (name: string, session: { user: { id: string } } | null) => void;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.onAuthStateChange.mockImplementation((callback) => {
    event = callback;
    return { data: { subscription: { unsubscribe: vi.fn() } } };
  });
});
afterEach(cleanup);

describe("authentication races", () => {
  it("does not let a late session read undo a newer auth event", async () => {
    const session = deferred<{ data: { session: { user: { id: string } } } }>();
    mocks.getSession.mockReturnValue(session.promise);
    mocks.maybeSingle.mockResolvedValue({ data: null, error: null });
    render(<AuthProvider><State /></AuthProvider>);
    act(() => event("SIGNED_OUT", null));
    await act(async () => session.resolve({ data: { session: { user: user("old") } } }));
    expect(current()).toEqual({ id: null, loading: false, admin: false });
  });

  it("binds admin permission to the current user and fails closed on lookup rejection", async () => {
    mocks.getSession.mockResolvedValue({ data: { session: { user: user("admin") } } });
    mocks.maybeSingle.mockResolvedValueOnce({ data: { role: "admin" }, error: null });
    render(<AuthProvider><State /></AuthProvider>);
    await waitFor(() => expect(current().admin).toBe(true));
    const pending = deferred<{ data: null; error: null }>();
    mocks.maybeSingle.mockReturnValueOnce(pending.promise);
    act(() => event("SIGNED_IN", { user: user("member") }));
    expect(current()).toEqual({ id: "member", admin: false, loading: true });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.maybeSingle.mockRejectedValueOnce(new Error("Offline"));
    act(() => event("SIGNED_IN", { user: user("other") }));
    await waitFor(() => expect(current()).toEqual({ id: "other", admin: false, loading: false }));
    await act(async () => pending.resolve({ data: null, error: null }));
    expect(current().id).toBe("other");
    errorSpy.mockRestore();
  });
});
