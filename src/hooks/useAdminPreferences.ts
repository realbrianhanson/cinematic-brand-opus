import { createContext, useContext } from "react";
import type { SiteTheme } from "@/lib/siteTheme";

export interface AdminPreferences {
  theme: SiteTheme;
  timezone: string;
}

interface AdminPreferencesValue {
  prefs: AdminPreferences;
  loaded: boolean;
  updatePref: (key: keyof AdminPreferences, value: string) => Promise<void>;
}

export const AdminPreferencesContext =
  createContext<AdminPreferencesValue | null>(null);

export function useAdminPreferences(): AdminPreferencesValue {
  const preferences = useContext(AdminPreferencesContext);
  if (!preferences)
    throw new Error("Admin preferences require AdminPreferencesProvider");
  return preferences;
}
