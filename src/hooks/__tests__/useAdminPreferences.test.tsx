// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminPreferencesProvider } from "@/contexts/AdminPreferencesProvider";
import { SITE_THEME_BOOTSTRAP } from "@/lib/siteTheme";
import { useAdminPreferences } from "../useAdminPreferences";

const mocks = vi.hoisted(() => ({
  user: null as { id: string } | null,
  maybeSingle: vi.fn(),
  upsert: vi.fn(),
  toast: vi.fn(),
}));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: mocks.user }),
}));
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: mocks.toast }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: mocks.maybeSingle }) }),
      upsert: mocks.upsert,
    }),
  },
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => (resolve = done));
  return { promise, resolve };
}
function preferences() {
  return renderHook(
    () => ({ first: useAdminPreferences(), editor: useAdminPreferences() }),
    { wrapper: AdminPreferencesProvider },
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  mocks.user = null;
  mocks.maybeSingle.mockResolvedValue({ data: null, error: null });
  mocks.upsert.mockResolvedValue({ error: null });
  document.documentElement.dataset.siteTheme = "dark";
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("shared admin and public theme preferences", () => {
  it("uses the saved theme on public pages without an account or database write", () => {
    localStorage.setItem("admin-theme", "light");
    localStorage.setItem("admin-timezone", "invalid-zone");
    const { result } = preferences();
    expect(result.current.first.prefs).toEqual({
      theme: "light",
      timezone: "America/New_York",
    });
    expect(result.current.first.loaded).toBe(true);
    expect(document.documentElement.dataset.siteTheme).toBe("light");
    expect(mocks.maybeSingle).not.toHaveBeenCalled();
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("shares changes immediately and a stale editor callback saves the newest theme", async () => {
    mocks.user = { id: "admin-one" };
    const { result } = preferences();
    await waitFor(() => expect(result.current.first.loaded).toBe(true));
    const editorUpdate = result.current.editor.updatePref;
    await act(() => result.current.first.updatePref("theme", "light"));
    expect(result.current.editor.prefs.theme).toBe("light");
    expect(document.documentElement.dataset.siteTheme).toBe("light");
    await act(() => editorUpdate("timezone", "America/Chicago"));
    expect(localStorage.getItem("admin-theme")).toBe("light");
    expect(mocks.upsert).toHaveBeenLastCalledWith(
      { user_id: "admin-one", timezone: "America/Chicago" },
      { onConflict: "user_id" },
    );
    await act(() => result.current.first.updatePref("theme", "dark"));
    expect(document.documentElement.dataset.siteTheme).toBe("dark");
    expect(localStorage.getItem("admin-theme")).toBe("dark");
  });

  it("serializes rapid theme changes so a slow earlier save cannot win", async () => {
    mocks.user = { id: "admin-one" };
    const pending = deferred<{ error: null }>();
    mocks.upsert.mockReturnValueOnce(pending.promise);
    const { result } = preferences();
    await waitFor(() => expect(result.current.first.loaded).toBe(true));
    let firstSave!: Promise<void>;
    let secondSave!: Promise<void>;
    await act(async () => {
      firstSave = result.current.first.updatePref("theme", "light");
      secondSave = result.current.editor.updatePref("theme", "dark");
      await Promise.resolve();
    });
    expect(mocks.upsert).toHaveBeenCalledTimes(1);
    expect(result.current.first.prefs.theme).toBe("dark");
    await act(async () => {
      pending.resolve({ error: null });
      await Promise.all([firstSave, secondSave]);
    });
    expect(mocks.upsert).toHaveBeenLastCalledWith(
      { user_id: "admin-one", theme: "dark" },
      { onConflict: "user_id" },
    );
  });

  it("applies the account preference after login and caches it for the next public visit", async () => {
    mocks.maybeSingle.mockResolvedValue({
      data: { theme: "light", timezone: "Europe/London" },
      error: null,
    });
    const { result, rerender } = preferences();
    mocks.user = { id: "admin-one" };
    rerender();
    await waitFor(() => expect(result.current.first.prefs.theme).toBe("light"));
    expect(document.documentElement.dataset.siteTheme).toBe("light");
    expect(localStorage.getItem("admin-theme")).toBe("light");
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("does not apply an old account's response after switching accounts", async () => {
    mocks.user = { id: "old-admin" };
    const pending = deferred<{
      data: { theme: string; timezone: string };
      error: null;
    }>();
    mocks.maybeSingle.mockReturnValueOnce(pending.promise);
    mocks.maybeSingle.mockResolvedValueOnce({
      data: { theme: "light", timezone: "Europe/London" },
      error: null,
    });
    const { result, rerender } = preferences();
    mocks.user = { id: "new-admin" };
    rerender();
    await waitFor(() => expect(result.current.first.loaded).toBe(true));
    await act(async () =>
      pending.resolve({
        data: { theme: "dark", timezone: "America/Chicago" },
        error: null,
      }),
    );
    expect(result.current.first.prefs).toEqual({
      theme: "light",
      timezone: "Europe/London",
    });
    expect(document.documentElement.dataset.siteTheme).toBe("light");
  });

  it("rejects invalid choices and treats an invalid cached theme as dark", async () => {
    localStorage.setItem("admin-theme", "unexpected");
    const { result } = preferences();
    expect(result.current.first.prefs.theme).toBe("dark");
    await act(() => result.current.first.updatePref("theme", "unexpected"));
    await act(() => result.current.first.updatePref("timezone", "bad-zone"));
    expect(result.current.first.prefs).toEqual({
      theme: "dark",
      timezone: "America/New_York",
    });
    expect(mocks.upsert).not.toHaveBeenCalled();
    expect(mocks.toast).toHaveBeenCalledWith({
      title: "Invalid timezone",
      variant: "destructive",
    });
  });

  it.each(["local", "other-tab"])(
    "ignores a late remote read after a newer %s choice",
    async (source) => {
      mocks.user = { id: "admin-one" };
      const pending = deferred<{
        data: { theme: string; timezone: string };
        error: null;
      }>();
      mocks.maybeSingle.mockReturnValue(pending.promise);
      const { result } = preferences();
      if (source === "local") {
        await act(() => result.current.first.updatePref("theme", "light"));
      } else {
        act(() => {
          localStorage.setItem("admin-theme", "light");
          window.dispatchEvent(
            new StorageEvent("storage", {
              key: "admin-theme",
              newValue: "light",
              storageArea: localStorage,
            }),
          );
        });
      }
      await act(async () =>
        pending.resolve({
          data: { theme: "dark", timezone: "Europe/London" },
          error: null,
        }),
      );
      expect(result.current.first.prefs.theme).toBe("light");
      expect(result.current.editor.prefs.theme).toBe("light");
      expect(result.current.editor.prefs.timezone).toBe("Europe/London");
      expect(document.documentElement.dataset.siteTheme).toBe("light");
      expect(result.current.first.loaded).toBe(true);
    },
  );

  it("does not overwrite another tab's timezone when an earlier theme save finishes last", async () => {
    mocks.user = { id: "admin-one" };
    const remote = { theme: "dark", timezone: "America/New_York" };
    mocks.maybeSingle.mockResolvedValue({ data: { ...remote }, error: null });
    const firstTab = preferences();
    const secondTab = preferences();
    await waitFor(() => {
      expect(firstTab.result.current.first.loaded).toBe(true);
      expect(secondTab.result.current.first.loaded).toBe(true);
    });
    const pending = deferred<void>();
    mocks.upsert.mockImplementationOnce(async (payload) => {
      await pending.promise;
      Object.assign(remote, payload);
      return { error: null };
    });
    mocks.upsert.mockImplementationOnce(async (payload) => {
      Object.assign(remote, payload);
      return { error: null };
    });
    let themeSave!: Promise<void>;
    await act(async () => {
      themeSave = firstTab.result.current.first.updatePref("theme", "light");
      await Promise.resolve();
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: "admin-theme",
          newValue: "light",
          storageArea: localStorage,
        }),
      );
    });
    await act(() =>
      secondTab.result.current.editor.updatePref("timezone", "Europe/London"),
    );
    expect(remote.timezone).toBe("Europe/London");
    await act(async () => {
      pending.resolve();
      await themeSave;
    });
    expect(remote).toMatchObject({ theme: "light", timezone: "Europe/London" });
    expect(localStorage.getItem("admin-timezone")).toBe("Europe/London");
  });

  it("ignores session-storage events, handles removal, and does not echo cross-tab updates", () => {
    localStorage.setItem("admin-theme", "light");
    const { result } = preferences();
    act(() =>
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: "admin-theme",
          newValue: "dark",
          storageArea: sessionStorage,
        }),
      ),
    );
    expect(result.current.first.prefs.theme).toBe("light");
    const write = vi.spyOn(Storage.prototype, "setItem");
    act(() =>
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: "admin-theme",
          newValue: null,
          storageArea: localStorage,
        }),
      ),
    );
    expect(result.current.first.prefs.theme).toBe("dark");
    expect(write).not.toHaveBeenCalled();
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("continues switching in memory when storage and remote writes fail", async () => {
    mocks.user = { id: "admin-one" };
    mocks.upsert.mockRejectedValueOnce(new Error("Offline"));
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("Blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("Blocked");
    });
    const { result } = preferences();
    await waitFor(() => expect(result.current.first.loaded).toBe(true));
    await act(() => result.current.first.updatePref("theme", "light"));
    expect(document.documentElement.dataset.siteTheme).toBe("light");
    expect(mocks.toast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Preference saved on this device only",
      }),
    );
    await act(() => result.current.first.updatePref("theme", "dark"));
    expect(document.documentElement.dataset.siteTheme).toBe("dark");
    expect(mocks.upsert).toHaveBeenCalledTimes(2);
  });

  it("hydrates saved light mode without changing the server's initial component markup", async () => {
    function State() {
      return <output>{useAdminPreferences().prefs.theme}</output>;
    }
    const app = (
      <AdminPreferencesProvider>
        <State />
      </AdminPreferencesProvider>
    );
    localStorage.setItem("admin-theme", "light");
    const container = document.createElement("div");
    container.innerHTML = renderToString(app);
    expect(container.textContent).toBe("dark");
    new Function(SITE_THEME_BOOTSTRAP)();
    expect(document.documentElement.dataset.siteTheme).toBe("light");
    const onRecoverableError = vi.fn();
    let root!: Root;
    await act(async () => {
      root = hydrateRoot(container, app, { onRecoverableError });
    });
    expect(container.textContent).toBe("light");
    expect(document.documentElement.dataset.siteTheme).toBe("light");
    expect(onRecoverableError).not.toHaveBeenCalled();
    act(() => root.unmount());
  });
});
