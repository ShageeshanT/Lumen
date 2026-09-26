import { cn } from "../lib/cn";

export interface SpinnerProps {
  size?: 12 | 14 | 16 | 20;
  /** Visually hidden text when the spinner stands alone. */
  label?: string;
  /** Inside a button that already has aria-busy: hide from assistive tech. */
  decorative?: boolean;
  className?: string;
}

/**
 * A 270° arc turning every 800 ms. It keeps turning under reduced motion
 * because it conveys ongoing work (WCAG 2.3.3 essential exception).
 */
export function Spinner({
  size = 14,
  label = "Loading",
  decorative = false,
  className,
}: SpinnerProps) {
  const svg = (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      focusable="false"
      className={cn("shrink-0", className)}
      style={{ animation: "lumen-spin var(--dur-spinner) linear infinite" }}
    >
      <path
        d="M8 1.75A6.25 6.25 0 1 1 1.75 8"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="square"
      />
    </svg>
  );
  if (decorative) {
    return svg;
  }
  return (
    <span role="status" className="inline-flex">
      {svg}
      <span className="sr-only">{label}</span>
    </span>
  );
}
