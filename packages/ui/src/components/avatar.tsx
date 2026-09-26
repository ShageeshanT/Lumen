"use client";

import { useState } from "react";

import { cn } from "../lib/cn";
import { initials } from "../lib/text";

const TINTS = [
  "bg-accent-subtle text-accent-text",
  "bg-info-subtle text-info-text",
  "bg-success-subtle text-success-text",
  "bg-warning-subtle text-warning-text",
  "bg-danger-subtle text-danger-text",
  "bg-sleeping-subtle text-sleeping-text",
] as const;

/** Stable tint per name so a teammate keeps the same color everywhere. */
export function tintFor(name: string): (typeof TINTS)[number] {
  let hash = 0;
  for (const char of name) {
    hash = (hash * 31 + (char.codePointAt(0) ?? 0)) >>> 0;
  }
  return TINTS[hash % TINTS.length] ?? TINTS[0];
}

const SIZE = {
  20: "size-5 text-11",
  24: "size-6 text-11",
  32: "size-8 text-13",
} as const;

export interface AvatarProps {
  name: string;
  /** Required alternative text for the image; defaults to the name. */
  alt?: string;
  src?: string;
  size?: 20 | 24 | 32;
  /** Circle for people, square for workspaces. */
  shape?: "circle" | "square";
  status?: "online" | "offline";
  className?: string;
}

/** A person or workspace. Falls back to initials when there is no image or it fails to load. */
export function Avatar({
  name,
  alt,
  src,
  size = 24,
  shape = "circle",
  status,
  className,
}: AvatarProps) {
  const [broken, setBroken] = useState(false);
  const showImage = src !== undefined && !broken;
  return (
    <span className={cn("relative inline-flex shrink-0", className)}>
      {showImage ? (
        <img
          src={src}
          alt={alt ?? name}
          width={size}
          height={size}
          onError={() => {
            setBroken(true);
          }}
          className={cn(
            "border-border border object-cover",
            SIZE[size],
            shape === "circle" ? "rounded-full" : "rounded-control",
          )}
        />
      ) : (
        <span
          role="img"
          aria-label={alt ?? name}
          className={cn(
            "border-border inline-flex items-center justify-center border font-mono font-medium tracking-normal",
            SIZE[size],
            shape === "circle" ? "rounded-full" : "rounded-control",
            tintFor(name),
          )}
        >
          <span aria-hidden="true">{initials(name)}</span>
        </span>
      )}
      {status !== undefined && size === 32 && (
        <span
          aria-hidden="true"
          className={cn(
            "border-surface absolute -right-px -bottom-px size-2 border-2",
            status === "online" ? "bg-success" : "bg-danger",
          )}
        />
      )}
    </span>
  );
}
