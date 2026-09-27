import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

import { Icon, type IconName } from "../icons/icon";
import { cn } from "../lib/cn";

import { Spinner } from "./spinner";

/**
 * Signal buttons: uppercase mono labels in thin frames.
 *   primary   full-ink frame with HUD brackets that spread on hover, accent glow
 *   secondary hairline frame
 *   ghost     no frame until hover
 *   danger    danger frame and text; `danger-solid` fills, for confirm dialogs only
 * There is one primary per view (SPEC C14).
 */
export const buttonVariants = cva(
  [
    "text-action relative inline-flex shrink-0 items-center justify-center gap-2 border whitespace-nowrap select-none",
    "rounded-control transition-[background-color,border-color,color,box-shadow] duration-[var(--dur-fast)] ease-[var(--ease-out)]",
    "disabled:cursor-not-allowed disabled:opacity-50",
    "is-active:translate-y-px",
  ],
  {
    variants: {
      variant: {
        primary: [
          "hud border-text text-text bg-primary-bg",
          "[--hud-color:var(--color-text)] [--hud-size:6px] [--hud-offset:3px]",
          "enabled:is-hover:bg-accent-subtle enabled:is-hover:shadow-[0_0_0_1px_var(--color-text),var(--shadow-glow)]",
          "enabled:is-hover:[--hud-offset:5px]",
        ],
        secondary: [
          "border-border bg-transparent text-text",
          "enabled:is-hover:border-border-strong enabled:is-hover:bg-surface-hover",
        ],
        ghost: [
          "border-transparent bg-transparent text-text-secondary",
          "enabled:is-hover:bg-surface-hover enabled:is-hover:text-text",
        ],
        danger: [
          "border-danger/60 bg-transparent text-danger-text",
          "enabled:is-hover:border-danger enabled:is-hover:bg-danger-subtle",
        ],
        "danger-solid": [
          "border-danger-fill bg-danger-fill text-danger-ink",
          "enabled:is-hover:border-danger-fill-hover enabled:is-hover:bg-danger-fill-hover",
        ],
      },
      size: {
        sm: "h-[28px] min-w-[28px] px-[10px]",
        md: "h-8 min-w-8 px-3",
        lg: "h-[36px] min-w-[36px] px-4",
      },
      fullWidth: {
        // Full-width buttons are the phone pattern: 44 px touch height under 640 px.
        true: "w-full max-sm:h-[44px]",
        false: "",
      },
    },
    defaultVariants: { variant: "secondary", size: "md", fullWidth: false },
  },
);

type ButtonVariantProps = VariantProps<typeof buttonVariants>;

export interface ButtonProps
  extends
    Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children">,
    Omit<ButtonVariantProps, "fullWidth"> {
  children?: ReactNode;
  leadingIcon?: IconName;
  trailingIcon?: IconName;
  /** A trailing → that nudges on hover; the Signal call-to-action mark. */
  arrow?: boolean;
  /** Replaces the leading icon with a spinner, keeps the width and blocks clicks. */
  loading?: boolean;
  fullWidth?: boolean;
  /** Render the child element (a link) with button styles. */
  asChild?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant,
    size,
    fullWidth = false,
    leadingIcon,
    trailingIcon,
    arrow = false,
    loading = false,
    asChild = false,
    disabled,
    className,
    children,
    type = "button",
    ...rest
  },
  ref,
) {
  const iconSize = size === "sm" ? 12 : 14;
  const classes = cn(buttonVariants({ variant, size, fullWidth }), "group/button", className);

  if (asChild) {
    return (
      <Slot ref={ref} className={classes} {...rest}>
        {children}
      </Slot>
    );
  }

  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled === true || loading}
      aria-busy={loading || undefined}
      className={classes}
      {...rest}
    >
      {loading ? (
        <Spinner size={iconSize} decorative />
      ) : (
        leadingIcon !== undefined && <Icon name={leadingIcon} size={iconSize} />
      )}
      {children}
      {trailingIcon !== undefined && <Icon name={trailingIcon} size={iconSize} />}
      {arrow && (
        <span
          aria-hidden="true"
          className="transition-transform duration-[var(--dur-fast)] ease-[var(--ease-out)] group-hover/button:translate-x-[3px] group-disabled/button:translate-x-0 group-data-[force~=hover]/button:translate-x-[3px]"
        >
          →
        </span>
      )}
    </button>
  );
});
