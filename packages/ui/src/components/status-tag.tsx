import { cn } from "../lib/cn";
import { STATUS, TONE_TEXT, type Status } from "../status/status";

import { StatusMarker } from "./status-marker";

export interface StatusTagProps {
  status: Status;
  /** Overrides the default word ("Live" for the active deployment card). */
  label?: string;
  /** Extra context after the word: "3 restarts", "restarting in 8s". */
  detail?: string;
  /**
   * Show the [ ] brackets. On by default, in 40 px rows and cards too; they
   * drop out on their own inside a dense (32 px, `data-dense`) table.
   */
  brackets?: boolean;
  size?: "sm" | "md";
  className?: string;
}

/**
 * Status in HUD notation: `[ ■ ACTIVE ]`. Always marker + color + word, never
 * color alone (SPEC C4, C11). The word is the accessible name.
 */
export function StatusTag({
  status,
  label,
  detail,
  brackets = true,
  size = "md",
  className,
}: StatusTagProps) {
  const def = STATUS[status];
  const word = label ?? def.label;
  return (
    <span
      data-status={status}
      className={cn(
        "text-action inline-flex max-w-full items-center gap-[6px] whitespace-nowrap",
        size === "sm" ? "h-[18px]" : "h-5",
        TONE_TEXT[def.tone],
        // Decorative brackets as pseudo-elements: dim like the HUD, invisible to assistive tech and contrast audits.
        brackets &&
          "before:text-text-muted after:text-text-muted before:content-['['] after:content-[']']",
        // Brackets stay everywhere except dense 32 px rows, which drop them for room.
        brackets && "[[data-dense]_&]:before:hidden [[data-dense]_&]:after:hidden",
        className,
      )}
    >
      <StatusMarker status={status} size={6} />
      <span className="truncate">
        {word}
        {detail !== undefined && (
          <span className="text-text-secondary">
            {" · "}
            {detail}
          </span>
        )}
      </span>
    </span>
  );
}
