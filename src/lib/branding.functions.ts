import { createServerFn } from "@tanstack/react-start";
import { createPublicServerClient } from "./publicData.server";
import { buildRuntimeConfig, setupSchema } from "@/config/runtime";
import { siteConfig, type SiteConfig } from "@/config/site";

/** A slow branding read must not hold every page hostage. */
export const BRANDING_TIMEOUT_MS = 3_000;

type BrandingRow = { settings: unknown } | null;
type BrandingResult = {
  data: BrandingRow;
  error: { message: string } | null;
};

/**
 * Last branding that loaded and validated. It is public, identical for every
 * visitor and never mutated, so sharing it across SSR requests is safe; it
 * only replaces the static config while the database is unavailable.
 */
let lastGood: SiteConfig | null = null;

/** Test hook: forget the cached branding between cases. */
export function resetBrandingCacheForTests() {
  lastGood = null;
}

function fallback(reason: string, detail: unknown): SiteConfig {
  console.error(
    `[branding] ${reason}; serving ${lastGood ? "last good" : "static"} config`,
    detail,
  );
  return lastGood ?? siteConfig;
}

function withTimeout<T>(work: PromiseLike<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`branding read timed out after ${ms}ms`)),
      ms,
    );
  });
  return Promise.race([Promise.resolve(work), timeout]).finally(() =>
    clearTimeout(timer),
  );
}

/**
 * Never throws: a failed, slow or invalid branding read degrades to the last
 * good config (or the static siteConfig) instead of a site-wide HTTP 500.
 */
async function resolveSiteBranding(
  read: (signal: AbortSignal) => PromiseLike<BrandingResult>,
): Promise<SiteConfig> {
  try {
    const controller = new AbortController();
    const { data, error } = await withTimeout(
      read(controller.signal),
      BRANDING_TIMEOUT_MS,
    ).catch((cause: unknown) => {
      controller.abort();
      throw cause;
    });
    if (error) return fallback("site_branding read failed", error.message);
    if (!data) {
      lastGood = siteConfig;
      return siteConfig;
    }
    const parsed = setupSchema.safeParse(data.settings);
    if (!parsed.success)
      return fallback("site_branding settings invalid", parsed.error.issues);
    const config = buildRuntimeConfig(parsed.data);
    lastGood = config;
    return config;
  } catch (cause) {
    return fallback(
      "site_branding unavailable",
      cause instanceof Error ? cause.message : cause,
    );
  }
}

export const getSiteBranding = createServerFn({ method: "GET" }).handler(
  async () =>
    resolveSiteBranding((signal) =>
      createPublicServerClient()
        .from("site_branding")
        .select("settings")
        .eq("id", true)
        .abortSignal(signal)
        .maybeSingle(),
    ),
);
