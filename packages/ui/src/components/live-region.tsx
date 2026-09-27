export interface LiveRegionProps {
  /** The sentence to announce. Changing it announces the new text. */
  message: string;
  /** "polite" waits for the reader to finish; "assertive" interrupts (errors only). */
  politeness?: "polite" | "assertive";
  className?: string;
}

/**
 * A visually hidden announcer. Components that change on their own (a deploy
 * step ticking over, a chart crosshair moved by the keyboard) mirror a short
 * sentence here so screen-reader users hear what sighted users see.
 */
export function LiveRegion({ message, politeness = "polite", className }: LiveRegionProps) {
  return (
    <span
      className={className ?? "sr-only"}
      role={politeness === "assertive" ? "alert" : "status"}
      aria-live={politeness}
      aria-atomic="true"
    >
      {message}
    </span>
  );
}
