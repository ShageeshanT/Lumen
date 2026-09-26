"use client";

import * as RadixRadio from "@radix-ui/react-radio-group";
import { useId, type ReactNode } from "react";

import { Icon, type IconName } from "../icons/icon";
import { cn } from "../lib/cn";

export interface RadioOption {
  value: string;
  label: string;
  description?: ReactNode;
  icon?: IconName;
  disabled?: boolean;
}

export interface RadioGroupProps {
  options: RadioOption[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  orientation?: "vertical" | "horizontal";
  /** Cards for big choices (domain setup, copy or start empty). */
  variant?: "list" | "cards";
  /** Accessible name for the group when there is no visible legend. */
  "aria-label"?: string;
  disabled?: boolean;
  className?: string;
}

/**
 * One choice from a few. Arrow keys move and select (roving focus). The card
 * variant frames the selected card in the accent with HUD brackets.
 */
export function RadioGroup({
  options,
  value,
  defaultValue,
  onValueChange,
  orientation = "vertical",
  variant = "list",
  disabled = false,
  className,
  "aria-label": ariaLabel,
}: RadioGroupProps) {
  const groupId = useId();
  return (
    <RadixRadio.Root
      aria-label={ariaLabel}
      orientation={orientation}
      disabled={disabled}
      {...(value === undefined ? {} : { value })}
      {...(defaultValue === undefined ? {} : { defaultValue })}
      {...(onValueChange === undefined ? {} : { onValueChange })}
      className={cn(
        "flex gap-3",
        orientation === "vertical" ? "flex-col" : "flex-row flex-wrap",
        variant === "cards" && orientation === "horizontal" && "grid grid-cols-1 sm:grid-cols-2",
        className,
      )}
    >
      {options.map((option) => {
        const itemId = `${groupId}-${option.value}`;
        const descriptionId = `${itemId}-description`;
        if (variant === "cards") {
          return (
            <RadixRadio.Item
              key={option.value}
              id={itemId}
              value={option.value}
              disabled={option.disabled === true}
              aria-describedby={option.description === undefined ? undefined : descriptionId}
              className={cn(
                "hud group/card bg-surface border-border rounded-card relative flex items-start gap-3 border p-4 text-left",
                "[--hud-color:transparent] [--hud-offset:3px] [--hud-size:8px]",
                "transition-[border-color,background-color] duration-[var(--dur-fast)] ease-[var(--ease-out)]",
                "is-hover:border-border-strong",
                "data-[state=checked]:border-accent data-[state=checked]:bg-accent-subtle data-[state=checked]:[--hud-color:var(--color-accent)]",
                "disabled:cursor-not-allowed disabled:opacity-50",
              )}
            >
              {option.icon !== undefined && (
                <Icon
                  name={option.icon}
                  size={20}
                  className="text-text-secondary mt-[2px] shrink-0"
                />
              )}
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="text-label">{option.label}</span>
                {option.description !== undefined && (
                  <span id={descriptionId} className="text-body-secondary">
                    {option.description}
                  </span>
                )}
              </span>
              <RadixRadio.Indicator className="text-accent inline-flex shrink-0">
                <Icon name="check" size={16} />
              </RadixRadio.Indicator>
            </RadixRadio.Item>
          );
        }
        return (
          <div key={option.value} className="flex items-start gap-3">
            <RadixRadio.Item
              id={itemId}
              value={option.value}
              disabled={option.disabled === true}
              aria-describedby={option.description === undefined ? undefined : descriptionId}
              className={cn(
                "mt-[2px] inline-flex size-4 shrink-0 items-center justify-center rounded-full border",
                "border-border-strong bg-surface is-hover:border-text-secondary",
                "data-[state=checked]:border-accent-fill disabled:cursor-not-allowed disabled:opacity-50",
              )}
            >
              <RadixRadio.Indicator className="bg-accent-fill block size-[6px] rounded-full" />
            </RadixRadio.Item>
            <div className={cn("flex flex-col", option.disabled === true && "opacity-50")}>
              <label htmlFor={itemId} className="text-body cursor-pointer">
                {option.label}
              </label>
              {option.description !== undefined && (
                <p id={descriptionId} className="text-body-secondary">
                  {option.description}
                </p>
              )}
            </div>
          </div>
        );
      })}
    </RadixRadio.Root>
  );
}
