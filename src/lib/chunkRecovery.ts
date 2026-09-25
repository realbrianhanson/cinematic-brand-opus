const RELOAD_KEY = "__chunk_reload_at";
const isChunkLoadError = (message: string) =>
  /Failed to fetch dynamically imported module|Importing a module script failed|ChunkLoadError|Loading chunk [\d]+ failed/i.test(
    message,
  );

/** Recover stale deploy assets only when a durable cooldown prevents reload loops. */
export function recoverChunkError(message: string): boolean {
  if (typeof window === "undefined" || !isChunkLoadError(message)) return false;
  try {
    const now = Date.now();
    const last = Number(window.sessionStorage.getItem(RELOAD_KEY) || 0);
    if (Number.isFinite(last) && last > 0 && now - last < 10_000) return false;
    window.sessionStorage.setItem(RELOAD_KEY, String(now));
    window.location.reload();
    return true;
  } catch {
    // Blocked/full storage must not throw inside the global error handler.
    // Keep the page's retry UI available; reloading without a cooldown can loop.
    return false;
  }
}
