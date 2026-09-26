"use client";

import * as RadixSelect from "@radix-ui/react-select";

import { Icon, type IconName } from "../icons/icon";
import { cn } from "../lib/cn";

import { controlClasses, controlFrameClasses } from "./control-styles";
import { useFieldProps } from "./field";

export interface SelectOption {
  value: string;
  label: string;
  description?: string;
  icon?: IconName;
  disabled?: boolean;
}

export interface SelectProps {
  options: SelectOption[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  placeholder?: string;
  size?: "sm" | "md";
  invalid?: boolean;
  disabled?: boolean;
  required?: boolean;
  id?: string;
  "aria-label"?: string;
  /** Force the list open, for gallery screenshots. */
  open?: boolean;
  className?: string;
}

/**
 * A single choice from a short list. The trigger looks like an input; the list
 * is a raised panel with a check on the selected row. Radix provides the
 * combobox + listbox pattern, typeahead and Escape.
 */
export function Select({
  options,
  value,
  defaultValue,
  onValueChange,
  placeholder = "Choose…",
  size = "md",
  invalid,
  disabled,
  required,
  id,
  open,
  className,
  "aria-label": ariaLabel,
}: SelectProps) {
  const field = useFieldProps({ id, invalid, disabled, required });
  const rootProps = {
    ...(value === undefined ? {} : { value }),
    ...(defaultValue === undefined ? {} : { defaultValue }),
    ...(onValueChange === undefined ? {} : { onValueChange }),
    ...(open === undefined ? {} : { open }),
    disabled: field.disabled,
    required: field.required,
  };
  const selected = options.find((option) => option.value === (value ?? defaultValue));

  return (
    <RadixSelect.Root {...rootProps}>
      <div className={cn(controlFrameClasses, className)}>
        <RadixSelect.Trigger
          id={field.id}
          aria-label={ariaLabel}
          aria-invalid={field.invalid || undefined}
          aria-describedby={field.describedBy}
          className={controlClasses({
            size,
            invalid: field.invalid,
            className:
              "data-[placeholder]:text-text-secondary flex items-center gap-2 pr-8 text-left",
          })}
        >
          {selected?.icon !== undefined && (
            <Icon name={selected.icon} size={16} className="text-text-secondary" />
          )}
          <span className="min-w-0 flex-1 truncate">
            <RadixSelect.Value placeholder={placeholder} />
          </span>
          <RadixSelect.Icon className="text-text-secondary absolute right-[10px] inline-flex">
            <Icon name="chevron-down" size={16} />
          </RadixSelect.Icon>
        </RadixSelect.Trigger>
      </div>
      <RadixSelect.Portal>
        <RadixSelect.Content
          position="popper"
          sideOffset={4}
          collisionPadding={8}
          className={cn(
            "border-border-strong bg-surface-raised shadow-raised rounded-card z-[var(--z-popover)] overflow-hidden border",
            "max-h-[min(320px,var(--radix-select-content-available-height))] min-w-[var(--radix-select-trigger-width)]",
            "origin-(--radix-select-content-transform-origin) data-[state=open]:animate-[lumen-tooltip-in_var(--dur-fast)_var(--ease-out)]",
          )}
        >
          <RadixSelect.ScrollUpButton className="text-text-secondary flex h-6 items-center justify-center">
            <Icon name="chevron-down" size={14} className="rotate-180" />
          </RadixSelect.ScrollUpButton>
          <RadixSelect.Viewport className="p-1">
            {options.map((option) => (
              <RadixSelect.Item
                key={option.value}
                value={option.value}
                disabled={option.disabled === true}
                className={cn(
                  "text-text rounded-control relative flex cursor-default items-center gap-2 py-[6px] pr-8 pl-2 outline-none select-none",
                  option.description === undefined ? "min-h-8" : "min-h-12",
                  "data-[highlighted]:bg-surface-hover data-[disabled]:opacity-50",
                )}
              >
                {option.icon !== undefined && (
                  <Icon name={option.icon} size={16} className="text-text-secondary shrink-0" />
                )}
                <span className="flex min-w-0 flex-col">
                  <RadixSelect.ItemText>
                    <span className="text-14">{option.label}</span>
                  </RadixSelect.ItemText>
                  {option.description !== undefined && (
                    <span className="text-meta">{option.description}</span>
                  )}
                </span>
                <RadixSelect.ItemIndicator className="text-accent absolute right-2 inline-flex">
                  <Icon name="check" size={16} />
                </RadixSelect.ItemIndicator>
              </RadixSelect.Item>
            ))}
          </RadixSelect.Viewport>
          <RadixSelect.ScrollDownButton className="text-text-secondary flex h-6 items-center justify-center">
            <Icon name="chevron-down" size={14} />
          </RadixSelect.ScrollDownButton>
        </RadixSelect.Content>
      </RadixSelect.Portal>
    </RadixSelect.Root>
  );
}
