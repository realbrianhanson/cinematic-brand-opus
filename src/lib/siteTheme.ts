export type SiteTheme = "dark" | "light";

export const SITE_THEME_STORAGE_KEY = "admin-theme";

export function normalizeSiteTheme(value: unknown): SiteTheme {
  return value === "light" ? "light" : "dark";
}

export function applySiteTheme(theme: SiteTheme) {
  document.documentElement.setAttribute("data-site-theme", theme);
}

// Run in the document head before CSS and page content paint. Keep the existing
// dark default and class list intact; the saved preference changes only colors.
export const SITE_THEME_BOOTSTRAP = `(function(){var theme="dark";try{if(localStorage.getItem("${SITE_THEME_STORAGE_KEY}")==="light")theme="light"}catch(e){}document.documentElement.setAttribute("data-site-theme",theme)})();`;
