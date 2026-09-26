"use client";

import { useContext } from "react";

import { ThemeContext, type ThemeContextValue } from "./theme-provider";

/** Reads and changes the theme. Must be used inside `<ThemeProvider>`. */
export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (value === null) {
    throw new Error("useTheme must be used inside <ThemeProvider>");
  }
  return value;
}
