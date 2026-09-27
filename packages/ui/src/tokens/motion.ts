/**
 * Motion constants for JavaScript-driven animation (the Motion library). The
 * CSS equivalents live in motion.css; keep both in sync.
 */
export const durations = {
  fast: 120,
  base: 200,
  slow: 300,
  exitFast: 80,
  exitBase: 120,
  spinner: 800,
  pulse: 1600,
  shimmer: 1600,
  /** Entrance per element; elements stagger by `stagger`. */
  reveal: 240,
  stagger: 45,
  /** Leader lines and connectors. */
  draw: 300,
  /** Once-per-page decode of a display title. */
  decode: 360,
  flow: 1400,
  breathe: 9000,
} as const;

export const easings = {
  out: [0, 0, 0.2, 1],
  panel: [0.2, 0.8, 0.2, 1],
  in: [0.4, 0, 1, 1],
} as const;

/** Settles in about 250 ms with no visible overshoot; canvas node moves and auto-layout. */
export const springCanvas = {
  type: "spring",
  stiffness: 500,
  damping: 40,
  mass: 1,
  restDelta: 0.5,
} as const;

/** Side panel width snap after a drag release. */
export const springPanel = { type: "spring", stiffness: 700, damping: 50 } as const;

/** Toast enter and stack re-flow. */
export const springToast = { type: "spring", stiffness: 600, damping: 45 } as const;

/** True when the OS or the account preference asks for reduced motion. */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  if (document.documentElement.dataset["reducedMotion"] === "true") {
    return true;
  }
  // jsdom and very old engines have no matchMedia: animate.
  const matchMedia: unknown = (window as Partial<Window>).matchMedia;
  if (typeof matchMedia !== "function") {
    return false;
  }
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
