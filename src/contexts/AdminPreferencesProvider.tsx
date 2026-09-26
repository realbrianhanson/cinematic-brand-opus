import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import {
  AdminPreferencesContext,
  type AdminPreferences,
} from "@/hooks/useAdminPreferences";
import {
  applySiteTheme,
  normalizeSiteTheme,
  SITE_THEME_STORAGE_KEY,
} from "@/lib/siteTheme";

const TIMEZONE_STORAGE_KEY = "admin-timezone";
const DEFAULTS: AdminPreferences = {
  theme: "dark",
  timezone: "America/New_York",
};

function validTimezone(value: unknown): value is string {
  if (typeof value !== "string" || !value) return false;
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

function cachedValue(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function cachedPreferences(): AdminPreferences {
  const timezone = cachedValue(TIMEZONE_STORAGE_KEY);
  return {
    theme: normalizeSiteTheme(cachedValue(SITE_THEME_STORAGE_KEY)),
    timezone: validTimezone(timezone) ? timezone : DEFAULTS.timezone,
  };
}

function cachePreferences(prefs: AdminPreferences) {
  for (const [key, value] of [
    [SITE_THEME_STORAGE_KEY, prefs.theme],
    [TIMEZONE_STORAGE_KEY, prefs.timezone],
  ]) {
    try {
      localStorage.setItem(key, value);
    } catch {
      // Current-page preferences still work when browser storage is blocked.
    }
  }
}

export function AdminPreferencesProvider({
  children,
}: {
  children: ReactNode;
}) {
  const { user } = useAuth();
  const userId = user?.id;
  const { toast } = useToast();
  // The server and first client render agree. The head bootstrap has already
  // applied the saved color theme before this state hydrates from storage.
  const [prefs, setPrefs] = useState<AdminPreferences>(DEFAULTS);
  const [loaded, setLoaded] = useState(false);
  const current = useRef(DEFAULTS);
  const revisions = useRef({ theme: 0, timezone: 0 });
  const saveQueue = useRef(Promise.resolve());

  const publish = useCallback((next: AdminPreferences, persist = true) => {
    current.current = next;
    applySiteTheme(next.theme);
    setPrefs(next);
    if (persist) cachePreferences(next);
  }, []);

  useEffect(() => {
    publish(cachedPreferences(), false);
    const onStorage = (event: StorageEvent) => {
      if (
        event.key !== null &&
        event.key !== SITE_THEME_STORAGE_KEY &&
        event.key !== TIMEZONE_STORAGE_KEY
      )
        return;
      try {
        if (event.storageArea && event.storageArea !== localStorage) return;
      } catch {
        return;
      }
      if (event.key === null || event.key === SITE_THEME_STORAGE_KEY)
        ++revisions.current.theme;
      if (event.key === null || event.key === TIMEZONE_STORAGE_KEY)
        ++revisions.current.timezone;
      const next =
        event.key === null
          ? DEFAULTS
          : {
              ...current.current,
              ...(event.key === SITE_THEME_STORAGE_KEY
                ? { theme: normalizeSiteTheme(event.newValue) }
                : {
                    timezone: validTimezone(event.newValue)
                      ? event.newValue
                      : DEFAULTS.timezone,
                  }),
            };
      // The other tab already persisted this change. Do not echo it back.
      publish(next, false);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [publish]);

  useEffect(() => {
    let active = true;
    const versions = { ...revisions.current };
    setLoaded(false);
    if (!userId) {
      setLoaded(true);
      return;
    }
    (async () => {
      try {
        const { data, error } = await supabase
          .from("admin_preferences")
          .select("theme, timezone")
          .eq("user_id", userId)
          .maybeSingle();
        if (!active || error || !data) return;
        // A local or cross-tab theme choice must survive a late account read,
        // while an untouched timezone can still load from that same response.
        publish({
          theme:
            revisions.current.theme === versions.theme
              ? normalizeSiteTheme(data.theme)
              : current.current.theme,
          timezone:
            revisions.current.timezone === versions.timezone &&
            validTimezone(data.timezone)
              ? data.timezone
              : current.current.timezone,
        });
        // A missing row is created only by an explicit preference save.
      } catch {
        // Keep device preferences when the account settings are unavailable.
      } finally {
        if (active) setLoaded(true);
      }
    })();
    return () => {
      active = false;
    };
  }, [publish, userId]);

  const updatePref = useCallback(
    async (key: keyof AdminPreferences, value: string) => {
      if (key === "timezone" && !validTimezone(value)) {
        toast({ title: "Invalid timezone", variant: "destructive" });
        return;
      }
      if (key === "theme" && value !== "light" && value !== "dark") return;
      ++revisions.current[key];
      // Read the shared ref, not a component's render snapshot: an editor's
      // timezone save must retain a theme just changed in the admin sidebar.
      const next = { ...current.current, [key]: value } as AdminPreferences;
      publish(next);
      if (!userId) return;
      const changedField =
        key === "theme" ? { theme: next.theme } : { timezone: next.timezone };

      // Serialize changes to the same field on this page, and send only the
      // chosen field so another tab's timezone/theme cannot be overwritten.
      // The database supplies defaults when this creates a missing row.
      const save = saveQueue.current.then(async () => {
        try {
          const { error } = await supabase
            .from("admin_preferences")
            .upsert(
              { user_id: userId, ...changedField },
              { onConflict: "user_id" },
            );
          if (error) throw error;
        } catch {
          toast({
            title: "Preference saved on this device only",
            description:
              "Account settings could not be saved. Please try again.",
            variant: "destructive",
          });
        }
      });
      saveQueue.current = save;
      await save;
    },
    [publish, userId, toast],
  );

  return (
    <AdminPreferencesContext.Provider value={{ prefs, loaded, updatePref }}>
      {children}
    </AdminPreferencesContext.Provider>
  );
}
