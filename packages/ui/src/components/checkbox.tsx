"use client";

import * as RadixCheckbox from "@radix-ui/react-checkbox";
import { useId, type ReactNode } from "react";

import { Icon } from "../icons/icon";
import { cn } from "../lib/cn";

export interface CheckboxProps {
  checked?: boolean | "indeterminate";
  defaultChecked?: boolean;
  onCheckedChange?: (checked: boolean | "indeterminate") => void;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
  invalid?: boolean;
  id?: string;
  className?: string;
  "data-force"?: string;
}

/** A 16 px square box. Checked fills with the accent; indeterminate shows a bar. */
export function Checkbox({
  checked,
  defaultChecked,
  onCheckedChange,
  label,
  description,
  disabled = false,
  invalid = false,
  id,
  className,
  "data-force": force,
}: CheckboxProps) {
  const autoId = useId();
  const boxId = id ?? `checkbox-${autoId}`;
  const descriptionId = `${boxId}-description`;
  return (
    <div className={cn("flex items-start gap-3", disabled && "opacity-50", className)}>
      <RadixCheckbox.Root
        id={boxId}
        disabled={disabled}
        data-force={force}
        aria-invalid={invalid || undefined}
        aria-describedby={description === undefined ? undefined : descriptionId}
        {...(checked === undefined ? {} : { checked })}
        {...(defaultChecked === undefined ? {} : { defaultChecked })}
        {...(onCheckedChange === undefined ? {} : { onCheckedChange })}
        className={cn(
          "rounded-kbd mt-[2px] inline-flex size-4 shrink-0 items-center justify-center border",
          "transition-[background-color,border-color] duration-[var(--dur-fast)] ease-[var(--ease-out)]",
          invalid ? "border-danger" : "border-border-strong is-hover:border-text-secondary",
          "bg-surface data-[state=checked]:border-accent-fill data-[state=checked]:bg-accent-fill",
          "data-[state=indeterminate]:border-accent-fill data-[state=indeterminate]:bg-accent-fill",
          "text-accent-ink disabled:cursor-not-allowed",
        )}
      >
        <RadixCheckbox.Indicator className="inline-flex">
          {checked === "indeterminate" ? (
            <span className="bg-accent-ink block h-[2px] w-2" />
          ) : (
            <Icon name="check" size={12} />
          )}
        </RadixCheckbox.Indicator>
      </RadixCheckbox.Root>
      <div className="flex flex-col">
        <label htmlFor={boxId} className={cn("text-body", !disabled && "cursor-pointer")}>
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
