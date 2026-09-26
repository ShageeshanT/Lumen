import type { IconName } from "../icons/icon";

/** Every state a service, deployment or server can show (SPEC B4, C4). */
export const STATUSES = [
  "active",
  "building",
  "deploying",
  "failed",
  "crashed",
  "sleeping",
  "stopped",
  "queued",
  "skipped",
  "cancelled",
  "superseded",
  "removed",
  "online",
  "offline",
] as const;

export type Status = (typeof STATUSES)[number];

export type StatusTone = "success" | "warning" | "danger" | "sleeping" | "muted";

export interface StatusDefinition {
  /** The word shown in tags, always present next to the marker. */
  label: string;
  tone: StatusTone;
  /** Square marker, or a glyph when the shape itself carries meaning. */
  marker: "square" | IconName;
  /** Blinks like an LED while work is in progress. */
  live: boolean;
  /** Plain-text fallback glyph (SPEC C4) for places icons cannot render. */
  glyph: string;
}

export const STATUS: Record<Status, StatusDefinition> = {
  active: { label: "Active", tone: "success", marker: "square", live: false, glyph: "■" },
  building: { label: "Building", tone: "warning", marker: "square", live: true, glyph: "◐" },
  deploying: { label: "Deploying", tone: "warning", marker: "square", live: true, glyph: "◐" },
  failed: { label: "Failed", tone: "danger", marker: "x", live: false, glyph: "✕" },
  crashed: { label: "Crashed", tone: "danger", marker: "rotate-cw", live: false, glyph: "⟳" },
  sleeping: { label: "Sleeping", tone: "sleeping", marker: "moon", live: false, glyph: "☾" },
  stopped: { label: "Stopped", tone: "muted", marker: "square", live: false, glyph: "■" },
  queued: { label: "Queued", tone: "muted", marker: "ellipsis", live: false, glyph: "…" },
  skipped: { label: "Skipped", tone: "muted", marker: "minus", live: false, glyph: "–" },
  cancelled: { label: "Cancelled", tone: "muted", marker: "circle-slash", live: false, glyph: "⊘" },
  superseded: { label: "Superseded", tone: "muted", marker: "history", live: false, glyph: "↺" },
  removed: { label: "Removed", tone: "muted", marker: "history", live: false, glyph: "↺" },
  online: { label: "Online", tone: "success", marker: "square", live: false, glyph: "■" },
  offline: { label: "Offline", tone: "danger", marker: "square", live: false, glyph: "□" },
};

/** Text color class per tone (the -text tier holds 4.5:1). */
export const TONE_TEXT: Record<StatusTone, string> = {
  success: "text-success-text",
  warning: "text-warning-text",
  danger: "text-danger-text",
  sleeping: "text-sleeping-text",
  muted: "text-text-secondary",
};

/** Marker fill class per tone (the base tier holds 3:1 as a non-text shape). */
export const TONE_FILL: Record<StatusTone, string> = {
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  sleeping: "bg-sleeping",
  muted: "bg-text-muted",
};

/** Marker stroke class per tone for glyph markers. */
export const TONE_STROKE: Record<StatusTone, string> = {
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
  sleeping: "text-sleeping",
  muted: "text-text-secondary",
};
