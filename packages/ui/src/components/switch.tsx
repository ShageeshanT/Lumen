"use client";

import * as RadixSwitch from "@radix-ui/react-switch";
import { useId, type ReactNode } from "react";

import { cn } from "../lib/cn";

export interface SwitchProps {
  checked?: boolean;
  defaultChecked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  /** Rendered beside the switch and clickable. */
  label: ReactNode;
  description?: ReactNode;
  size?: "sm" | "md";
  disabled?: boolean;
  id?: string;
  className?: string;
  /** Forced state for gallery screenshots. */
  "data-force"?: string;
}

/**
 * A hardware toggle: square track, square thumb that slides in 120 ms.
 * On is the accent fill; off is a dim track. Space toggles.
 */
export function Switch({
  checked,
  defaultChecked,
  onCheckedChange,
  label,
  description,
  size = "md",
  disabled = false,
  id,
  className,
  "data-force": force,
}: SwitchProps) {
  const autoId = useId();
  const switchId = id ?? `switch-${autoId}`;
  const descriptionId = `${switchId}-description`;
  return (
    <div className={cn("flex items-start gap-3", disabled && "opacity-50", className)}>
      <RadixSwitch.Root
        id={switchId}
        disabled={disabled}
        data-force={force}
        aria-describedby={description === undefined ? undefined : descriptionId}
        {...(checked === undefined ? {} : { checked })}
        {...(defaultChecked === undefined ? {} : { defaultChecked })}
        {...(onCheckedChange === undefined ? {} : { onCheckedChange })}
        className={cn(
          "group/switch rounded-control relative mt-[2px] inline-flex shrink-0 cursor-pointer items-center border",
          "transition-[background-color,border-color] duration-[var(--dur-fast)] ease-[var(--ease-out)]",
          size === "sm" ? "h-[14px] w-[26px]" : "h-[18px] w-8",
          "border-border-strong bg-surface-hover data-[state=checked]:border-accent-fill data-[state=checked]:bg-accent-fill",
          "disabled:cursor-not-allowed",
        )}
      >
        <RadixSwitch.Thumb
          className={cn(
            "shadow-card block rounded-[1px] transition-transform duration-[var(--dur-fast)] ease-[var(--ease-out)]",
            "bg-text-secondary data-[state=checked]:bg-accent-ink",
            size === "sm"
              ? "size-[10px] translate-x-[1px] data-[state=checked]:translate-x-[13px]"
              : "size-[14px] translate-x-[1px] data-[state=checked]:translate-x-[15px]",
          )}
        />
      </RadixSwitch.Root>
      <div className="flex flex-col">
        <label htmlFor={switchId} className={cn("text-body", !disabled && "cursor-pointer")}>
          {label}
        </label>
        {description !== undefined && (
          <p id={descriptionId} className="text-body-secondary">
            {description}
          </p>
        )}
      </div>
    </div>
  );
}
