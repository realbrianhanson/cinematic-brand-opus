import { useEffect, useState } from "react";

export interface MediaPreferences {
  /** true when the visitor asked the OS to reduce motion. */
  reducedMotion: boolean;
  /** true when the browser reports a data-saving or very slow connection. */
  saveData: boolean;
  /** Decorative video / expensive motion should be skipped. */
  lightMode: boolean;
  /** false until the effect runs, so SSR and first paint agree. */
  resolved: boolean;
}

const DEFAULTS: MediaPreferences = {
  reducedMotion: false,
  saveData: false,
  lightMode: false,
  resolved: false,
};

const readSaveData = (): boolean => {
  const connection = (
    navigator as Navigator & {
      connection?: { saveData?: boolean; effectiveType?: string };
    }
  ).connection;
  if (!connection) return false;
  if (connection.saveData) return true;
  return connection.effectiveType === "slow-2g" || connection.effectiveType === "2g";
};

/**
 * Reads motion and data-saving preferences after hydration.
 *
 * Deliberately client-only: reading them during render would produce SSR
 * markup that disagrees with the browser and cause a hydration mismatch.
 */
export function useMediaPreferences(): MediaPreferences {
  const [prefs, setPrefs] = useState<MediaPreferences>(DEFAULTS);

  useEffect(() => {
    let query: MediaQueryList | null = null;

    const apply = () => {
      const reducedMotion = query?.matches ?? false;
      let saveData = false;
      try {
        saveData = readSaveData();
      } catch {
        saveData = false;
      }
      setPrefs({
        reducedMotion,
        saveData,
        lightMode: reducedMotion || saveData,
        resolved: true,
      });
    };

    try {
      query = window.matchMedia("(prefers-reduced-motion: reduce)");
    } catch {
      query = null;
    }

    apply();

    if (!query) return;
    if (typeof query.addEventListener === "function") {
      query.addEventListener("change", apply);
      return () => query?.removeEventListener("change", apply);
    }
    return;
  }, []);

  return prefs;
}
