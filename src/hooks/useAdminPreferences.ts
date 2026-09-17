import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

interface AdminPreferences {
  theme: string;
  timezone: string;
}
const DEFAULTS: AdminPreferences = {
  theme: "dark",
  timezone: "America/New_York",
};
function cachedPreferences(): AdminPreferences {
  try {
    const timezone =
      localStorage.getItem("admin-timezone") || DEFAULTS.timezone;
    new Intl.DateTimeFormat("en", { timeZone: timezone });
    return {
      theme: localStorage.getItem("admin-theme") || DEFAULTS.theme,
      timezone,
    };
  } catch {
    return DEFAULTS;
  }
}
function cachePreferences(prefs: AdminPreferences) {
  try {
    localStorage.setItem("admin-theme", prefs.theme);
    localStorage.setItem("admin-timezone", prefs.timezone);
  } catch {
    /* Preferences still work when browser storage is unavailable. */
  }
}
export function useAdminPreferences() {
  const { user } = useAuth();
  const { toast } = useToast();
  // Identical server and first-client render; browser preferences load in the effect.
  const [prefs, setPrefs] = useState<AdminPreferences>(DEFAULTS);
  const [loaded, setLoaded] = useState(false);
  const revision = useRef(0);
  useEffect(() => {
    let active = true;
    const version = ++revision.current;
    setLoaded(false);
    const initial = cachedPreferences();
    setPrefs(initial);
    if (!user)
      return () => {
        active = false;
      };
    (async () => {
      try {
        const { data, error } = await supabase
          .from("admin_preferences")
          .select("theme, timezone")
          .eq("user_id", user.id)
          .maybeSingle();
        if (!active || revision.current !== version || error) return;
        if (data) {
          new Intl.DateTimeFormat("en", { timeZone: data.timezone });
          setPrefs(data);
          cachePreferences(data);
        }
        // A missing row is created by the first explicit preference save.
      } catch {
        /* Keep safe local defaults on unavailable or invalid remote settings. */
      } finally {
        if (active) setLoaded(true);
      }
    })();
    return () => {
      active = false;
    };
  }, [user?.id]);
  const updatePref = useCallback(
    async (key: keyof AdminPreferences, value: string) => {
      if (key === "timezone") {
        try {
          new Intl.DateTimeFormat("en", { timeZone: value });
        } catch {
          toast({ title: "Invalid timezone", variant: "destructive" });
          return;
        }
      }
      ++revision.current;
      const next = { ...prefs, [key]: value };
      setPrefs(next);
      cachePreferences(next);
      if (user) {
        const { error } = await supabase
          .from("admin_preferences")
          .upsert({ user_id: user.id, ...next }, { onConflict: "user_id" });
        if (error)
          toast({
            title: "Preference saved on this device only",
            description:
              "Account settings could not be saved. Please try again.",
            variant: "destructive",
          });
      }
    },
    [prefs, user, toast],
  );
  return { prefs, loaded, updatePref };
}
