import type { CSSProperties } from "react";

import { cn } from "../lib/cn";

export interface SkeletonProps {
  variant?: "block" | "text" | "circle";
  width?: number | string;
  height?: number | string;
  /** Text variant: number of lines; the last one is 60 % wide. */
  lines?: number;
  className?: string;
}

/**
 * A placeholder that matches the shape of what is loading. A slow light sweep
 * crosses it (1.6 s); under reduced motion it is a still two-tone block. The
 * parent region carries aria-busy; skeletons are hidden from assistive tech.
 */
export function Skeleton({
  variant = "block",
  width,
  height,
  lines = 3,
  className,
}: SkeletonProps) {
  const base =
    "bg-surface-hover relative overflow-hidden before:absolute before:inset-0 before:bg-linear-to-r before:from-transparent before:via-surface-raised/60 before:to-transparent before:animate-[lumen-shimmer_var(--dur-shimmer)_linear_infinite] motion-reduce:before:hidden";
  if (variant === "text") {
    return (
      <span aria-hidden="true" className={cn("flex w-full flex-col gap-2", className)}>
        {Array.from({ length: lines }, (_, index) => (
          <span
            key={index}
            className={cn(base, "rounded-kbd block h-3")}
            style={{ width: index === lines - 1 && lines > 1 ? "60%" : "100%" }}
          />
        ))}
      </span>
    );
  }
  const style: CSSProperties = {};
  if (width !== undefined) {
    style.width = width;
  }
  if (height !== undefined) {
    style.height = height;
  }
  return (
    <span
      aria-hidden="true"
      className={cn(
        base,
        "block",
        variant === "circle" ? "rounded-full" : "rounded-control",
        className,
      )}
      style={style}
    />
  );
}
