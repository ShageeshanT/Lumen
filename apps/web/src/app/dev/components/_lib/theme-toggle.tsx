"use client";

import { useTheme, type ThemePreference } from "@lumen/ui/theme";

const ORDER: readonly ThemePreference[] = ["system", "dark", "light"];
const LABELS: Record<ThemePreference, string> = {
  system: "System",
  dark: "Dark",
  light: "Light",
};

/** Cycles system → dark → light. Styled with utilities only until Button lands. */
export function ThemeToggle() {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const next = ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length] ?? "system";
  return (
    <button
      type="button"
      onClick={() => {
        setTheme(next);
      }}
      aria-label={`Theme: ${LABELS[theme]} (${resolvedTheme}). Switch to ${LABELS[next]}`}
      className="text-label hover:bg-surface-hover hover:border-border-strong border-border bg-surface rounded-control inline-flex h-8 items-center gap-2 border px-3"
    >
      <span className="text-text-secondary">Theme</span>
      <span>{LABELS[theme]}</span>
    </button>
  );
}
