import { beforeEach, describe, expect, it, vi } from "vitest";
import { siteConfig } from "@/config/site";
import { setupDefaults } from "@/config/runtime";

const mocks = vi.hoisted(() => ({
  result: { data: null, error: null } as {
    data: { settings: unknown } | null;
    error: { message: string } | null;
  },
  pending: false,
  throwOnCreate: false,
  signal: undefined as AbortSignal | undefined,
}));

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({ handler: (run: () => unknown) => run }),
}));
vi.mock("../publicData.server", () => ({
  createPublicServerClient: () => {
    if (mocks.throwOnCreate)
      throw new Error("Public Supabase configuration is unavailable");
    const query = {
      from: () => query,
      select: () => query,
      eq: () => query,
      abortSignal: (signal: AbortSignal) => {
        mocks.signal = signal;
        return query;
      },
      maybeSingle: () =>
        mocks.pending ? new Promise(() => {}) : Promise.resolve(mocks.result),
    };
    return query;
  },
}));

import {
  BRANDING_TIMEOUT_MS,
  getSiteBranding,
  resetBrandingCacheForTests,
} from "../branding.functions";

const validSettings = {
  ...setupDefaults(siteConfig),
  mode: "owner" as const,
  name: "Test Brand",
  description: "A description that is long enough to pass.",
};

describe("getSiteBranding", () => {
  beforeEach(() => {
    mocks.result = { data: null, error: null };
    mocks.pending = false;
    mocks.throwOnCreate = false;
    mocks.signal = undefined;
    resetBrandingCacheForTests();
    vi.restoreAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("builds the runtime config from valid stored settings", async () => {
    mocks.result = { data: { settings: validSettings }, error: null };
    const config = await getSiteBranding();
    expect(config.identity.name).toBe("Test Brand");
    expect(mocks.signal).toBeInstanceOf(AbortSignal);
  });

  it("uses the static config when no branding row exists", async () => {
    expect(await getSiteBranding()).toBe(siteConfig);
  });

  it("falls back to the static config on a database error and logs it", async () => {
    mocks.result = {
      data: null,
      error: { message: "FATAL 57P03: the database system is shutting down" },
    };
    expect(await getSiteBranding()).toBe(siteConfig);
    expect(console.error).toHaveBeenCalled();
  });

  it("falls back when stored settings no longer match the schema", async () => {
    mocks.result = {
      data: { settings: { ...validSettings, description: "short" } },
      error: null,
    };
    expect(await getSiteBranding()).toBe(siteConfig);
    expect(console.error).toHaveBeenCalled();
  });

  it("falls back when the client cannot even be created", async () => {
    mocks.throwOnCreate = true;
    expect(await getSiteBranding()).toBe(siteConfig);
  });

  it("serves the last good branding during an outage", async () => {
    mocks.result = { data: { settings: validSettings }, error: null };
    const good = await getSiteBranding();
    mocks.result = { data: null, error: { message: "503" } };
    expect(await getSiteBranding()).toBe(good);
    mocks.result = { data: { settings: { mode: "nope" } }, error: null };
    expect(await getSiteBranding()).toBe(good);
  });

  it("gives up after the timeout instead of hanging the request", async () => {
    vi.useFakeTimers();
    try {
      mocks.pending = true;
      const pending = getSiteBranding();
      await vi.advanceTimersByTimeAsync(BRANDING_TIMEOUT_MS + 1);
      expect(await pending).toBe(siteConfig);
    } finally {
      vi.useRealTimers();
    }
  });
});
