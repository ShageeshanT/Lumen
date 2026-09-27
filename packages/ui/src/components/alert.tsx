"use client";

import { useState, type ReactNode } from "react";

import { Icon, type IconName } from "../icons/icon";
import { cn } from "../lib/cn";

import { Button } from "./button";
import { IconButton } from "./icon-button";

export type AlertVariant = "info" | "warning" | "danger";

export type AlertAction = { label: string } & (
  { onClick: () => void; href?: undefined } | { href: string; onClick?: undefined }
);

const VARIANT: Record<AlertVariant, { frame: string; icon: IconName; iconColor: string }> = {
  info: { frame: "border-info/40 bg-info-subtle", icon: "info", iconColor: "text-info" },
  warning: {
    frame: "border-warning/40 bg-warning-subtle",
    icon: "triangle-alert",
    iconColor: "text-warning",
  },
  danger: {
    frame: "border-danger/40 bg-danger-subtle",
    icon: "circle-alert",
    iconColor: "text-danger",
  },
};

export interface AlertProps {
  variant?: AlertVariant;
  title?: string;
  children?: ReactNode;
  action?: AlertAction;
  /** Shows a dismiss button. Ignored when `critical`. */
  dismissible?: boolean;
  onDismiss?: () => void;
  /** Cannot be dismissed: the problem is still there. */
  critical?: boolean;
  /** One line, 36 px tall. */
  compact?: boolean;
  /** Full-width page banner: square corners, no side borders. */
  global?: boolean;
  /**
   * The alert appeared after something happened (not on page load): info is
   * announced politely, warning and danger interrupt.
   */
  announce?: boolean;
  className?: string;
}

/**
 * An inline banner tinted by its variant. The icon, the tint and the words
 * all say the same thing, so color is never the only signal.
 */
export function Alert({
  variant = "info",
  title,
  children,
  action,
  dismissible = false,
  onDismiss,
  critical = false,
  compact = false,
  global = false,
  announce = false,
  className,
}: AlertProps) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) {
    return null;
  }
  const style = VARIANT[variant];
  const role = announce ? (variant === "info" ? "status" : "alert") : undefined;
  const canDismiss = dismissible && !critical;

  const actionButton =
    action === undefined ? null : action.href !== undefined ? (
      <Button asChild size="sm" variant="secondary">
        <a href={action.href}>{action.label}</a>
      </Button>
    ) : (
      <Button size="sm" variant="secondary" onClick={action.onClick}>
        {action.label}
      </Button>
    );

  return (
    <div
      role={role}
      data-variant={variant}
      className={cn(
        "flex w-full items-start gap-3 border",
        style.frame,
        compact ? "min-h-[36px] items-center px-3 py-1" : "px-4 py-3",
        global ? "rounded-none border-x-0" : "rounded-card",
        className,
      )}
    >
      <span className={cn("inline-flex shrink-0", style.iconColor, !compact && "pt-[2px]")}>
        <Icon name={style.icon} size={16} />
      </span>
      <div
        className={cn(
          "flex min-w-0 flex-1 flex-wrap gap-x-4 gap-y-2",
          compact ? "items-center" : "items-start",
        )}
      >
        <div
          className={cn(
            "flex min-w-[200px] flex-1 gap-x-2",
            compact ? "flex-row items-baseline truncate" : "flex-col gap-y-[2px]",
          )}
        >
          {title !== undefined && <p className="text-body font-medium">{title}</p>}
          {children !== undefined && (
            <div
              className={cn(
                "text-body-secondary text-text",
                title !== undefined && "text-text-secondary",
                compact && "truncate",
              )}
            >
              {children}
            </div>
          )}
        </div>
        {actionButton !== null && <div className="flex shrink-0 items-center">{actionButton}</div>}
      </div>
      {canDismiss && (
        <IconButton
          icon="x"
          label="Dismiss"
          size="sm"
          className={cn("-my-1 -mr-2 shrink-0", compact && "my-0")}
          onClick={() => {
            setDismissed(true);
            onDismiss?.();
          }}
        />
      )}
    </div>
  );
}
