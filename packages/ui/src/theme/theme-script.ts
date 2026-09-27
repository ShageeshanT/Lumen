export const THEME_STORAGE_KEY = "lumen.theme";

export type ThemePreference = "dark" | "light" | "system";
export type ResolvedTheme = "dark" | "light";

export const THEME_PREFERENCES: readonly ThemePreference[] = ["dark", "light", "system"];

/** Name of the same-tab event dispatched on `window` when the preference changes. */
export const THEME_EVENT = "lumen:theme";

/**
 * Inline script for `<head>`. Runs before first paint so the theme never
 * flashes: reads the stored preference (default "system"), resolves "system"
 * through the OS media query, and sets both `data-theme` and `color-scheme`
 * on `<html>`. It also restores the density preference (`lumen.density`) so
 * compact tables do not jump after hydration. Kept dependency-free and minified by hand; keep it in sync with
 * `resolveTheme` below.
 */
export const themeScript =
  '(function(){try{var k="lumen.theme",t=localStorage.getItem(k);' +
  'if(t!=="dark"&&t!=="light"&&t!=="system"){t="system"}' +
  'var r=t==="system"?(window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"):t;' +
  "var d=document.documentElement;d.dataset.theme=r;d.style.colorScheme=r;" +
  'if(localStorage.getItem("lumen.density")==="compact"){d.dataset.density="compact"}}' +
  'catch(e){document.documentElement.dataset.theme="dark"}})();';

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === "dark" || value === "light" || value === "system";
}

/** Resolves a preference to the theme actually shown. */
export function resolveTheme(
  preference: ThemePreference,
  systemPrefersDark: boolean,
): ResolvedTheme {
  if (preference === "system") {
    return systemPrefersDark ? "dark" : "light";
  }
  return preference;
}

/** Applies a resolved theme to the document root. */
export function applyTheme(
  theme: ResolvedTheme,
  root: HTMLElement = document.documentElement,
): void {
  root.dataset["theme"] = theme;
  root.style.colorScheme = theme;
}
