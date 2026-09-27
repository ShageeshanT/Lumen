"use client";

import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import { useMediaQuery } from "../lib/use-media-query";

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

/** The last choice made in this tab, for when storage is blocked (private mode). */
let sessionChoice: ThemePreference | null = null;

function readPreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (isThemePreference(stored)) {
      return stored;
    }
  } catch {
    // Blocked storage: fall through to this tab's choice.
  }
  return sessionChoice ?? "system";
}

/** Other tabs (storage event) and same-tab writers (custom event). */
function subscribePreference(onChange: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === THEME_STORAGE_KEY) {
      onChange();
    }
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(THEME_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(THEME_EVENT, onChange);
  };
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
  // Storage and the OS preference are external stores: the server render uses
  // `initialTheme` (dark until hydrated), then the client values take over.
  const theme = useSyncExternalStore(subscribePreference, readPreference, () => initialTheme);
  const prefersDark = useMediaQuery(DARK_QUERY, true);

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
    sessionChoice = next;
    window.dispatchEvent(new Event(THEME_EVENT));
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, resolvedTheme, setTheme }),
    [theme, resolvedTheme, setTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
