"use client";

import * as RadixTooltip from "@radix-ui/react-tooltip";
import { useState, type ReactElement, type ReactNode } from "react";

import { cn } from "../lib/cn";

import { Kbd, type KbdKey } from "./kbd";

export interface TooltipProviderProps {
  children: ReactNode;
}

/** Mount once near the root. 400 ms to open, 200 ms to move between triggers (SPEC C5). */
export function TooltipProvider({ children }: TooltipProviderProps) {
  return (
    <RadixTooltip.Provider delayDuration={400} skipDelayDuration={200}>
      {children}
    </RadixTooltip.Provider>
  );
}

export interface TooltipProps {
  /** One short sentence, no trailing period. Never interactive content. */
  content: string;
  /** Shortcut shown after the text, such as ["mod", "K"] or ["G", "then", "P"]. */
  shortcut?: KbdKey[];
  side?: "top" | "right" | "bottom" | "left";
  /** The trigger. It must be focusable; wrap disabled buttons in a span. */
  children: ReactElement;
  /** Force open, for gallery screenshots. */
  open?: boolean;
  /**
   * Never show, without changing the element tree (so a focused trigger keeps
   * focus). The expanded rail uses it when its labels are already visible.
   */
  disabled?: boolean;
}

/**
 * Tooltip: sentence-case sans on a raised panel with a hairline frame. Shows
 * on hover and on keyboard focus; hides on blur and Escape.
 */
export function Tooltip({
  content,
  shortcut,
  side = "top",
  children,
  open,
  disabled = false,
}: TooltipProps) {
  // Always controlled, so `disabled` can flip without Radix switching modes.
  const [openState, setOpen] = useState(false);
  const shown = open ?? (disabled ? false : openState);
  return (
    <RadixTooltip.Root open={shown} onOpenChange={setOpen}>
      <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
      <RadixTooltip.Portal>
        <RadixTooltip.Content
          side={side}
          sideOffset={6}
          collisionPadding={8}
          className={cn(
            "border-border-strong bg-surface-raised text-text z-[var(--z-popover)] flex max-w-[240px] items-center gap-2 border px-2 py-1",
            "rounded-control text-12 shadow-raised leading-[1.4]",
            "origin-(--radix-tooltip-content-transform-origin) data-[state=delayed-open]:animate-[lumen-tooltip-in_var(--dur-fast)_var(--ease-out)]",
          )}
        >
          <span>{content}</span>
          {shortcut !== undefined && <Kbd keys={shortcut} size="sm" />}
        </RadixTooltip.Content>
      </RadixTooltip.Portal>
    </RadixTooltip.Root>
  );
}
