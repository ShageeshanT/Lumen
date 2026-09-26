"use client";

import { createContext, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

import {
  applyTheme,
  isThemePreference,
  resolveTheme,
  THEME_EVENT,
  THEME_STORAGE_KEY,
  type ResolvedTheme,
  type ThemePreference,
} from "./theme-script";

export interface ThemeContextValue {
  /** The stored preference: "dark", "light" or "system". */
  theme: ThemePreference;
  /** What is actually on screen. */
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: ThemePreference) => void;
}

export const ThemeContext = createContext<ThemeContextValue | null>(null);

const DARK_QUERY = "(prefers-color-scheme: dark)";

function readStoredPreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return isThemePreference(stored) ? stored : "system";
  } catch {
    return "system";
  }
}

function systemPrefersDark(): boolean {
  return window.matchMedia(DARK_QUERY).matches;
}

export interface ThemeProviderProps {
  children: ReactNode;
  /** Used for the first render on the server and before hydration. */
  initialTheme?: ThemePreference;
}

/**
 * Holds the theme preference, applies it to `<html>`, follows the OS while
 * on "system", persists to localStorage and keeps other tabs in sync.
 */
export function ThemeProvider({ children, initialTheme = "system" }: ThemeProviderProps) {
  const [theme, setThemeState] = useState<ThemePreference>(initialTheme);
  const [prefersDark, setPrefersDark] = useState<boolean>(true);

  // Hydrate from storage and the media query once on the client.
  useEffect(() => {
    setThemeState(readStoredPreference());
    setPrefersDark(systemPrefersDark());
  }, []);

  // Follow the OS while on "system".
  useEffect(() => {
    const query = window.matchMedia(DARK_QUERY);
    const onChange = (event: MediaQueryListEvent) => {
      setPrefersDark(event.matches);
    };
    query.addEventListener("change", onChange);
    return () => {
      query.removeEventListener("change", onChange);
    };
  }, []);

  // Other tabs (storage event) and same-tab writers (custom event).
  useEffect(() => {
    const sync = () => {
      setThemeState(readStoredPreference());
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === THEME_STORAGE_KEY) {
        sync();
      }
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener(THEME_EVENT, sync);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(THEME_EVENT, sync);
    };
  }, []);

  const resolvedTheme = resolveTheme(theme, prefersDark);

  useEffect(() => {
    applyTheme(resolvedTheme);
  }, [resolvedTheme]);

  const setTheme = useCallback((next: ThemePreference) => {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Private mode or blocked storage: the choice still applies for this session.
    }
    setThemeState(next);
    window.dispatchEvent(new Event(THEME_EVENT));
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, resolvedTheme, setTheme }),
    [theme, resolvedTheme, setTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
