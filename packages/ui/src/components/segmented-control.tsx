"use client";

import * as ToggleGroup from "@radix-ui/react-toggle-group";
import { useLayoutEffect, useRef, useState } from "react";

import { Icon, type IconName } from "../icons/icon";
import { cn } from "../lib/cn";

export interface SegmentedItem {
  value: string;
  label: string;
  icon?: IconName;
  disabled?: boolean;
}

export interface SegmentedControlProps {
  items: SegmentedItem[];
  value: string;
  onValueChange: (value: string) => void;
  size?: "sm" | "md";
  fullWidth?: boolean;
  "aria-label": string;
  className?: string;
}

/**
 * A row of mutually exclusive modes (1h · 6h · 24h · 7d · 30d; Runtime ·
 * HTTP · Build). The selected segment is a raised block that slides between
 * segments in 200 ms; an accent line marks it. Arrow keys move and select.
 */
export function SegmentedControl({
  items,
  value,
  onValueChange,
  size = "md",
  fullWidth = false,
  className,
  "aria-label": ariaLabel,
}: SegmentedControlProps) {
  const root = useRef<HTMLDivElement>(null);
  const [indicator, setIndicator] = useState<{ left: number; width: number } | null>(null);

  useLayoutEffect(() => {
    const el = root.current?.querySelector<HTMLElement>(`[data-value="${CSS.escape(value)}"]`);
    if (el !== null && el !== undefined) {
      setIndicator({ left: el.offsetLeft, width: el.offsetWidth });
    }
  }, [value, items, size, fullWidth]);

  return (
    <ToggleGroup.Root
      ref={root}
      type="single"
      value={value}
      onValueChange={(next) => {
        // Radix allows deselecting; a segmented control always has a value.
        if (next !== "") {
          onValueChange(next);
        }
      }}
      aria-label={ariaLabel}
      className={cn(
        "border-border bg-surface rounded-control relative inline-flex items-stretch border p-[2px]",
        size === "sm" ? "h-[28px]" : "h-8",
        fullWidth && "flex w-full",
        className,
      )}
    >
      {indicator !== null && (
        <span
          aria-hidden="true"
          className="bg-surface-raised border-border-strong shadow-card absolute top-[2px] bottom-[2px] rounded-[1px] border transition-[left,width] duration-[var(--dur-base)] ease-[var(--ease-panel)]"
          style={{ left: indicator.left, width: indicator.width }}
        >
          <span className="bg-accent absolute right-0 bottom-[-1px] left-0 h-px" />
        </span>
      )}
      {items.map((item) => (
        <ToggleGroup.Item
          key={item.value}
          value={item.value}
          data-value={item.value}
          disabled={item.disabled === true}
          className={cn(
            "text-action relative z-[1] inline-flex items-center justify-center gap-[6px] rounded-[1px] px-[10px]",
            "text-text-secondary is-hover:text-text data-[state=on]:text-text",
            "transition-colors duration-[var(--dur-fast)] ease-[var(--ease-out)]",
            "focus-visible:outline-offset-[-2px] disabled:cursor-not-allowed disabled:opacity-50",
            fullWidth && "flex-1",
          )}
        >
          {item.icon !== undefined && <Icon name={item.icon} size={14} />}
          {item.label}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  );
}
