export interface LumenMarkProps {
  size?: number;
  /** Monochrome renders the signal block in the current text color. */
  monochrome?: boolean;
  className?: string;
  /** Accessible name; omit when a visible "Lumen" label sits next to it. */
  label?: string;
}

/**
 * The Lumen mark: a square frame with a signal block in the top-right corner,
 * a light source seen through an instrument window.
 */
export function LumenMark({ size = 24, monochrome = false, className, label }: LumenMarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      role={label === undefined ? undefined : "img"}
      aria-label={label}
      aria-hidden={label === undefined ? true : undefined}
      focusable="false"
    >
      <rect x="1.5" y="1.5" width="21" height="21" stroke="currentColor" strokeWidth="1" />
      <rect
        x="12"
        y="5"
        width="7"
        height="7"
        style={{ fill: monochrome ? "currentColor" : "var(--color-accent)" }}
      />
    </svg>
  );
}
