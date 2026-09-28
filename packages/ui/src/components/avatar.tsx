"use client";

import { useState } from "react";

import { cn } from "../lib/cn";
import { initials } from "../lib/text";

/**
 * Identity tints. None of them is a status hue (success, warning, danger,
 * info), so a teammate's green circle is never read as "active": accent blue,
 * the violet glow, the sleeping slate and two neutrals.
 */
const TINTS = [
  "bg-accent-subtle text-accent-text",
  "bg-glow-b text-text",
  "bg-sleeping-subtle text-sleeping-text",
  "bg-surface-hover text-text",
  "bg-surface-raised text-text-secondary",
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
  /** How many initials to show; small overlapping avatars fit one. Default 2. */
  maxInitials?: 1 | 2;
  className?: string;
}

/**
 * A person or workspace. The initials are always drawn; an image fades in over
 * them once it has loaded, so a slow or broken image never shows the browser's
 * broken-image glyph.
 */
export function Avatar({
  name,
  alt,
  src,
  size = 24,
  shape = "circle",
  status,
  maxInitials = 2,
  className,
}: AvatarProps) {
  // Keyed by src so a new image starts hidden again.
  const [loaded, setLoaded] = useState<string | null>(null);
  const [broken, setBroken] = useState<string | null>(null);
  const shapeClass = shape === "circle" ? "rounded-full" : "rounded-control";
  const showImage = src !== undefined && broken !== src;
  const imageReady = showImage && loaded === src;
  return (
    <span
      role="img"
      aria-label={alt ?? name}
      className={cn("relative inline-flex shrink-0", className)}
    >
      <span
        aria-hidden="true"
        className={cn(
          "border-border inline-flex items-center justify-center border font-mono font-medium tracking-normal",
          SIZE[size],
          shapeClass,
          tintFor(name),
        )}
      >
        {initials(name, maxInitials)}
      </span>
      {showImage && (
        <img
          src={src}
          alt=""
          width={size}
          height={size}
          data-loaded={imageReady || undefined}
          // An image that finished before hydration never fires onLoad.
          ref={(node) => {
            if (node?.complete === true && node.naturalWidth > 0 && loaded !== src) {
              setLoaded(src);
            }
          }}
          onLoad={() => {
            setLoaded(src);
          }}
          onError={() => {
            setBroken(src);
          }}
          className={cn(
            "border-border absolute inset-0 border object-cover",
            SIZE[size],
            shapeClass,
            imageReady ? "opacity-100" : "opacity-0",
          )}
        />
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
