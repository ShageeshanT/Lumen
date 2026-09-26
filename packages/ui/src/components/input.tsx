"use client";

import { forwardRef, type InputHTMLAttributes, type ReactNode } from "react";

import { Icon, type IconName } from "../icons/icon";
import { cn } from "../lib/cn";

import { controlClasses, controlFrameClasses } from "./control-styles";
import { useFieldProps } from "./field";

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "size"> {
  size?: "sm" | "md";
  invalid?: boolean;
  /** Identifiers, URLs, paths and values render in Geist Mono. */
  monospace?: boolean;
  leadingIcon?: IconName;
  /** Buttons or a unit suffix inside the right edge (copy, reveal, "MB"). */
  trailingSlot?: ReactNode;
}

/**
 * Text input. Inside a Field it picks up its id, description and invalid
 * state. Escape clears a search input.
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  {
    size = "md",
    invalid,
    monospace = false,
    leadingIcon,
    trailingSlot,
    className,
    id,
    disabled,
    required,
    type = "text",
    onKeyDown,
    "aria-describedby": ariaDescribedBy,
    ...rest
  },
  ref,
) {
  const field = useFieldProps({
    id,
    invalid,
    disabled,
    required,
    "aria-describedby": ariaDescribedBy,
  });
  return (
    <div className={controlFrameClasses}>
      {leadingIcon !== undefined && (
        <span className="text-text-secondary pointer-events-none absolute left-[10px] inline-flex">
          <Icon name={leadingIcon} size={size === "sm" ? 14 : 16} />
        </span>
      )}
      <input
        ref={ref}
        id={field.id}
        type={type}
        disabled={field.disabled}
        required={field.required}
        aria-invalid={field.invalid || undefined}
        aria-describedby={field.describedBy}
        onKeyDown={(event) => {
          if (type === "search" && event.key === "Escape" && event.currentTarget.value !== "") {
            // Go through the native setter so React sees the change and fires onChange.
            Reflect.set(HTMLInputElement.prototype, "value", "", event.currentTarget);
            event.currentTarget.dispatchEvent(new Event("input", { bubbles: true }));
          }
          onKeyDown?.(event);
        }}
        className={controlClasses({
          size,
          invalid: field.invalid,
          monospace,
          className: cn(
            leadingIcon !== undefined && (size === "sm" ? "pl-[30px]" : "pl-8"),
            trailingSlot !== undefined && "pr-[76px]",
            className,
          ),
        })}
        {...rest}
      />
      {trailingSlot !== undefined && (
        <span className="absolute right-[2px] flex items-center gap-[2px]">{trailingSlot}</span>
      )}
    </div>
  );
});
