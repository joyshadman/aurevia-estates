// Theme constants shared by the inline script, the toggle, and the account sync
// (spec 0003). Browser values are lowercase; database values are the enum.

export const THEME_STORAGE_KEY = "aurevia-theme";
export const THEME_PENDING_KEY = "aurevia-theme-pending";
export const THEME_EVENT = "aurevia-theme";

export const themePreferences = ["light", "dark", "system"] as const;
export type ThemePreference = (typeof themePreferences)[number];
export type DbThemePreference = "LIGHT" | "DARK" | "SYSTEM";

export function isThemePreference(value: unknown): value is ThemePreference {
  return typeof value === "string" && (themePreferences as readonly string[]).includes(value);
}

export function toDbTheme(value: ThemePreference): DbThemePreference {
  return value.toUpperCase() as DbThemePreference;
}

export function fromDbTheme(value: DbThemePreference): ThemePreference {
  return value.toLowerCase() as ThemePreference;
}

// No stored choice means light (spec 0024, assumed; overrides spec 0003, AC-3).
export const DEFAULT_THEME: ThemePreference = "light";

// Runs in <head> before first paint, so the page never flashes the wrong theme.
// It also follows live device changes from the start, before React hydrates.
// Plain ES5, wrapped in try/catch: storage can throw in private modes.
export const themeInitScript = `(function(){try{var k=${JSON.stringify(
  THEME_STORAGE_KEY,
)},m=window.matchMedia("(prefers-color-scheme: dark)");var pref=function(){try{var v=localStorage.getItem(k);if(v==="light"||v==="dark"||v==="system")return v}catch(e){}return ${JSON.stringify(DEFAULT_THEME)}};var apply=function(){var p=pref(),d=p==="dark"||(p==="system"&&m.matches),r=document.documentElement;r.setAttribute("data-theme",d?"dark":"light");r.setAttribute("data-theme-pref",p);r.style.colorScheme=d?"dark":"light"};apply();if(m.addEventListener)m.addEventListener("change",apply)}catch(e){}})();`;
