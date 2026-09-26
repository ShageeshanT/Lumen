import type { ReactNode } from "react";

import { Icon, type IconName } from "../icons/icon";
import { cn } from "../lib/cn";

export type BadgeVariant = "neutral" | "accent" | "success" | "warning" | "danger" | "outline";

const VARIANT: Record<BadgeVariant, string> = {
  neutral: "border-border bg-surface-raised text-text-secondary",
  accent: "border-accent/40 bg-accent-subtle text-accent-text",
  success: "border-success/40 bg-success-subtle text-success-text",
  warning: "border-warning/40 bg-warning-subtle text-warning-text",
  danger: "border-danger/40 bg-danger-subtle text-danger-text",
  outline: "border-border bg-transparent text-text-secondary",
};

export interface BadgeProps {
  variant?: BadgeVariant;
  size?: "sm" | "md";
  icon?: IconName;
  /** Count mode: tabular digits, "99+" above 99. */
  count?: number;
  children?: ReactNode;
  className?: string;
}

/** A small framed label: "PRODUCTION", "×3", "PREVIEW #42", or a count. */
export function Badge({
  variant = "neutral",
  size = "md",
  icon,
  count,
  children,
  className,
}: BadgeProps) {
  const content = count === undefined ? children : count > 99 ? "99+" : String(count);
  return (
    <span
      className={cn(
        "text-action rounded-kbd inline-flex shrink-0 items-center justify-center gap-1 border whitespace-nowrap",
        size === "sm" ? "h-4 px-1" : "h-5 px-[6px]",
        count !== undefined && "tabular min-w-5",
        VARIANT[variant],
        className,
      )}
    >
      {icon !== undefined && <Icon name={icon} size={12} />}
      {content}
    </span>
  );
}
