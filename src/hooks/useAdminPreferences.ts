import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

interface AdminPreferences {
  theme: string;
  timezone: string;
}

const DEFAULTS: AdminPreferences = { theme: "dark", timezone: "America/New_York" };

export function useAdminPreferences() {
  const { user } = useAuth();
  const [prefs, setPrefs] = useState<AdminPreferences>(() => {
    // Bootstrap from localStorage for instant render, then sync from DB
    return {
      theme: localStorage.getItem("admin-theme") || DEFAULTS.theme,
      timezone: localStorage.getItem("admin-timezone") || DEFAULTS.timezone,
    };
  });
  const [loaded, setLoaded] = useState(false);

  // Load from DB on mount
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from("admin_preferences")
        .select("theme, timezone")
        .eq("user_id", user.id)
        .maybeSingle();
      if (data) {
        setPrefs({ theme: data.theme, timezone: data.timezone });
        localStorage.setItem("admin-theme", data.theme);
        localStorage.setItem("admin-timezone", data.timezone);
      } else {
        // First login — seed DB from localStorage defaults
        const initial = {
          user_id: user.id,
          theme: localStorage.getItem("admin-theme") || DEFAULTS.theme,
          timezone: localStorage.getItem("admin-timezone") || DEFAULTS.timezone,
        };
        await supabase.from("admin_preferences").insert(initial);
        setPrefs({ theme: initial.theme, timezone: initial.timezone });
      }
      setLoaded(true);
    })();
  }, [user]);

  const updatePref = useCallback(
    async (key: keyof AdminPreferences, value: string) => {
      setPrefs((p) => ({ ...p, [key]: value }));
      localStorage.setItem(key === "theme" ? "admin-theme" : "admin-timezone", value);
      if (user) {
        await supabase
          .from("admin_preferences")
          .update({ [key]: value })
          .eq("user_id", user.id);
      }
    },
    [user]
  );

  return { prefs, loaded, updatePref };
}
