"use client";

import { Button, type IconName } from "@lumen/ui";
import { useTheme, type ThemePreference } from "@lumen/ui/theme";

const ORDER: readonly ThemePreference[] = ["system", "dark", "light"];
const LABELS: Record<ThemePreference, string> = {
  system: "System",
  dark: "Dark",
  light: "Light",
};
const ICON: Record<ThemePreference, IconName> = {
  system: "monitor",
  dark: "moon",
  light: "sun",
};

/** Cycles system → dark → light. */
export function ThemeToggle() {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const next = ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length] ?? "system";
  return (
    <Button
      size="sm"
      leadingIcon={ICON[theme]}
      onClick={() => {
        setTheme(next);
      }}
      aria-label={`Theme: ${LABELS[theme]} (${resolvedTheme}). Switch to ${LABELS[next]}`}
    >
      {LABELS[theme]}
    </Button>
  );
}
