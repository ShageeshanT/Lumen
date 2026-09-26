import { forwardRef, type ButtonHTMLAttributes } from "react";

import { Icon, type IconName } from "../icons/icon";
import { cn } from "../lib/cn";

import { buttonVariants } from "./button";
import type { KbdKey } from "./kbd";
import { Tooltip } from "./tooltip";

export interface IconButtonProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "children" | "aria-label"
> {
  icon: IconName;
  /** Required: becomes the tooltip text and the accessible name. */
  label: string;
  size?: "sm" | "md";
  variant?: "secondary" | "ghost" | "danger";
  shortcut?: KbdKey[];
  tooltipSide?: "top" | "right" | "bottom" | "left";
  /** Toggle buttons announce their state with aria-pressed. */
  pressed?: boolean;
}

/** An icon-only button. Always labelled, always with a tooltip (SPEC C5). */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  {
    icon,
    label,
    size = "md",
    variant = "ghost",
    shortcut,
    tooltipSide,
    pressed,
    className,
    type = "button",
    ...rest
  },
  ref,
) {
  return (
    <Tooltip
      content={label}
      {...(shortcut === undefined ? {} : { shortcut })}
      {...(tooltipSide === undefined ? {} : { side: tooltipSide })}
    >
      <button
        ref={ref}
        type={type}
        aria-label={label}
        aria-pressed={pressed}
        className={cn(
          buttonVariants({ variant, size }),
          "px-0",
          size === "sm" ? "w-[28px]" : "w-8",
          pressed === true && "bg-surface-hover text-text border-border-strong",
          className,
        )}
        {...rest}
      >
        <Icon name={icon} size={size === "sm" ? 14 : 16} />
      </button>
    </Tooltip>
  );
});
