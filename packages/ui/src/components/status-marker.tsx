import { Icon } from "../icons/icon";
import { cn } from "../lib/cn";
import { STATUS, TONE_FILL, TONE_STROKE, type Status } from "../status/status";

export interface StatusMarkerProps {
  status: Status;
  /** 6 inside tags, 8 standalone, 10 in server cards. */
  size?: 6 | 8 | 10;
  /**
   * When the marker stands alone (no visible status word next to it) it needs
   * a name. Leave false inside a StatusTag, where the text already says it.
   */
  standalone?: boolean;
  className?: string;
}

/**
 * The status marker: a square LED for most states, a glyph where the shape
 * itself carries meaning (failed ✕, crashed ⟳, sleeping ☾, queued …). Live
 * states blink; the blink stops under reduced motion and the marker stays lit.
 */
export function StatusMarker({
  status,
  size = 6,
  standalone = false,
  className,
}: StatusMarkerProps) {
  const def = STATUS[status];
  const a11y = standalone
    ? { role: "img" as const, "aria-label": def.label }
    : { "aria-hidden": true as const };

  if (def.marker === "square") {
    const hollow = status === "offline" || status === "stopped";
    return (
      <span
        {...a11y}
        data-status-marker={status}
        className={cn(
          "inline-block shrink-0",
          hollow ? "border border-current bg-transparent" : TONE_FILL[def.tone],
          hollow && (def.tone === "danger" ? "text-danger" : "text-text-muted"),
          def.live && "blink",
          className,
        )}
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <span
      {...a11y}
      data-status-marker={status}
      className={cn("inline-flex shrink-0", TONE_STROKE[def.tone], className)}
    >
      <Icon name={def.marker} size={size >= 10 ? 14 : 12} />
    </span>
  );
}
