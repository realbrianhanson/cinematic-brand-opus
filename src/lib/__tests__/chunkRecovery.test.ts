import { afterEach, describe, expect, it, vi } from "vitest";
import { recoverChunkError } from "@/lib/chunkRecovery";

const message = "Failed to fetch dynamically imported module: /assets/old.js";
function environment(last: string | null = null) {
  const storage = { getItem: vi.fn(() => last), setItem: vi.fn() };
  const reload = vi.fn();
  vi.stubGlobal("window", { sessionStorage: storage, location: { reload } });
  vi.spyOn(Date, "now").mockReturnValue(1_000_000);
  return { storage, reload };
}
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
describe("stale asset recovery", () => {
  it("records the cooldown before reloading a stale chunk", () => {
    const { storage, reload } = environment();
    expect(recoverChunkError(message)).toBe(true);
    expect(storage.setItem).toHaveBeenCalledWith(
      "__chunk_reload_at",
      "1000000",
    );
    expect(storage.setItem.mock.invocationCallOrder[0]).toBeLessThan(
      reload.mock.invocationCallOrder[0],
    );
  });
  it("does not loop or reload unrelated errors", () => {
    const { reload } = environment("995000");
    expect(recoverChunkError(message)).toBe(false);
    expect(recoverChunkError("Network error while saving a draft")).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });
  it.each(["read", "write", "getter"])(
    "leaves the retry UI available when storage %s is blocked",
    (failure) => {
      const { storage, reload } = environment();
      const blocked = () => {
        throw new Error("Storage unavailable");
      };
      if (failure === "read") storage.getItem.mockImplementation(blocked);
      if (failure === "write") storage.setItem.mockImplementation(blocked);
      if (failure === "getter")
        Object.defineProperty(window, "sessionStorage", { get: blocked });
      expect(() => recoverChunkError(message)).not.toThrow();
      expect(recoverChunkError(message)).toBe(false);
      expect(reload).not.toHaveBeenCalled();
    },
  );
  it("recovers a corrupt timestamp but never touches storage for unrelated errors", () => {
    const { storage, reload } = environment("corrupt");
    expect(recoverChunkError("Ordinary application failure")).toBe(false);
    expect(storage.getItem).not.toHaveBeenCalled();
    expect(recoverChunkError(message)).toBe(true);
    expect(reload).toHaveBeenCalledOnce();
  });
});
