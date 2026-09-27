"use client";

import { Fragment, useSyncExternalStore } from "react";

import { cn } from "../lib/cn";

/** A key name, or a symbolic key: mod (⌘ / Ctrl), shift, alt, enter, esc, then. */
export type KbdKey = string;

const SYMBOLS: Record<string, { mac: string; other: string; spoken: string }> = {
  mod: { mac: "⌘", other: "Ctrl", spoken: "Command" },
  shift: { mac: "⇧", other: "Shift", spoken: "Shift" },
  alt: { mac: "⌥", other: "Alt", spoken: "Option" },
  // ⏎ is missing from Geist Mono and falls back to a system font; the word reads everywhere.
  enter: { mac: "Enter", other: "Enter", spoken: "Enter" },
  esc: { mac: "Esc", other: "Esc", spoken: "Escape" },
};

function subscribe(): () => void {
  return () => undefined;
}

function isMacPlatform(): boolean {
  return /Mac|iPhone|iPad/.test(navigator.userAgent);
}

/** "mac" on Apple platforms. The server renders the macOS symbols, the common case for developers. */
export function usePlatform(): "mac" | "other" {
  return useSyncExternalStore(
    subscribe,
    () => (isMacPlatform() ? "mac" : "other"),
    () => "mac",
  );
}

export interface KbdProps {
  keys: KbdKey | KbdKey[];
  size?: "sm" | "md";
  className?: string;
  /** Override detection, for gallery screenshots. */
  platform?: "mac" | "other";
}

/**
 * Keyboard hint. Combinations render as adjacent keycaps (⌘ K); sequences use
 * the word "then" (G then P). Visually hidden text spells the keys out.
 */
export function Kbd({ keys, size = "md", className, platform }: KbdProps) {
  const detected = usePlatform();
  const os = platform ?? detected;
  const list = Array.isArray(keys) ? keys : [keys];
  const spoken = list
    .map((key) => SYMBOLS[key.toLowerCase()]?.spoken ?? key)
    .join(" ")
    .replace(/ then /g, ", then ");

  return (
    <span className={cn("inline-flex items-center gap-[2px]", className)}>
      {/* Screen readers read this sentence; the keycaps below are visual only. */}
      <span className="sr-only">{spoken}</span>
      {list.map((key, index) => {
        if (key === "then") {
          return (
            <span
              key={`then-${String(index)}`}
              aria-hidden="true"
              className="text-text-secondary text-11 mx-1"
            >
              then
            </span>
          );
        }
        const symbol = SYMBOLS[key.toLowerCase()];
        const shown = symbol === undefined ? key.toUpperCase() : symbol[os];
        return (
          <Fragment key={`${key}-${String(index)}`}>
            <kbd
              aria-hidden="true"
              className={cn(
                "text-kbd border-border bg-surface-raised border-b-border-strong inline-flex items-center justify-center border",
                "rounded-kbd",
                size === "sm" ? "h-4 min-w-4 px-1" : "h-[18px] min-w-[18px] px-[5px]",
              )}
            >
              {shown}
            </kbd>
          </Fragment>
        );
      })}
    </span>
  );
}
