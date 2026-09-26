import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

import { TEXT_VARIANTS } from "../styles/text-styles";

/** Color names defined in tokens/colors.css and mapped in the app's @theme block. */
export const COLOR_NAMES = [
  "bg",
  "bg-canvas",
  "canvas-dot",
  "grid",
  "grid-major",
  "surface",
  "surface-raised",
  "surface-hover",
  "border",
  "border-strong",
  "text",
  "text-secondary",
  "text-muted",
  "accent",
  "accent-hover",
  "accent-subtle",
  "accent-text",
  "accent-fill",
  "accent-fill-hover",
  "accent-ink",
  "glow-a",
  "glow-b",
  "vignette",
  "success",
  "success-text",
  "success-subtle",
  "warning",
  "warning-text",
  "warning-subtle",
  "danger",
  "danger-text",
  "danger-subtle",
  "danger-fill",
  "danger-fill-hover",
  "danger-ink",
  "info",
  "info-text",
  "info-subtle",
  "sleeping",
  "sleeping-text",
  "sleeping-subtle",
  "overlay",
  "terminal-bg",
  "transparent",
  "current",
  "inherit",
] as const;

/**
 * tailwind-merge taught Lumen's theme: without it, `text-action` (a text style)
 * and `text-success-text` (a color) look like two colors and one is dropped.
 */
const merge = extendTailwindMerge<"text-style">({
  override: {
    theme: {
      color: [...COLOR_NAMES],
      text: ["11", "12", "13", "14", "16", "20", "24", "32"],
      radius: ["kbd", "control", "card", "panel", "full"],
      font: ["display", "sans", "mono"],
      tracking: ["normal", "display", "caps"],
      leading: ["none", "display", "tight", "normal", "log"],
    },
  },
  extend: {
    classGroups: {
      "text-style": [{ text: [...TEXT_VARIANTS] }],
    },
  },
});

/** Joins class names and resolves conflicting Tailwind utilities (last one wins). */
export function cn(...inputs: ClassValue[]): string {
  return merge(clsx(inputs));
}
